// net.cpp — fetch, EventSource, WebSocket with browser-compatible polyfill
// Requires: libcurl, libwebsockets, OpenSSL

#include "net.hpp"

extern "C" {
#include "quickjs.h"
}

#include <curl/curl.h>
#include <libwebsockets.h>

#include <atomic>
#include <cstring>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

// ─── curl global init ─────────────────────────────────────────────────────────

static void ensureCurlInit() {
    static std::once_flag f;
    std::call_once(f, [] { curl_global_init(CURL_GLOBAL_ALL); });
}

// ─── NetEvent ─────────────────────────────────────────────────────────────────

enum class NetEventType { FetchDone, SSEOpen, SSEMessage, SSEError, SSEClose,
                           WSOpen, WSMessage, WSError, WSClose };

struct NetEvent {
    NetEventType type;
    int          handleId     = 0;
    int          status       = 0;
    bool         ok           = false;
    std::string  data;
    std::string  error;
    std::vector<std::string> headers;  // alternating k,v for FetchDone
    // fetch extras
    std::string  statusText;
    std::string  effectiveUrl;
    bool         redirected   = false;
    // SSE extras
    std::string  sseEventType;    // empty → "message"
    std::string  sseLastEventId;
    // WS extras
    bool         binary       = false;
    int          wsCloseCode  = 1000;
    std::string  wsCloseReason;
    bool         wsWasClean   = false;
};

// ─── Thread-safe event queue ──────────────────────────────────────────────────

struct NetEventQueue {
    std::mutex            mtx;
    std::vector<NetEvent> events;
    void push(NetEvent ev) { std::lock_guard<std::mutex> lk(mtx); events.push_back(std::move(ev)); }
    std::vector<NetEvent> drain() {
        std::lock_guard<std::mutex> lk(mtx);
        std::vector<NetEvent> out; out.swap(events); return out;
    }
};

// ─── SSEHandle ────────────────────────────────────────────────────────────────

struct SSEHandle {
    int                                id;
    std::atomic<bool>                  stop{false};
    std::thread                        thread;
    std::shared_ptr<NetEventQueue>     queue;
    std::shared_ptr<std::atomic<bool>> netCtxStopped;
    SSEHandle() = default;
    SSEHandle(const SSEHandle&) = delete;
    SSEHandle& operator=(const SSEHandle&) = delete;
};

// ─── WSHandle ─────────────────────────────────────────────────────────────────

struct WSHandle {
    int                                id;
    std::atomic<bool>                  stop{false};
    std::thread                        thread;
    std::shared_ptr<NetEventQueue>     queue;
    std::shared_ptr<std::atomic<bool>> netCtxStopped;
    // send queue — protected by sendMtx; bool = isBinary
    std::mutex                         sendMtx;
    std::deque<std::pair<std::string,bool>> sendQueue;
    bool                               wantClose  = false;
    uint16_t                           closeCode  = 1000;
    std::string                        closeReason;
    // set by runWSThread
    struct lws_context*                lwsCtx{nullptr};
    struct lws*                        wsi{nullptr};
    WSHandle() = default;
    WSHandle(const WSHandle&) = delete;
    WSHandle& operator=(const WSHandle&) = delete;
};

// ─── NetCtx ──────────────────────────────────────────────────────────────────

struct NetCtx {
    std::shared_ptr<std::atomic<bool>>         stopped;
    std::shared_ptr<NetEventQueue>             queue;
    // Fetch: id → {resolve, reject}
    std::map<int,std::pair<JSValue,JSValue>>   pendingFetches;
    // Abort flags shared with fetch threads
    std::map<int,std::shared_ptr<std::atomic<bool>>> abortFlags;
    // SSE
    std::map<int,std::shared_ptr<SSEHandle>>   sseHandles;
    std::map<int,JSValue>                      sseObjects;
    // WS
    std::map<int,std::shared_ptr<WSHandle>>    wsHandles;
    std::map<int,JSValue>                      wsObjects;

    int nextFetchId  = 1;
    int nextSSEId    = 1;
    int nextWSId     = 1;
    int nextAbortId  = 1;

    NetCtx()
        : stopped(std::make_shared<std::atomic<bool>>(false))
        , queue(std::make_shared<NetEventQueue>()) {}
};

// ─── Global context map ───────────────────────────────────────────────────────

static std::mutex                              s_ctxMapMtx;
static std::unordered_map<JSContext*,NetCtx*>  s_ctxMap;

static NetCtx* getNetCtx(JSContext* ctx) {
    std::lock_guard<std::mutex> lk(s_ctxMapMtx);
    auto it = s_ctxMap.find(ctx);
    return (it != s_ctxMap.end()) ? it->second : nullptr;
}

// ─── URL parser ──────────────────────────────────────────────────────────────

struct ParsedURL { std::string scheme,host,path; int port=80; bool useTLS=false; };

static ParsedURL parseURL(const std::string& url) {
    ParsedURL p;
    auto sep = url.find("://");
    if (sep == std::string::npos) { p.host=url; p.path="/"; return p; }
    p.scheme = url.substr(0,sep);
    p.useTLS = (p.scheme=="https"||p.scheme=="wss");
    p.port   = p.useTLS ? 443 : 80;
    std::string rest = url.substr(sep+3);
    auto pp = rest.find('/');
    std::string hostPort = (pp==std::string::npos) ? rest : rest.substr(0,pp);
    p.path = (pp==std::string::npos) ? "/" : rest.substr(pp);
    auto cp = hostPort.rfind(':');
    if (cp!=std::string::npos) {
        p.host=hostPort.substr(0,cp);
        try { p.port=std::stoi(hostPort.substr(cp+1)); } catch(...) {}
    } else p.host=hostPort;
    return p;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

struct FetchWriteCtx {
    std::string              body;
    std::vector<std::string> headerKV;
    std::string              statusText;
};

static size_t fetchBody(char* p, size_t sz, size_t nm, void* ud) {
    static_cast<FetchWriteCtx*>(ud)->body.append(p, sz*nm); return sz*nm;
}
static size_t fetchHeader(char* buf, size_t sz, size_t ni, void* ud) {
    auto* f = static_cast<FetchWriteCtx*>(ud);
    std::string ln(buf, sz*ni);
    while (!ln.empty() && (ln.back()=='\r'||ln.back()=='\n')) ln.pop_back();
    if (ln.rfind("HTTP/",0)==0) {
        auto s1=ln.find(' '); if (s1!=std::string::npos) {
            auto s2=ln.find(' ',s1+1); if (s2!=std::string::npos) f->statusText=ln.substr(s2+1);
        }
        return sz*ni;
    }
    auto c=ln.find(':');
    if (c!=std::string::npos) {
        std::string k=ln.substr(0,c), v=ln.substr(c+1);
        auto vs=v.find_first_not_of(" \t");
        if (vs!=std::string::npos) v=v.substr(vs);
        for (auto& ch:k) ch=(char)tolower((unsigned char)ch);
        f->headerKV.push_back(std::move(k)); f->headerKV.push_back(std::move(v));
    }
    return sz*ni;
}

struct FetchOptions { std::string method="GET"; std::vector<std::string> headerKV; std::string body; };

struct FetchAbortCtx { std::shared_ptr<std::atomic<bool>> flag; };
static int fetchProgress(void* ud, curl_off_t,curl_off_t,curl_off_t,curl_off_t) {
    auto* a=static_cast<FetchAbortCtx*>(ud);
    return (a->flag && a->flag->load()) ? 1 : 0;
}

static void runFetchThread(std::string url, FetchOptions opts, int fetchId,
    std::shared_ptr<NetEventQueue> queue,
    std::shared_ptr<std::atomic<bool>> stopped,
    std::shared_ptr<std::atomic<bool>> abortFlag)
{
    CURL* curl = curl_easy_init();
    NetEvent ev; ev.type=NetEventType::FetchDone; ev.handleId=fetchId;
    if (!curl) { ev.error="curl_easy_init failed"; if (!stopped->load()) queue->push(std::move(ev)); return; }

    FetchWriteCtx fctx;
    FetchAbortCtx actx{abortFlag};
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, fetchBody);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &fctx);
    curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, fetchHeader);
    curl_easy_setopt(curl, CURLOPT_HEADERDATA, &fctx);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);
    curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
    curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, fetchProgress);
    curl_easy_setopt(curl, CURLOPT_XFERINFODATA, &actx);

    if (opts.method=="POST") {
        curl_easy_setopt(curl, CURLOPT_POST, 1L);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, opts.body.c_str());
        curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)opts.body.size());
    } else if (opts.method!="GET") {
        curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, opts.method.c_str());
        if (!opts.body.empty()) {
            curl_easy_setopt(curl, CURLOPT_POSTFIELDS, opts.body.c_str());
            curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)opts.body.size());
        }
    }
    struct curl_slist* hdrs=nullptr;
    for (size_t i=0;i+1<opts.headerKV.size();i+=2)
        hdrs=curl_slist_append(hdrs,(opts.headerKV[i]+": "+opts.headerKV[i+1]).c_str());
    if (hdrs) curl_easy_setopt(curl, CURLOPT_HTTPHEADER, hdrs);

    CURLcode res = curl_easy_perform(curl);
    if (hdrs) curl_slist_free_all(hdrs);

    if (res==CURLE_ABORTED_BY_CALLBACK) {
        ev.error="__ABORT__";
    } else if (res!=CURLE_OK) {
        ev.error=curl_easy_strerror(res);
    } else {
        long code=0; curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &code);
        ev.status=(int)code; ev.ok=(code>=200&&code<300);
        ev.data=std::move(fctx.body); ev.headers=std::move(fctx.headerKV);
        ev.statusText=std::move(fctx.statusText);
        char* eu=nullptr; curl_easy_getinfo(curl, CURLINFO_EFFECTIVE_URL, &eu);
        if (eu) ev.effectiveUrl=eu;
        long rc=0; curl_easy_getinfo(curl, CURLINFO_REDIRECT_COUNT, &rc);
        ev.redirected=(rc>0);
    }
    curl_easy_cleanup(curl);
    if (!stopped->load()) queue->push(std::move(ev));
}

// ─── SSE ─────────────────────────────────────────────────────────────────────

static void runSSEThread(std::string url, int sseId,
    std::shared_ptr<NetEventQueue> queue,
    std::shared_ptr<std::atomic<bool>> netCtxStopped,
    std::atomic<bool>* handleStop)
{
    CURL* curl=curl_easy_init();
    if (!curl) {
        if (!netCtxStopped->load())
            queue->push({NetEventType::SSEError,sseId,0,false,"","curl_easy_init failed"});
        return;
    }

    struct Ctx {
        std::string buf; bool opened=false;
        int sseId;
        std::shared_ptr<NetEventQueue> queue;
        std::shared_ptr<std::atomic<bool>> stopped;
        std::atomic<bool>* handleStop;

        void dispatch() {
            while (true) {
                auto d=buf.find("\n\n"); if (d==std::string::npos) break;
                std::string frame=buf.substr(0,d); buf=buf.substr(d+2);
                std::string data,evType,lastId;
                std::istringstream ss(frame); std::string ln;
                while (std::getline(ss,ln)) {
                    if (!ln.empty()&&ln.back()=='\r') ln.pop_back();
                    if (ln.rfind("data:",0)==0) {
                        std::string s=ln.substr(5); if (!s.empty()&&s[0]==' ') s=s.substr(1);
                        if (!data.empty()) data+="\n"; data+=s;
                    } else if (ln.rfind("event:",0)==0) {
                        evType=ln.substr(6); if (!evType.empty()&&evType[0]==' ') evType=evType.substr(1);
                    } else if (ln.rfind("id:",0)==0) {
                        lastId=ln.substr(3); if (!lastId.empty()&&lastId[0]==' ') lastId=lastId.substr(1);
                    }
                }
                if (!stopped->load()&&!handleStop->load()) {
                    NetEvent ev; ev.type=NetEventType::SSEMessage; ev.handleId=sseId;
                    ev.data=std::move(data); ev.sseEventType=std::move(evType); ev.sseLastEventId=std::move(lastId);
                    queue->push(std::move(ev));
                }
            }
        }
    };

    auto c=std::make_unique<Ctx>();
    c->sseId=sseId; c->queue=queue; c->stopped=netCtxStopped; c->handleStop=handleStop;

    auto wf=[](char* p,size_t sz,size_t nm,void* ud)->size_t {
        auto* w=static_cast<Ctx*>(ud); size_t total=sz*nm;
        if (!w->opened) { w->opened=true;
            if (!w->stopped->load()&&!w->handleStop->load())
                w->queue->push({NetEventType::SSEOpen,w->sseId});
        }
        w->buf.append(p,total); w->dispatch();
        if (w->handleStop->load()) return 0;
        return total;
    };

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, +wf);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, c.get());
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 15L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 0L);
    struct curl_slist* hdrs=nullptr;
    hdrs=curl_slist_append(hdrs,"Accept: text/event-stream");
    hdrs=curl_slist_append(hdrs,"Cache-Control: no-cache");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, hdrs);

    CURLcode res=curl_easy_perform(curl);
    curl_slist_free_all(hdrs); curl_easy_cleanup(curl);

    if (!netCtxStopped->load()&&!handleStop->load()) {
        if (res!=CURLE_OK&&res!=CURLE_WRITE_ERROR)
            queue->push({NetEventType::SSEError,sseId,0,false,"",curl_easy_strerror(res)});
        queue->push({NetEventType::SSEClose,sseId});
    }
}

// ─── WebSocket (LWS) ──────────────────────────────────────────────────────────

struct LWSConnData { WSHandle* handle; bool opened=false; };

static int lwsCallback(struct lws* wsi, enum lws_callback_reasons reason,
                       void* user, void* in, size_t len)
{
    auto* conn=static_cast<LWSConnData*>(user);
    if (!conn) return 0;

    if (reason == LWS_CALLBACK_WSI_CREATE) {
        conn->handle = static_cast<WSHandle*>(lws_get_opaque_user_data(wsi));
        return 0;
    }

    WSHandle* h = conn->handle;
    if (!h) h = static_cast<WSHandle*>(lws_get_opaque_user_data(wsi));
    if (!h) return 0;

    switch (reason) {
    case LWS_CALLBACK_CLIENT_ESTABLISHED: {
        conn->opened=true;
        if (!h->netCtxStopped->load()&&!h->stop.load())
            h->queue->push({NetEventType::WSOpen,h->id});
        std::lock_guard<std::mutex> lk(h->sendMtx);
        if (!h->sendQueue.empty()||h->wantClose) lws_callback_on_writable(wsi);
        break;
    }
    case LWS_CALLBACK_CLIENT_RECEIVE: {
        if (!h->netCtxStopped->load()&&!h->stop.load()) {
            NetEvent ev; ev.type=NetEventType::WSMessage; ev.handleId=h->id;
            ev.data=std::string(static_cast<const char*>(in),len);
            ev.binary=lws_frame_is_binary(wsi);
            h->queue->push(std::move(ev));
        }
        break;
    }
    case LWS_CALLBACK_CLIENT_WRITEABLE: {
        bool doClose=false;
        std::pair<std::string,bool> item;
        bool hasSend=false;
        {
            std::lock_guard<std::mutex> lk(h->sendMtx);
            doClose=h->wantClose;
            if (!doClose&&!h->sendQueue.empty()) {
                item=std::move(h->sendQueue.front()); h->sendQueue.pop_front(); hasSend=true;
            }
        }
        if (doClose) {
            lws_close_reason(wsi,(lws_close_status)h->closeCode,
                reinterpret_cast<unsigned char*>(h->closeReason.data()),h->closeReason.size());
            return -1;
        }
        if (hasSend) {
            auto wp=item.second?LWS_WRITE_BINARY:LWS_WRITE_TEXT;
            std::vector<unsigned char> buf(LWS_PRE+item.first.size());
            memcpy(buf.data()+LWS_PRE,item.first.data(),item.first.size());
            lws_write(wsi,buf.data()+LWS_PRE,item.first.size(),wp);
            std::lock_guard<std::mutex> lk(h->sendMtx);
            if (!h->sendQueue.empty()||h->wantClose) lws_callback_on_writable(wsi);
        }
        break;
    }
    case LWS_CALLBACK_CLIENT_CONNECTION_ERROR: {
        std::string err=in?std::string(static_cast<const char*>(in),len):"connection error";
        if (!h->netCtxStopped->load()&&!h->stop.load()) {
            h->queue->push({NetEventType::WSError,h->id,0,false,"",std::move(err)});
        }
        h->stop.store(true);
        break;
    }
    case LWS_CALLBACK_CLIENT_CLOSED:
    case LWS_CALLBACK_CLOSED: {
        if (!h->netCtxStopped->load()&&!h->stop.load()) {
            NetEvent ev; ev.type=NetEventType::WSClose; ev.handleId=h->id;
            {
                std::lock_guard<std::mutex> lk(h->sendMtx);
                ev.wsCloseCode  = h->wantClose?(int)h->closeCode:1000;
                ev.wsCloseReason= h->wantClose?h->closeReason:"";
            }
            ev.wsWasClean=true;
            h->queue->push(std::move(ev));
        }
        h->stop.store(true);
        break;
    }
    default: break;
    }
    return 0;
}

static void runWSThread(std::string url, int wsId,
    std::shared_ptr<NetEventQueue> queue,
    std::shared_ptr<std::atomic<bool>> netCtxStopped,
    WSHandle* handle)
{
    lws_set_log_level(LLL_ERR,nullptr);
    ParsedURL parsed=parseURL(url);

    static const struct lws_protocols protos[]={
        {"rayact-ws",lwsCallback,sizeof(LWSConnData),65536,0,nullptr,0},
        {nullptr,nullptr,0,0,0,nullptr,0}
    };
    struct lws_context_creation_info ci{};
    ci.port=CONTEXT_PORT_NO_LISTEN; ci.protocols=protos;
    ci.options=LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT;
    struct lws_context* lwsCtx=lws_create_context(&ci);
    if (!lwsCtx) {
        if (!netCtxStopped->load()&&!handle->stop.load())
            queue->push({NetEventType::WSError,wsId,0,false,"","lws_create_context failed"});
        return;
    }
    handle->lwsCtx=lwsCtx;

    std::string hostHdr = parsed.host;
    if (parsed.port != (parsed.useTLS ? 443 : 80))
        hostHdr += ":" + std::to_string(parsed.port);

    struct lws_client_connect_info cc{};
    cc.context=lwsCtx; cc.address=parsed.host.c_str(); cc.port=parsed.port;
    cc.path=parsed.path.c_str(); cc.host=hostHdr.c_str(); cc.origin=parsed.host.c_str();
    cc.protocol=protos[0].name;
    cc.opaque_user_data=handle;
    if (parsed.useTLS) cc.ssl_connection=LCCSCF_USE_SSL;

    struct lws* wsi=lws_client_connect_via_info(&cc);
    if (!wsi) {
        if (!netCtxStopped->load()&&!handle->stop.load())
            queue->push({NetEventType::WSError,wsId,0,false,"","connect failed"});
        lws_context_destroy(lwsCtx); handle->lwsCtx=nullptr; return;
    }
    handle->wsi=wsi;

    while (!handle->stop.load()) {
        lws_service(lwsCtx,50);
        std::lock_guard<std::mutex> lk(handle->sendMtx);
        if ((!handle->sendQueue.empty()||handle->wantClose)&&wsi)
            lws_callback_on_writable(wsi);
    }

    lws_context_destroy(lwsCtx);
    handle->lwsCtx=nullptr; handle->wsi=nullptr;
}

// ─── drainNetEvents helpers ───────────────────────────────────────────────────

static JSValue makeEvent(JSContext* ctx, const char* ctorName, const char* type, JSValue init) {
    JSValue global=JS_GetGlobalObject(ctx);
    JSValue ctor=JS_GetPropertyStr(ctx,global,ctorName);
    JS_FreeValue(ctx,global);
    JSValue typeArg=JS_NewString(ctx,type);
    JSValue args[2]={typeArg,init};
    JSValue ev=JS_CallConstructor(ctx,ctor,2,args);
    JS_FreeValue(ctx,ctor); JS_FreeValue(ctx,typeArg);
    if (JS_IsException(ev)) {
        JSValue exc=JS_GetException(ctx);
        const char* s=JS_ToCString(ctx,exc);
        fprintf(stderr,"[net] makeEvent %s('%s') threw: %s\n",ctorName,type,s?s:"?");
        if (s) JS_FreeCString(ctx,s); JS_FreeValue(ctx,exc);
        return JS_UNDEFINED;
    }
    return ev;
}

static void jsDispatch(JSContext* ctx, JSValue obj, JSValue event) {
    JSValue fn=JS_GetPropertyStr(ctx,obj,"dispatchEvent");
    if (JS_IsFunction(ctx,fn)) {
        JSValue r=JS_Call(ctx,fn,obj,1,&event);
        if (JS_IsException(r)) {
            JSValue exc=JS_GetException(ctx);
            const char* s=JS_ToCString(ctx,exc);
            fprintf(stderr,"[net] dispatchEvent threw: %s\n",s?s:"?");
            if (s) JS_FreeCString(ctx,s); JS_FreeValue(ctx,exc);
        }
        JS_FreeValue(ctx,r);
    }
    JS_FreeValue(ctx,fn);
}

static JSValue buildRawFetch(JSContext* ctx, const NetEvent& ev) {
    JSValue raw=JS_NewObject(ctx);
    JS_SetPropertyStr(ctx,raw,"status",     JS_NewInt32(ctx,ev.status));
    JS_SetPropertyStr(ctx,raw,"statusText", JS_NewString(ctx,ev.statusText.c_str()));
    JS_SetPropertyStr(ctx,raw,"ok",         JS_NewBool(ctx,ev.ok));
    JS_SetPropertyStr(ctx,raw,"body",       JS_NewStringLen(ctx,ev.data.c_str(),ev.data.size()));
    JS_SetPropertyStr(ctx,raw,"url",        JS_NewString(ctx,ev.effectiveUrl.c_str()));
    JS_SetPropertyStr(ctx,raw,"redirected", JS_NewBool(ctx,ev.redirected));
    // headers as [[k,v], ...] array
    JSValue ha=JS_NewArray(ctx);
    for (size_t i=0;i+1<ev.headers.size();i+=2) {
        JSValue pair=JS_NewArray(ctx);
        JS_SetPropertyUint32(ctx,pair,0,JS_NewString(ctx,ev.headers[i].c_str()));
        JS_SetPropertyUint32(ctx,pair,1,JS_NewString(ctx,ev.headers[i+1].c_str()));
        JS_SetPropertyUint32(ctx,ha,(uint32_t)(i/2),pair);
        JS_FreeValue(ctx,pair);
    }
    JS_SetPropertyStr(ctx,raw,"headers",ha);
    return raw;
}

// ─── drainNetEvents ───────────────────────────────────────────────────────────

void drainNetEvents(JSContext* ctx) {
    NetCtx* nc=getNetCtx(ctx); if (!nc) return;
    auto events=nc->queue->drain(); if (events.empty()) return;
    JSRuntime* rt=JS_GetRuntime(ctx);

    for (auto& ev:events) {
        if (nc->stopped->load()) break;
        switch (ev.type) {

        case NetEventType::FetchDone: {
            auto it=nc->pendingFetches.find(ev.handleId);
            if (it==nc->pendingFetches.end()) break;
            auto [resolve,reject]=it->second;
            nc->pendingFetches.erase(it);
            if (ev.error=="__ABORT__") {
                JSValue global=JS_GetGlobalObject(ctx);
                JSValue DCtor=JS_GetPropertyStr(ctx,global,"DOMException");
                JS_FreeValue(ctx,global);
                JSValue args[2]={JS_NewString(ctx,"The operation was aborted"),JS_NewString(ctx,"AbortError")};
                JSValue exc=JS_CallConstructor(ctx,DCtor,2,args);
                JS_FreeValue(ctx,DCtor); JS_FreeValue(ctx,args[0]); JS_FreeValue(ctx,args[1]);
                JSValue r=JS_Call(ctx,reject,JS_UNDEFINED,1,&exc);
                JS_FreeValue(ctx,r); JS_FreeValue(ctx,exc);
            } else if (!ev.error.empty()) {
                JSValue err=JS_NewError(ctx);
                JS_SetPropertyStr(ctx,err,"message",JS_NewString(ctx,ev.error.c_str()));
                JSValue r=JS_Call(ctx,reject,JS_UNDEFINED,1,&err);
                JS_FreeValue(ctx,r); JS_FreeValue(ctx,err);
            } else {
                JSValue raw=buildRawFetch(ctx,ev);
                JSValue r=JS_Call(ctx,resolve,JS_UNDEFINED,1,&raw);
                JS_FreeValue(ctx,r); JS_FreeValue(ctx,raw);
            }
            JS_FreeValue(ctx,resolve); JS_FreeValue(ctx,reject);
            break;
        }

        case NetEventType::SSEOpen: {
            auto it=nc->sseObjects.find(ev.handleId);
            if (it==nc->sseObjects.end()) break;
            JS_SetPropertyStr(ctx,it->second,"readyState",JS_NewInt32(ctx,1));
            JSValue init=JS_NewObject(ctx);
            JSValue e=makeEvent(ctx,"Event","open",init); JS_FreeValue(ctx,init);
            if (!JS_IsUndefined(e)) { jsDispatch(ctx,it->second,e); JS_FreeValue(ctx,e); }
            break;
        }
        case NetEventType::SSEMessage: {
            auto it=nc->sseObjects.find(ev.handleId);
            if (it==nc->sseObjects.end()) break;
            JSValue init=JS_NewObject(ctx);
            JS_SetPropertyStr(ctx,init,"data",JS_NewString(ctx,ev.data.c_str()));
            JS_SetPropertyStr(ctx,init,"lastEventId",JS_NewString(ctx,ev.sseLastEventId.c_str()));
            const char* t=ev.sseEventType.empty()?"message":ev.sseEventType.c_str();
            JSValue e=makeEvent(ctx,"MessageEvent",t,init); JS_FreeValue(ctx,init);
            if (!JS_IsUndefined(e)) { jsDispatch(ctx,it->second,e); JS_FreeValue(ctx,e); }
            break;
        }
        case NetEventType::SSEError: {
            auto it=nc->sseObjects.find(ev.handleId);
            if (it==nc->sseObjects.end()) break;
            JSValue init=JS_NewObject(ctx);
            JS_SetPropertyStr(ctx,init,"message",JS_NewString(ctx,ev.error.c_str()));
            JSValue e=makeEvent(ctx,"ErrorEvent","error",init); JS_FreeValue(ctx,init);
            if (!JS_IsUndefined(e)) { jsDispatch(ctx,it->second,e); JS_FreeValue(ctx,e); }
            break;
        }
        case NetEventType::SSEClose: {
            auto hit=nc->sseHandles.find(ev.handleId);
            if (hit!=nc->sseHandles.end()) {
                if (hit->second->thread.joinable()) hit->second->thread.join();
                nc->sseHandles.erase(hit);
            }
            auto it=nc->sseObjects.find(ev.handleId);
            if (it!=nc->sseObjects.end()) {
                JS_SetPropertyStr(ctx,it->second,"readyState",JS_NewInt32(ctx,2));
                // fire 'error' — SSE connection dropped (browser does the same)
                JSValue init=JS_NewObject(ctx);
                JSValue e=makeEvent(ctx,"Event","error",init); JS_FreeValue(ctx,init);
                if (!JS_IsUndefined(e)) { jsDispatch(ctx,it->second,e); JS_FreeValue(ctx,e); }
                JS_FreeValue(ctx,it->second); nc->sseObjects.erase(it);
            }
            break;
        }

        case NetEventType::WSOpen: {
            auto it=nc->wsObjects.find(ev.handleId);
            if (it==nc->wsObjects.end()) break;
            JS_SetPropertyStr(ctx,it->second,"readyState",JS_NewInt32(ctx,1));
            JSValue init=JS_NewObject(ctx);
            JSValue e=makeEvent(ctx,"Event","open",init); JS_FreeValue(ctx,init);
            if (!JS_IsUndefined(e)) { jsDispatch(ctx,it->second,e); JS_FreeValue(ctx,e); }
            break;
        }
        case NetEventType::WSMessage: {
            auto it=nc->wsObjects.find(ev.handleId);
            if (it==nc->wsObjects.end()) break;
            JSValue init=JS_NewObject(ctx);
            if (ev.binary) {
                JSValue ab=JS_NewArrayBufferCopy(ctx,
                    reinterpret_cast<const uint8_t*>(ev.data.data()),ev.data.size());
                JS_SetPropertyStr(ctx,init,"data",ab);
            } else {
                JS_SetPropertyStr(ctx,init,"data",JS_NewStringLen(ctx,ev.data.c_str(),ev.data.size()));
            }
            JSValue e=makeEvent(ctx,"MessageEvent","message",init); JS_FreeValue(ctx,init);
            if (!JS_IsUndefined(e)) { jsDispatch(ctx,it->second,e); JS_FreeValue(ctx,e); }
            break;
        }
        case NetEventType::WSError: {
            auto it=nc->wsObjects.find(ev.handleId);
            if (it==nc->wsObjects.end()) break;
            JSValue init=JS_NewObject(ctx);
            JS_SetPropertyStr(ctx,init,"message",JS_NewString(ctx,ev.error.c_str()));
            JSValue e=makeEvent(ctx,"ErrorEvent","error",init); JS_FreeValue(ctx,init);
            if (!JS_IsUndefined(e)) { jsDispatch(ctx,it->second,e); JS_FreeValue(ctx,e); }
            break;
        }
        case NetEventType::WSClose: {
            auto hit=nc->wsHandles.find(ev.handleId);
            if (hit!=nc->wsHandles.end()) {
                hit->second->stop.store(true);
                if (hit->second->lwsCtx) lws_cancel_service(hit->second->lwsCtx);
                if (hit->second->thread.joinable()) hit->second->thread.join();
                nc->wsHandles.erase(hit);
            }
            auto it=nc->wsObjects.find(ev.handleId);
            if (it!=nc->wsObjects.end()) {
                JS_SetPropertyStr(ctx,it->second,"readyState",JS_NewInt32(ctx,3));
                JSValue init=JS_NewObject(ctx);
                JS_SetPropertyStr(ctx,init,"code",  JS_NewInt32(ctx,ev.wsCloseCode));
                JS_SetPropertyStr(ctx,init,"reason",JS_NewString(ctx,ev.wsCloseReason.c_str()));
                JS_SetPropertyStr(ctx,init,"wasClean",JS_NewBool(ctx,ev.wsWasClean));
                JSValue e=makeEvent(ctx,"CloseEvent","close",init); JS_FreeValue(ctx,init);
                if (!JS_IsUndefined(e)) { jsDispatch(ctx,it->second,e); JS_FreeValue(ctx,e); }
                JS_FreeValue(ctx,it->second); nc->wsObjects.erase(it);
            }
            break;
        }
        }
    }
    JSContext* pctx=nullptr;
    while (JS_ExecutePendingJob(rt,&pctx)>0) {}
}

// ─── Native backend JS functions ──────────────────────────────────────────────

// __native_fetch(url, {method,headers,body}, abortId) → Promise<rawObj>
static JSValue js_native_fetch(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc<1||!JS_IsString(argv[0]))
        return JS_ThrowTypeError(ctx,"__native_fetch: expected URL string");
    const char* urlC=JS_ToCString(ctx,argv[0]); if (!urlC) return JS_EXCEPTION;
    std::string url(urlC); JS_FreeCString(ctx,urlC);

    FetchOptions opts;
    if (argc>=2&&JS_IsObject(argv[1])) {
        JSValue mv=JS_GetPropertyStr(ctx,argv[1],"method");
        if (JS_IsString(mv)) { const char* m=JS_ToCString(ctx,mv); if (m){opts.method=m;JS_FreeCString(ctx,m);} }
        JS_FreeValue(ctx,mv);
        JSValue hv=JS_GetPropertyStr(ctx,argv[1],"headers");
        if (JS_IsObject(hv)) {
            JSPropertyEnum* tab=nullptr; uint32_t tabLen=0;
            if (JS_GetOwnPropertyNames(ctx,&tab,&tabLen,hv,JS_GPN_STRING_MASK|JS_GPN_ENUM_ONLY)==0) {
                for (uint32_t i=0;i<tabLen;i++) {
                    const char* k=JS_AtomToCString(ctx,tab[i].atom);
                    JSValue val=JS_GetProperty(ctx,hv,tab[i].atom);
                    const char* v=JS_ToCString(ctx,val);
                    if (k&&v) { opts.headerKV.push_back(k); opts.headerKV.push_back(v); }
                    if (k) JS_FreeCString(ctx,k); if (v) JS_FreeCString(ctx,v);
                    JS_FreeValue(ctx,val); JS_FreeAtom(ctx,tab[i].atom);
                }
                js_free(ctx,tab);
            }
        }
        JS_FreeValue(ctx,hv);
        JSValue bv=JS_GetPropertyStr(ctx,argv[1],"body");
        if (JS_IsString(bv)) { const char* b=JS_ToCString(ctx,bv); if (b){opts.body=b;JS_FreeCString(ctx,b);} }
        JS_FreeValue(ctx,bv);
    }

    std::shared_ptr<std::atomic<bool>> abortFlag;
    if (argc>=3) {
        int32_t abortId=0; JS_ToInt32(ctx,&abortId,argv[2]);
        if (abortId>0) {
            NetCtx* nc=getNetCtx(ctx);
            if (nc) { auto it=nc->abortFlags.find(abortId); if (it!=nc->abortFlags.end()) abortFlag=it->second; }
        }
    }

    NetCtx* nc=getNetCtx(ctx); if (!nc) return JS_ThrowInternalError(ctx,"no NetCtx");
    JSValue funcs[2]; JSValue promise=JS_NewPromiseCapability(ctx,funcs);
    int fetchId=nc->nextFetchId++;
    nc->pendingFetches[fetchId]={JS_DupValue(ctx,funcs[0]),JS_DupValue(ctx,funcs[1])};
    JS_FreeValue(ctx,funcs[0]); JS_FreeValue(ctx,funcs[1]);

    ensureCurlInit();
    auto queue=nc->queue; auto stopped=nc->stopped;
    std::thread([url,opts,fetchId,queue,stopped,abortFlag]() mutable {
        runFetchThread(std::move(url),std::move(opts),fetchId,queue,stopped,abortFlag);
    }).detach();
    return promise;
}

// __native_sse_open(url, thisObj) → sseId
static JSValue js_native_sse_open(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc<2) return JS_ThrowTypeError(ctx,"__native_sse_open: expected (url,obj)");
    const char* urlC=JS_ToCString(ctx,argv[0]); if (!urlC) return JS_EXCEPTION;
    std::string url(urlC); JS_FreeCString(ctx,urlC);
    NetCtx* nc=getNetCtx(ctx); if (!nc) return JS_ThrowInternalError(ctx,"no NetCtx");
    int id=nc->nextSSEId++;
    nc->sseObjects[id]=JS_DupValue(ctx,argv[1]);
    auto handle=std::make_shared<SSEHandle>();
    handle->id=id; handle->queue=nc->queue; handle->netCtxStopped=nc->stopped;
    handle->thread=std::thread(runSSEThread,url,id,nc->queue,nc->stopped,&handle->stop);
    nc->sseHandles[id]=std::move(handle);
    return JS_NewInt32(ctx,id);
}

// __native_sse_close(id)
static JSValue js_native_sse_close(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    int32_t id=0; if (argc>=1) JS_ToInt32(ctx,&id,argv[0]);
    NetCtx* nc=getNetCtx(ctx); if (!nc) return JS_UNDEFINED;
    auto hit=nc->sseHandles.find(id);
    if (hit!=nc->sseHandles.end()) {
        hit->second->stop.store(true);
        if (hit->second->thread.joinable()) hit->second->thread.join();
        nc->sseHandles.erase(hit);
    }
    auto oit=nc->sseObjects.find(id);
    if (oit!=nc->sseObjects.end()) { JS_FreeValue(ctx,oit->second); nc->sseObjects.erase(oit); }
    return JS_UNDEFINED;
}

// __native_ws_open(url, thisObj, protocols) → wsId
static JSValue js_native_ws_open(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc<2) return JS_ThrowTypeError(ctx,"__native_ws_open: expected (url,obj)");
    const char* urlC=JS_ToCString(ctx,argv[0]); if (!urlC) return JS_EXCEPTION;
    std::string url(urlC); JS_FreeCString(ctx,urlC);
    NetCtx* nc=getNetCtx(ctx); if (!nc) return JS_ThrowInternalError(ctx,"no NetCtx");
    int id=nc->nextWSId++;
    nc->wsObjects[id]=JS_DupValue(ctx,argv[1]);
    auto handle=std::make_shared<WSHandle>();
    handle->id=id; handle->queue=nc->queue; handle->netCtxStopped=nc->stopped;
    WSHandle* raw=handle.get();
    handle->thread=std::thread(runWSThread,url,id,nc->queue,nc->stopped,raw);
    nc->wsHandles[id]=std::move(handle);
    return JS_NewInt32(ctx,id);
}

// __native_ws_send(id, data)
static JSValue js_native_ws_send(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc<2) return JS_UNDEFINED;
    int32_t id=0; JS_ToInt32(ctx,&id,argv[0]);
    NetCtx* nc=getNetCtx(ctx); if (!nc) return JS_UNDEFINED;
    auto it=nc->wsHandles.find(id); if (it==nc->wsHandles.end()) return JS_UNDEFINED;
    auto& h=it->second;
    std::string data; bool binary=false;
    if (JS_IsString(argv[1])) {
        const char* s=JS_ToCString(ctx,argv[1]); if (s){data=s;JS_FreeCString(ctx,s);}
    } else {
        size_t bl=0; uint8_t* buf=JS_GetArrayBuffer(ctx,&bl,argv[1]);
        if (buf) { data.assign(reinterpret_cast<char*>(buf),bl); binary=true; }
        else {
            JSValue str=JS_ToString(ctx,argv[1]);
            const char* s=JS_ToCString(ctx,str); if (s){data=s;JS_FreeCString(ctx,s);}
            JS_FreeValue(ctx,str);
        }
    }
    { std::lock_guard<std::mutex> lk(h->sendMtx); h->sendQueue.push_back({std::move(data),binary}); }
    if (h->lwsCtx) lws_cancel_service(h->lwsCtx);
    return JS_UNDEFINED;
}

// __native_ws_close(id, code, reason)
static JSValue js_native_ws_close(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    int32_t id=0; if (argc>=1) JS_ToInt32(ctx,&id,argv[0]);
    NetCtx* nc=getNetCtx(ctx); if (!nc) return JS_UNDEFINED;
    auto it=nc->wsHandles.find(id); if (it==nc->wsHandles.end()) return JS_UNDEFINED;
    auto& h=it->second;
    int32_t code=1000; if (argc>=2&&!JS_IsUndefined(argv[1])) JS_ToInt32(ctx,&code,argv[1]);
    std::string reason;
    if (argc>=3&&JS_IsString(argv[2])) {
        const char* r=JS_ToCString(ctx,argv[2]); if (r){reason=r;JS_FreeCString(ctx,r);}
    }
    { std::lock_guard<std::mutex> lk(h->sendMtx); h->wantClose=true; h->closeCode=(uint16_t)code; h->closeReason=std::move(reason); }
    if (h->lwsCtx) lws_cancel_service(h->lwsCtx);
    return JS_UNDEFINED;
}

// __native_create_abort_flag() → id
static JSValue js_native_create_abort_flag(JSContext* ctx, JSValue, int, JSValueConst*) {
    NetCtx* nc=getNetCtx(ctx); if (!nc) return JS_NewInt32(ctx,0);
    int id=nc->nextAbortId++;
    nc->abortFlags[id]=std::make_shared<std::atomic<bool>>(false);
    return JS_NewInt32(ctx,id);
}

// __native_signal_abort(id)
static JSValue js_native_signal_abort(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    int32_t id=0; if (argc>=1) JS_ToInt32(ctx,&id,argv[0]);
    NetCtx* nc=getNetCtx(ctx); if (!nc) return JS_UNDEFINED;
    auto it=nc->abortFlags.find(id); if (it!=nc->abortFlags.end()) it->second->store(true);
    return JS_UNDEFINED;
}

// ─── Browser API polyfill ─────────────────────────────────────────────────────

static const char s_polyfill[] = R"JS(
(function(G) {
  // ── EventTarget ──────────────────────────────────────────────────────────────
  function EventTarget() { this.__L = Object.create(null); }
  EventTarget.prototype.addEventListener = function(type, fn, opts) {
    if (!this.__L[type]) this.__L[type] = [];
    this.__L[type].push({ fn: fn, once: !!(opts && opts.once) });
  };
  EventTarget.prototype.removeEventListener = function(type, fn) {
    if (!this.__L[type]) return;
    this.__L[type] = this.__L[type].filter(function(l){return l.fn!==fn;});
  };
  EventTarget.prototype.dispatchEvent = function(event) {
    event.target = this;
    var on = this['on' + event.type];
    if (typeof on === 'function') { try { on.call(this, event); } catch(e) {} }
    var list = this.__L[event.type];
    if (list) {
      var copy = list.slice();
      for (var i=0;i<copy.length;i++) {
        try { copy[i].fn.call(this, event); } catch(e) {}
        if (copy[i].once) this.removeEventListener(event.type, copy[i].fn);
      }
    }
    return !event.defaultPrevented;
  };

  // ── Event ────────────────────────────────────────────────────────────────────
  function Event(type, init) {
    this.type = type; this.bubbles = !!(init&&init.bubbles);
    this.cancelable = !!(init&&init.cancelable); this.defaultPrevented = false;
    this.target = null; this.currentTarget = null; this.timeStamp = Date.now();
  }
  Event.prototype.preventDefault = function() { if (this.cancelable) this.defaultPrevented=true; };
  Event.prototype.stopPropagation = function() {};
  Event.prototype.stopImmediatePropagation = function() {};

  // ── MessageEvent ─────────────────────────────────────────────────────────────
  function MessageEvent(type, init) {
    Event.call(this, type, init);
    this.data = (init&&init.data!==undefined)?init.data:null;
    this.origin = (init&&init.origin)||''; this.lastEventId = (init&&init.lastEventId)||'';
    this.source = null; this.ports = [];
  }
  MessageEvent.prototype = Object.create(Event.prototype);
  MessageEvent.prototype.constructor = MessageEvent;

  // ── CloseEvent ───────────────────────────────────────────────────────────────
  function CloseEvent(type, init) {
    Event.call(this, type, init);
    this.code = (init&&init.code)||0; this.reason = (init&&init.reason)||'';
    this.wasClean = !!(init&&init.wasClean);
  }
  CloseEvent.prototype = Object.create(Event.prototype);
  CloseEvent.prototype.constructor = CloseEvent;

  // ── ErrorEvent ───────────────────────────────────────────────────────────────
  function ErrorEvent(type, init) {
    Event.call(this, type, init);
    this.message = (init&&init.message)||''; this.error = (init&&init.error)||null;
  }
  ErrorEvent.prototype = Object.create(Event.prototype);
  ErrorEvent.prototype.constructor = ErrorEvent;

  // ── DOMException ─────────────────────────────────────────────────────────────
  function DOMException(message, name) {
    this.message = message||''; this.name = name||'DOMException';
    if (Error.captureStackTrace) Error.captureStackTrace(this, DOMException);
  }
  DOMException.prototype = Object.create(Error.prototype);
  DOMException.prototype.constructor = DOMException;

  // ── Headers ──────────────────────────────────────────────────────────────────
  function Headers(init) {
    this.__m = Object.create(null);
    if (!init) return;
    if (init instanceof Headers) {
      var ks=Object.keys(init.__m); for (var i=0;i<ks.length;i++) this.__m[ks[i]]=init.__m[ks[i]];
    } else if (Array.isArray(init)) {
      for (var i=0;i<init.length;i++) this.append(init[i][0],init[i][1]);
    } else {
      var ks=Object.keys(init); for (var i=0;i<ks.length;i++) this.set(ks[i],init[ks[i]]);
    }
  }
  Headers.prototype = {
    constructor: Headers,
    _n: function(k) { return String(k).toLowerCase(); },
    get: function(k) { var v=this.__m[this._n(k)]; return v!==undefined?v:null; },
    has: function(k) { return this._n(k) in this.__m; },
    set: function(k,v) { this.__m[this._n(k)]=String(v); },
    append: function(k,v) { var n=this._n(k); if (n in this.__m) this.__m[n]+=', '+String(v); else this.__m[n]=String(v); },
    delete: function(k) { delete this.__m[this._n(k)]; },
    entries: function() { return Object.entries(this.__m); },
    keys: function() { return Object.keys(this.__m); },
    values: function() { return Object.values(this.__m); },
    forEach: function(cb, t) { var e=Object.entries(this.__m); for (var i=0;i<e.length;i++) cb.call(t,e[i][1],e[i][0],this); }
  };

  // ── Response ─────────────────────────────────────────────────────────────────
  function Response(body, init) {
    this._body = body||''; this.bodyUsed = false;
    this.status = (init&&init.status)||200;
    this.statusText = (init&&init.statusText)||'';
    this.ok = this.status>=200&&this.status<300;
    this.headers = (init&&init.headers instanceof Headers)?init.headers:new Headers((init&&init.headers)||{});
    this.url = (init&&init.url)||''; this.redirected = !!(init&&init.redirected);
    this.type = 'basic';
  }
  Response.prototype = {
    constructor: Response,
    text: function() { this.bodyUsed=true; return Promise.resolve(this._body); },
    json: function() {
      this.bodyUsed=true;
      try { return Promise.resolve(JSON.parse(this._body)); } catch(e) { return Promise.reject(e); }
    },
    arrayBuffer: function() {
      this.bodyUsed=true;
      var s=this._body, n=s.length, buf=new ArrayBuffer(n), v=new Uint8Array(buf);
      for (var i=0;i<n;i++) v[i]=s.charCodeAt(i)&0xff;
      return Promise.resolve(buf);
    },
    clone: function() {
      if (this.bodyUsed) throw new TypeError('Body already consumed');
      return new Response(this._body,{status:this.status,statusText:this.statusText,
        headers:new Headers(this.headers),url:this.url,redirected:this.redirected});
    }
  };

  // ── AbortSignal / AbortController ────────────────────────────────────────────
  function AbortSignal() {
    EventTarget.call(this);
    this.aborted = false; this.reason = undefined;
    this.__nativeAbortId = __native_create_abort_flag();
  }
  AbortSignal.prototype = Object.create(EventTarget.prototype);
  AbortSignal.prototype.constructor = AbortSignal;

  function AbortController() { this.signal = new AbortSignal(); }
  AbortController.prototype.abort = function(reason) {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.reason = reason!==undefined?reason:new DOMException('The operation was aborted','AbortError');
    __native_signal_abort(this.signal.__nativeAbortId);
    this.signal.dispatchEvent(new Event('abort'));
  };

  // ── EventSource ──────────────────────────────────────────────────────────────
  function EventSource(url, opts) {
    EventTarget.call(this);
    this.url = url; this.withCredentials = !!(opts&&opts.withCredentials);
    this.readyState = 0; this.onopen = null; this.onmessage = null; this.onerror = null;
    this.__id = __native_sse_open(url, this);
  }
  EventSource.CONNECTING=0; EventSource.OPEN=1; EventSource.CLOSED=2;
  EventSource.prototype = Object.create(EventTarget.prototype);
  EventSource.prototype.constructor = EventSource;
  EventSource.prototype.CONNECTING=0; EventSource.prototype.OPEN=1; EventSource.prototype.CLOSED=2;
  EventSource.prototype.close = function() {
    if (this.readyState===2) return;
    this.readyState=2; __native_sse_close(this.__id);
  };

  // ── WebSocket ────────────────────────────────────────────────────────────────
  function WebSocket(url, protocols) {
    EventTarget.call(this);
    this.url=url; this.readyState=0; this.protocol='';
    this.binaryType='arraybuffer'; this.bufferedAmount=0; this.extensions='';
    this.onopen=null; this.onmessage=null; this.onerror=null; this.onclose=null;
    this.__id = __native_ws_open(url, this, protocols||[]);
  }
  WebSocket.CONNECTING=0; WebSocket.OPEN=1; WebSocket.CLOSING=2; WebSocket.CLOSED=3;
  WebSocket.prototype = Object.create(EventTarget.prototype);
  WebSocket.prototype.constructor = WebSocket;
  WebSocket.prototype.CONNECTING=0; WebSocket.prototype.OPEN=1;
  WebSocket.prototype.CLOSING=2; WebSocket.prototype.CLOSED=3;
  WebSocket.prototype.send = function(data) {
    if (this.readyState!==1) throw new DOMException('WebSocket not open','InvalidStateError');
    __native_ws_send(this.__id, data);
  };
  WebSocket.prototype.close = function(code, reason) {
    if (this.readyState===2||this.readyState===3) return;
    this.readyState=2;
    __native_ws_close(this.__id, code!==undefined?code:1000, reason||'');
  };

  // ── fetch ────────────────────────────────────────────────────────────────────
  function fetch(url, options) {
    var signal = options&&options.signal;
    if (signal&&signal.aborted)
      return Promise.reject(signal.reason||new DOMException('The operation was aborted','AbortError'));
    var abortId = signal ? signal.__nativeAbortId : 0;
    var method = (options&&options.method)||'GET';
    var body = (options&&typeof options.body==='string')?options.body:'';
    var headers = {};
    if (options&&options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach(function(v,k){headers[k]=v;});
      } else { headers=options.headers; }
    }
    return __native_fetch(url,{method:method,headers:headers,body:body},abortId)
      .then(function(raw) {
        return new Response(raw.body,{status:raw.status,statusText:raw.statusText,
          headers:new Headers(raw.headers),url:raw.url,redirected:raw.redirected});
      });
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  G.EventTarget=EventTarget; G.Event=Event; G.MessageEvent=MessageEvent;
  G.CloseEvent=CloseEvent; G.ErrorEvent=ErrorEvent; G.DOMException=DOMException;
  G.Headers=Headers; G.Response=Response;
  G.AbortSignal=AbortSignal; G.AbortController=AbortController;
  G.EventSource=EventSource; G.WebSocket=WebSocket; G.fetch=fetch;
})(globalThis);
)JS";

// ─── registerNetBindings ──────────────────────────────────────────────────────

void registerNetBindings(JSContext* ctx) {
    ensureCurlInit();
    auto* nc=new NetCtx();
    { std::lock_guard<std::mutex> lk(s_ctxMapMtx); s_ctxMap[ctx]=nc; }

    JSValue global=JS_GetGlobalObject(ctx);
#define REG(name,fn,argc) JS_SetPropertyStr(ctx,global,name,JS_NewCFunction(ctx,fn,name,argc))
    REG("__native_fetch",              js_native_fetch,              3);
    REG("__native_sse_open",           js_native_sse_open,           2);
    REG("__native_sse_close",          js_native_sse_close,          1);
    REG("__native_ws_open",            js_native_ws_open,            3);
    REG("__native_ws_send",            js_native_ws_send,            2);
    REG("__native_ws_close",           js_native_ws_close,           3);
    REG("__native_create_abort_flag",  js_native_create_abort_flag,  0);
    REG("__native_signal_abort",       js_native_signal_abort,       1);
#undef REG
    JS_FreeValue(ctx,global);

    JSValue res=JS_Eval(ctx,s_polyfill,sizeof(s_polyfill)-1,"<net-polyfill>",JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(res)) {
        JSValue exc=JS_GetException(ctx);
        const char* s=JS_ToCString(ctx,exc);
        fprintf(stderr,"[net] polyfill error: %s\n",s?s:"?");
        if (s) JS_FreeCString(ctx,s); JS_FreeValue(ctx,exc);
    }
    JS_FreeValue(ctx,res);
}

// ─── shutdownNetCtx ───────────────────────────────────────────────────────────

void shutdownNetCtx(JSContext* ctx) {
    NetCtx* nc=nullptr;
    { std::lock_guard<std::mutex> lk(s_ctxMapMtx);
      auto it=s_ctxMap.find(ctx); if (it==s_ctxMap.end()) return;
      nc=it->second; s_ctxMap.erase(it); }
    if (!nc) return;
    nc->stopped->store(true);
    for (auto& [id,h]:nc->sseHandles) { h->stop.store(true); if (h->thread.joinable()) h->thread.join(); }
    nc->sseHandles.clear();
    for (auto& [id,h]:nc->wsHandles) {
        h->stop.store(true); if (h->lwsCtx) lws_cancel_service(h->lwsCtx);
        if (h->thread.joinable()) h->thread.join();
    }
    nc->wsHandles.clear();
    for (auto& [id,p]:nc->pendingFetches) { JS_FreeValue(ctx,p.first); JS_FreeValue(ctx,p.second); }
    nc->pendingFetches.clear();
    for (auto& [id,v]:nc->sseObjects) JS_FreeValue(ctx,v); nc->sseObjects.clear();
    for (auto& [id,v]:nc->wsObjects)  JS_FreeValue(ctx,v); nc->wsObjects.clear();
    nc->abortFlags.clear();
    delete nc;
}
