// Shared JS network polyfill for the mobile hosts (Android + iOS).
//
// Mobile does not compile native/desktop/net.cpp (curl + libwebsockets), so the
// globals that file installs have to be provided here instead. Keeping one copy
// matters: this file exists because the Android and iOS strings were duplicated
// and silently drifted from desktop, leaving AbortController undefined on device
// while working fine on the desktop host.
//
// Requires the host to have already registered: __rayactNativeFetchStart,
// __rayactNativeFetchAbort, __rayactNativeWs{Open,Send,Close,PollEvents},
// and the __rayactDevtools* hooks.

#pragma once

namespace rayact {

inline constexpr const char* kMobileNetworkPolyfill = R"JS(
(function(G){
  if (!G.Event) G.Event = function Event(type){ this.type=type; };
  if (!G.EventTarget) {
    G.EventTarget = function EventTarget(){ this.__listeners={}; };
    G.EventTarget.prototype.addEventListener=function(type, fn){
      if (!fn) return; (this.__listeners[type]||(this.__listeners[type]=[])).push(fn);
    };
    G.EventTarget.prototype.removeEventListener=function(type, fn){
      var a=this.__listeners[type]; if(!a) return;
      var i=a.indexOf(fn); if(i>=0) a.splice(i,1);
    };
    G.EventTarget.prototype.dispatchEvent=function(ev){
      ev.target=this;
      var prop=this['on'+ev.type]; if(typeof prop==='function') prop.call(this, ev);
      var a=(this.__listeners&&this.__listeners[ev.type])||[];
      for(var i=0;i<a.length;i++) a[i].call(this, ev);
      return true;
    };
  }
  if (!G.MessageEvent) G.MessageEvent = function MessageEvent(type, init){ G.Event.call(this,type); this.data=init&&init.data; };
  if (!G.CloseEvent) G.CloseEvent = function CloseEvent(type, init){ G.Event.call(this,type); this.code=(init&&init.code)||1000; this.reason=(init&&init.reason)||''; this.wasClean=true; };
  if (!G.ErrorEvent) G.ErrorEvent = function ErrorEvent(type, init){ G.Event.call(this,type); this.message=(init&&init.message)||''; };
  if (!G.Headers) G.Headers = function Headers(init){ this._h=init||{}; };
  if (!G.Response) {
    G.Response = function Response(body, init){
      this._body=body||'';
      this._bytes=(init&&init.bytes) instanceof ArrayBuffer ? init.bytes : null;
      this.status=(init&&init.status)||200;
      this.statusText=(init&&init.statusText)||'OK';
      this.ok=this.status>=200&&this.status<300;
      this.url=(init&&init.url)||'';
      this.headers=new G.Headers();
    };
    G.Response.prototype.text=function(){
      if(this._bytes){
        if(typeof G.TextDecoder==='function') return Promise.resolve(new G.TextDecoder('utf-8').decode(this._bytes));
        var b=new Uint8Array(this._bytes), o='';
        for(var j=0;j<b.length;j++) o+=String.fromCharCode(b[j]);
        return Promise.resolve(o);
      }
      return Promise.resolve(String(this._body));
    };
    G.Response.prototype.json=function(){ return this.text().then(JSON.parse); };
    G.Response.prototype.arrayBuffer=function(){
      if(this._bytes) return Promise.resolve(this._bytes);
      var s=String(this._body), n=s.length, buf=new ArrayBuffer(n), v=new Uint8Array(buf);
      for(var i=0;i<n;i++) v[i]=s.charCodeAt(i)&0xff;
      return Promise.resolve(buf);
    };
  }
  if (!G.DOMException) {
    G.DOMException = function DOMException(message, name){
      var e = Error.call(this, message);
      this.message = message === undefined ? '' : String(message);
      this.name = name === undefined ? 'Error' : String(name);
      if (e && e.stack) this.stack = e.stack;
    };
    G.DOMException.prototype = Object.create(Error.prototype);
    G.DOMException.prototype.constructor = G.DOMException;
  }
  function __abortReason(reason){
    if (reason !== undefined) return reason;
    return new G.DOMException('The operation was aborted', 'AbortError');
  }
  if (!G.AbortSignal) {
    function AbortSignal(){
      G.EventTarget.call(this);
      this.aborted=false; this.reason=undefined; this.onabort=null;
    }
    AbortSignal.prototype=Object.create(G.EventTarget.prototype);
    AbortSignal.prototype.constructor=AbortSignal;
    AbortSignal.prototype.throwIfAborted=function(){ if(this.aborted) throw this.reason; };
    // Internal: AbortController.abort() and AbortSignal.timeout() both land here.
    AbortSignal.prototype.__abort=function(reason){
      if(this.aborted) return;
      this.aborted=true; this.reason=__abortReason(reason);
      this.dispatchEvent(new G.Event('abort'));
    };
    AbortSignal.abort=function(reason){
      var s=new AbortSignal(); s.aborted=true; s.reason=__abortReason(reason); return s;
    };
    AbortSignal.timeout=function(ms){
      var s=new AbortSignal();
      G.setTimeout(function(){ s.__abort(new G.DOMException('The operation timed out','TimeoutError')); }, ms);
      return s;
    };
    G.AbortSignal=AbortSignal;
  }
  if (!G.AbortController) {
    function AbortController(){ this.signal=new G.AbortSignal(); }
    AbortController.prototype.abort=function(reason){ this.signal.__abort(reason); };
    G.AbortController=AbortController;
  }
  // Headers may arrive as a Headers instance, an array of pairs, or a plain
  // object; the native side only speaks a flat JSON object.
  function __plainHeaders(h){
    var out={};
    if(!h) return out;
    if(h._h) h=h._h;
    if(Object.prototype.toString.call(h)==='[object Array]'){
      for(var i=0;i<h.length;i++){ if(h[i]&&h[i].length>=2) out[String(h[i][0])]=String(h[i][1]); }
      return out;
    }
    for(var k in h){ if(Object.prototype.hasOwnProperty.call(h,k)) out[k]=String(h[k]); }
    return out;
  }
  // Bodies cross into Kotlin as a UTF-8 jstring, so binary payloads would be
  // mangled — accept strings (which covers JSON) and reject the rest loudly
  // rather than silently sending something different from what was asked for.
  function __bodyToString(b){
    if(b===undefined||b===null) return null;
    if(typeof b==='string') return b;
    throw new TypeError('fetch: this platform supports only string request bodies');
  }
  G.__rayactNativeFetchSeq = G.__rayactNativeFetchSeq || 0;
  G.__rayactNativeFetchPending = G.__rayactNativeFetchPending || {};
  // Emit a CDP Network.* event to an attached DevTools frontend. No-op (and
  // skips JSON building) when no frontend is listening.
  function __ts(){ return Date.now()/1000; }
  function __net(method, params){
    if(!(G.__rayactDevtoolsActive && G.__rayactDevtoolsActive())) return;
    try { G.__rayactDevtoolsNetwork(method, JSON.stringify(params)); } catch(e){}
  }
  function __storeBody(requestId, body){
    if(!(G.__rayactDevtoolsActive && G.__rayactDevtoolsActive())) return;
    try { G.__rayactDevtoolsStoreNetworkBody(requestId, body); } catch(e){}
  }
  if (typeof G.fetch !== 'function') {
    // Asynchronous fetch: hands the request to the native dispatcher and
    // resolves later from the network drain. Never blocks the render thread.
    G.fetch=function(url, opts){
      var target=String(url);
      var id=++G.__rayactNativeFetchSeq;
      var reqId='rayact-fetch-'+id;
      var httpMethod=String((opts&&opts.method)||'GET').toUpperCase();
      var signal=opts&&opts.signal;
      var headers, body;
      try { headers=__plainHeaders(opts&&opts.headers); body=__bodyToString(opts&&opts.body); }
      catch(e){ return Promise.reject(e); }
      __net('Network.requestWillBeSent',{requestId:reqId,loaderId:'rayact-loader',documentURL:target,request:{url:target,method:httpMethod,headers:headers},timestamp:__ts(),wallTime:Date.now()/1000,initiator:{type:'script'},type:'Fetch'});
      if(signal&&signal.aborted){
        // Already aborted: never reach the native dispatcher at all.
        __net('Network.loadingFailed',{requestId:reqId,timestamp:__ts(),type:'Fetch',errorText:'aborted',canceled:true});
        return Promise.reject(__abortReason(signal.reason));
      }
      return new Promise(function(resolve, reject){
        var entry={resolve:resolve, reject:reject, url:target, reqId:reqId, signal:signal, onAbort:null};
        G.__rayactNativeFetchPending[id]=entry;
        if(signal){
          entry.onAbort=function(){
            // The pending entry is dropped here rather than waiting for the
            // native 'canceled' event, so the promise settles immediately even
            // if the socket takes a moment to tear down.
            if(!G.__rayactNativeFetchPending[id]) return;
            delete G.__rayactNativeFetchPending[id];
            try { G.__rayactNativeFetchAbort(id); } catch(e2){}
            __net('Network.loadingFailed',{requestId:reqId,timestamp:__ts(),type:'Fetch',errorText:'aborted',canceled:true});
            reject(__abortReason(signal.reason));
          };
          signal.addEventListener('abort', entry.onAbort);
        }
        try { G.__rayactNativeFetchStart(id, target, httpMethod, JSON.stringify(headers), body); }
        catch(e){
          delete G.__rayactNativeFetchPending[id];
          if(signal&&entry.onAbort) signal.removeEventListener('abort', entry.onAbort);
          __net('Network.loadingFailed',{requestId:reqId,timestamp:__ts(),type:'Fetch',errorText:String(e&&e.message||e),canceled:false});
          reject(e);
        }
      });
    };
  }
  if (typeof G.WebSocket !== 'function') {
    function WebSocket(url) {
      G.EventTarget.call(this);
      this.url=String(url); this.readyState=0; this.protocol=''; this.extensions='';
      this.binaryType='arraybuffer'; this.bufferedAmount=0;
      this.onopen=null; this.onmessage=null; this.onerror=null; this.onclose=null;
      this.__id=G.__rayactNativeWsOpen(this.url);
      this.__netId='rayact-ws-'+this.__id;
      G.__rayactNativeWsSockets[this.__id]=this;
      __net('Network.webSocketCreated',{requestId:this.__netId,url:this.url,initiator:{type:'script'}});
      __net('Network.webSocketWillSendHandshakeRequest',{requestId:this.__netId,timestamp:__ts(),wallTime:Date.now()/1000,request:{headers:{}}});
    }
    WebSocket.CONNECTING=0; WebSocket.OPEN=1; WebSocket.CLOSING=2; WebSocket.CLOSED=3;
    WebSocket.prototype=Object.create(G.EventTarget.prototype);
    WebSocket.prototype.constructor=WebSocket;
    WebSocket.prototype.CONNECTING=0; WebSocket.prototype.OPEN=1; WebSocket.prototype.CLOSING=2; WebSocket.prototype.CLOSED=3;
    WebSocket.prototype.send=function(data){
      if(this.readyState!==1) throw new Error('WebSocket not open');
      G.__rayactNativeWsSend(this.__id, String(data));
      __net('Network.webSocketFrameSent',{requestId:this.__netId,timestamp:__ts(),response:{opcode:1,mask:true,payloadData:String(data)}});
    };
    WebSocket.prototype.close=function(code, reason){
      if(this.readyState===2||this.readyState===3) return;
      this.readyState=2;
      G.__rayactNativeWsClose(this.__id, code||1000, reason||'');
    };
    G.WebSocket=WebSocket;
  }
  G.__rayactNativeWsSockets = G.__rayactNativeWsSockets || {};
  G.__rayactNativeNetworkDrain = function(){
    var raw=G.__rayactNativeWsPollEvents();
    if(!raw||raw==='[]') return;
    var events=JSON.parse(raw);
    for(var i=0;i<events.length;i++){
      var ev=events[i];
      if(ev.type==='fetch'){
        var p=G.__rayactNativeFetchPending[ev.req];
        if(!p) continue;
        delete G.__rayactNativeFetchPending[ev.req];
        if(p.signal&&p.onAbort) p.signal.removeEventListener('abort', p.onAbort);
        if(ev.canceled){
          // Cancel raced ahead of the abort listener (or came from teardown):
          // still surface the standard AbortError consumers check for.
          __net('Network.loadingFailed',{requestId:p.reqId,timestamp:__ts(),type:'Fetch',errorText:'aborted',canceled:true});
          p.reject(__abortReason(p.signal&&p.signal.reason)); continue;
        }
        if(ev.status===0){
          __net('Network.loadingFailed',{requestId:p.reqId,timestamp:__ts(),type:'Fetch',errorText:ev.error||'Network request failed',canceled:false});
          p.reject(new Error(ev.error||'Network request failed')); continue;
        }
        var s=ev.body||'', n=s.length, buf=new ArrayBuffer(n), v=new Uint8Array(buf);
        for(var k=0;k<n;k++) v[k]=s.charCodeAt(k)&0xff;
        __storeBody(p.reqId, buf);
        __net('Network.responseReceived',{requestId:p.reqId,loaderId:'rayact-loader',timestamp:__ts(),type:'Fetch',response:{url:p.url,status:ev.status,statusText:ev.statusText||'',headers:ev.headers||{},mimeType:ev.mimeType||'application/octet-stream',protocol:ev.protocol||'',connectionReused:false,fromDiskCache:false,encodedDataLength:n}});
        __net('Network.loadingFinished',{requestId:p.reqId,timestamp:__ts(),encodedDataLength:n});
        p.resolve(new G.Response('',{status:ev.status, statusText:'', url:p.url, bytes:buf}));
        continue;
      }
      var ws=G.__rayactNativeWsSockets[ev.id];
      if(!ws) continue;
      if(ev.type==='open'){ ws.readyState=1; __net('Network.webSocketHandshakeResponseReceived',{requestId:ws.__netId,timestamp:__ts(),response:{status:ev.status||101,statusText:ev.statusText||'Switching Protocols',headers:ev.headers||{}}}); ws.dispatchEvent(new G.Event('open')); }
      else if(ev.type==='message'){ __net('Network.webSocketFrameReceived',{requestId:ws.__netId,timestamp:__ts(),response:{opcode:ev.binary?2:1,mask:false,payloadData:ev.data||''}}); ws.dispatchEvent(new G.MessageEvent('message',{data:ev.data||''})); }
      else if(ev.type==='error'){ __net('Network.webSocketFrameError',{requestId:ws.__netId,timestamp:__ts(),errorMessage:ev.message||'WebSocket error'}); ws.dispatchEvent(new G.ErrorEvent('error',{message:ev.message||'WebSocket error'})); }
      else if(ev.type==='close'){ ws.readyState=3; delete G.__rayactNativeWsSockets[ev.id]; __net('Network.webSocketClosed',{requestId:ws.__netId,timestamp:__ts()}); ws.dispatchEvent(new G.CloseEvent('close',{code:ev.code||1000,reason:ev.reason||''})); }
    }
  };
})(globalThis);
)JS";

}  // namespace rayact
