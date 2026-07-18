#include "cdp_handler.hpp"
#include "raym3_bridge.hpp"
#include "../core/engine.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include <set>
#include <deque>

#if defined(__ANDROID__) || defined(__APPLE__)
#include <cstdint>
static void sha1Hash(const unsigned char* data, size_t len, unsigned char out[20]) {
    uint32_t h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    std::vector<unsigned char> msg(data, data + len);
    uint64_t bitLen = (uint64_t)len * 8;
    msg.push_back(0x80);
    while ((msg.size() % 64) != 56) msg.push_back(0);
    for (int i = 7; i >= 0; --i) msg.push_back((unsigned char)((bitLen >> (i * 8)) & 0xFF));
    auto rol = [](uint32_t v, int bits) { return (v << bits) | (v >> (32 - bits)); };
    for (size_t offset = 0; offset < msg.size(); offset += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; ++i) {
            w[i] = ((uint32_t)msg[offset + i * 4] << 24) | ((uint32_t)msg[offset + i * 4 + 1] << 16) |
                   ((uint32_t)msg[offset + i * 4 + 2] << 8) | (uint32_t)msg[offset + i * 4 + 3];
        }
        for (int i = 16; i < 80; ++i) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
        uint32_t a = h0, b = h1, c = h2, d = h3, e = h4;
        for (int i = 0; i < 80; ++i) {
            uint32_t f, k;
            if (i < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999; }
            else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
            else { f = b ^ c ^ d; k = 0xCA62C1D6; }
            uint32_t temp = rol(a, 5) + f + e + k + w[i];
            e = d; d = c; c = rol(b, 30); b = a; a = temp;
        }
        h0 += a; h1 += b; h2 += c; h3 += d; h4 += e;
    }
    const uint32_t digest[5] = {h0, h1, h2, h3, h4};
    for (int i = 0; i < 5; ++i) {
        uint32_t v = digest[i];
        out[i * 4] = (unsigned char)((v >> 24) & 0xFF);
        out[i * 4 + 1] = (unsigned char)((v >> 16) & 0xFF);
        out[i * 4 + 2] = (unsigned char)((v >> 8) & 0xFF);
        out[i * 4 + 3] = (unsigned char)(v & 0xFF);
    }
}
static std::string base64Encode(const unsigned char* data, size_t len) {
    static const char* kTable = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    out.reserve(((len + 2) / 3) * 4);
    for (size_t i = 0; i < len; i += 3) {
        unsigned int n = (unsigned int)data[i] << 16;
        if (i + 1 < len) n |= (unsigned int)data[i + 1] << 8;
        if (i + 2 < len) n |= (unsigned int)data[i + 2];
        out.push_back(kTable[(n >> 18) & 63]);
        out.push_back(kTable[(n >> 12) & 63]);
        out.push_back(i + 1 < len ? kTable[(n >> 6) & 63] : '=');
        out.push_back(i + 2 < len ? kTable[n & 63] : '=');
    }
    return out;
}
#else
#include <openssl/sha.h>
#include <openssl/evp.h>
#include <openssl/bio.h>
#include <openssl/buffer.h>
#endif

#ifndef _WIN32
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <cerrno>
#include <unistd.h>
#if defined(__ANDROID__) || defined(__APPLE__)
#include <sys/types.h>
#endif
#endif

extern "C" {
#include "quickjs.h"
}

namespace rayact {

static CDPHandler* g_instance = nullptr;

struct CDPHandler::Impl {
    int port = 9229;
    JSContext* ctx = nullptr;
    std::atomic<bool> running{false};
    std::thread serverThread;
    int listenFd = -1;
    std::mutex clientMutex;
    std::vector<int> clients;
    std::map<int, std::string> pendingHttp;
    std::map<int, std::chrono::steady_clock::time_point> pendingHttpSince;
    std::map<int, std::vector<uint8_t>> rxBuffers; // per-ws-client partial frames
    std::map<int, std::string> fragmentedPayloads;
    std::map<int, uint8_t> fragmentedOpcodes;
    struct PendingWrite { std::vector<uint8_t> bytes; size_t offset = 0; };
    std::mutex writeMutex;
    std::map<int, std::deque<PendingWrite>> pendingWrites;
    size_t pendingWriteBytes = 0;
    std::mutex msgMutex;
    std::vector<std::string> outbound;
    std::vector<std::pair<int, std::string>> targetedOutbound;
    std::atomic<int> reactBindingClient{-1};
    // Inbound CDP messages queued by the socket thread, handled on the engine
    // thread in pump() — JS_Eval/DOM access must never run on the socket thread.
    std::deque<std::pair<int, std::string>> inbound;
    size_t inboundBytes = 0;
    CDPHandler::OutboundCallback outboundCallback = nullptr;
    void* outboundOpaque = nullptr;
    std::string title = "Rayact";
    std::string devtoolsFrontendUrl;
    // DevTools-driven element picking (Overlay.setInspectMode). Tracked apart
    // from the in-app dev-menu toggle so CDP only clears pick mode it enabled.
    bool cdpInspectMode = false;
    int lastPickedNode = -1;
    int nextScriptId = 1;
    struct Script { std::string url; std::string source; };
    std::map<int, Script> scripts;
    int nextMsgId = 1;
    int nextRemoteObjectId = 1;
    std::map<int, JSValue> remoteObjects;
    std::map<int, std::string> remoteObjectGroups;
    struct StoredBody { std::string data; bool base64 = false; };
    std::map<std::string, StoredBody> responseBodies;
    std::deque<std::string> responseBodyOrder;
    size_t responseBodyBytes = 0;
    std::set<int> tracingClients;
    std::map<int, int> inspectedNodes;
    std::deque<std::string> consoleHistory;
};

static constexpr size_t kMaxResponseBody = 1024 * 1024;
static constexpr size_t kMaxResponseBodies = 16 * 1024 * 1024;
static constexpr size_t kMaxInboundMessages = 256;
static constexpr size_t kMaxInboundBytes = 8 * 1024 * 1024;
static constexpr size_t kMaxInboundMessage = 4 * 1024 * 1024;

CDPHandler::CDPHandler(int port) : impl_(new Impl()) {
    impl_->port = port;
}

CDPHandler::~CDPHandler() { stop(); delete impl_; }

CDPHandler* CDPHandler::instance() { return g_instance; }

static std::string jsonEscape(const std::string& s) {
    std::string out;
    for (char c : s) {
        switch (c) {
            case '\\': out += "\\\\"; break;
            case '"': out += "\\\""; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += c; break;
        }
    }
    return out;
}

static std::string handleJsonList(int port, const std::string& title,
                                  const std::string& frontendUrl) {
    std::ostringstream ss;
    ss << "[{"
       << "\"description\":\"Rayact Dev Client\","
       << "\"devtoolsFrontendUrl\":\""
       << jsonEscape(frontendUrl.empty()
                         ? "devtools://devtools/bundled/inspector.html?ws=localhost:" +
                               std::to_string(port) + "/rayact-main"
                         : frontendUrl)
       << "\","
       << "\"id\":\"rayact-main\","
       << "\"title\":\"" << jsonEscape(title) << "\","
       << "\"type\":\"page\","
       << "\"webSocketDebuggerUrl\":\"ws://localhost:" << port << "/rayact-main\""
       << "}]";
    return ss.str();
}

static std::string handleJsonVersion(int port) {
    std::ostringstream ss;
    ss << "{"
       << "\"Browser\":\"Rayact/0.0.3\","
       << "\"Protocol-Version\":\"1.3\","
       << "\"User-Agent\":\"Rayact/0.0.3\","
       << "\"V8-Version\":\"QuickJS\","
       << "\"webSocketDebuggerUrl\":\"ws://localhost:" << port << "/rayact-main\""
       << "}";
    return ss.str();
}

static bool sendAll(int fd, const std::string& data) {
    size_t sent = 0;
    while (sent < data.size()) {
        ssize_t n = send(fd, data.data() + sent, data.size() - sent, 0);
        if (n <= 0) return false;
        sent += (size_t)n;
    }
    return true;
}

static std::vector<uint8_t> wsTextFrame(const std::string& text) {
    std::vector<uint8_t> frame;
    frame.push_back(0x81);
    size_t len = text.size();
    if (len < 126) {
        frame.push_back((uint8_t)len);
    } else if (len < 65536) {
        frame.push_back(126);
        frame.push_back((len >> 8) & 0xff);
        frame.push_back(len & 0xff);
    } else {
        frame.push_back(127);
        for (int i = 7; i >= 0; --i) frame.push_back((len >> (i * 8)) & 0xff);
    }
    frame.insert(frame.end(), text.begin(), text.end());
    return frame;
}

static void queueWsText(CDPHandler::Impl* impl, int fd, const std::string& text) {
    if (!impl || fd < 0) return;
    auto bytes = wsTextFrame(text);
    std::lock_guard<std::mutex> lock(impl->writeMutex);
    // Bound queued inspector traffic globally. A paused or disconnected
    // frontend must never consume unbounded memory or backpressure rendering.
    static constexpr size_t kMaxPendingWrites = 16 * 1024 * 1024;
    if (impl->pendingWriteBytes + bytes.size() > kMaxPendingWrites) return;
    impl->pendingWriteBytes += bytes.size();
    impl->pendingWrites[fd].push_back({std::move(bytes), 0});
}

static bool flushWsWrites(CDPHandler::Impl* impl, int fd) {
    std::lock_guard<std::mutex> lock(impl->writeMutex);
    auto found = impl->pendingWrites.find(fd);
    if (found == impl->pendingWrites.end()) return true;
    auto& queue = found->second;
    size_t budget = 256 * 1024;
    while (!queue.empty() && budget > 0) {
        auto& write = queue.front();
        const size_t remaining = write.bytes.size() - write.offset;
        const size_t amount = std::min(remaining, budget);
#ifdef MSG_NOSIGNAL
        const int flags = MSG_DONTWAIT | MSG_NOSIGNAL;
#else
        const int flags = MSG_DONTWAIT;
#endif
        const ssize_t n = send(fd, write.bytes.data() + write.offset, amount, flags);
        if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return true;
        if (n <= 0) return false;
        write.offset += (size_t)n;
        impl->pendingWriteBytes -= (size_t)n;
        budget -= (size_t)n;
        if (write.offset == write.bytes.size()) queue.pop_front();
    }
    if (queue.empty()) impl->pendingWrites.erase(found);
    return true;
}

struct WsFrame {
    bool fin = true;
    uint8_t opcode = 0;
    std::string payload;
};

// Consume every complete frame at the front of `buf` (partial trailing data is
// kept for the next recv). Returns false on a malformed header.
static bool wsExtractFrames(std::vector<uint8_t>& buf, std::vector<WsFrame>& out) {
    size_t pos = 0;
    while (buf.size() - pos >= 2) {
        const bool fin = (buf[pos] & 0x80) != 0;
        const uint8_t opcode = buf[pos] & 0x0f;
        const bool masked = (buf[pos + 1] & 0x80) != 0;
        uint64_t len = buf[pos + 1] & 0x7f;
        size_t offset = pos + 2;
        if (len == 126) {
            if (buf.size() - offset < 2) break;
            len = ((uint64_t)buf[offset] << 8) | buf[offset + 1];
            offset += 2;
        } else if (len == 127) {
            if (buf.size() - offset < 8) break;
            len = 0;
            for (int i = 0; i < 8; ++i) len = (len << 8) | buf[offset + i];
            offset += 8;
        }
        uint8_t masking[4] = {0, 0, 0, 0};
        if (masked) {
            if (buf.size() - offset < 4) break;
            memcpy(masking, buf.data() + offset, 4);
            offset += 4;
        }
        if (buf.size() - offset < len) break;
        WsFrame frame;
        frame.fin = fin;
        frame.opcode = opcode;
        frame.payload.resize((size_t)len);
        for (size_t i = 0; i < (size_t)len; ++i) {
            frame.payload[i] = (char)(buf[offset + i] ^ (masked ? masking[i % 4] : 0));
        }
        out.push_back(std::move(frame));
        pos = offset + (size_t)len;
    }
    if (pos > 0) buf.erase(buf.begin(), buf.begin() + (long)pos);
    return true;
}

static std::string extractJsonField(const std::string& json, const std::string& key) {
    std::string search = "\"" + key + "\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return "";
    pos = json.find(':', pos + search.size());
    if (pos == std::string::npos) return "";
    pos++;
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
    if (pos < json.size() && json[pos] == '"') {
        pos++;
        std::string value;
        while (pos < json.size()) {
            const char c = json[pos++];
            if (c == '"') return value;
            if (c != '\\') {
                value.push_back(c);
                continue;
            }
            if (pos >= json.size()) return "";
            const char escaped = json[pos++];
            switch (escaped) {
                case '"': value.push_back('"'); break;
                case '\\': value.push_back('\\'); break;
                case '/': value.push_back('/'); break;
                case 'b': value.push_back('\b'); break;
                case 'f': value.push_back('\f'); break;
                case 'n': value.push_back('\n'); break;
                case 'r': value.push_back('\r'); break;
                case 't': value.push_back('\t'); break;
                case 'u': {
                    if (pos + 4 > json.size()) return "";
                    unsigned int cp = 0;
                    for (int i = 0; i < 4; ++i) {
                        const char h = json[pos++];
                        cp <<= 4;
                        if (h >= '0' && h <= '9') cp |= (unsigned int)(h - '0');
                        else if (h >= 'a' && h <= 'f') cp |= (unsigned int)(h - 'a' + 10);
                        else if (h >= 'A' && h <= 'F') cp |= (unsigned int)(h - 'A' + 10);
                        else return "";
                    }
                    if (cp <= 0x7f) value.push_back((char)cp);
                    else if (cp <= 0x7ff) {
                        value.push_back((char)(0xc0 | (cp >> 6)));
                        value.push_back((char)(0x80 | (cp & 0x3f)));
                    } else {
                        value.push_back((char)(0xe0 | (cp >> 12)));
                        value.push_back((char)(0x80 | ((cp >> 6) & 0x3f)));
                        value.push_back((char)(0x80 | (cp & 0x3f)));
                    }
                    break;
                }
                default: return "";
            }
        }
        return "";
    }
    size_t end = pos;
    while (end < json.size() && json[end] != ',' && json[end] != '}') end++;
    std::string val = json.substr(pos, end - pos);
    while (!val.empty() && (val.back() == ' ' || val.back() == '\t')) val.pop_back();
    return val;
}

void CDPHandler::registerScript(const char* url, const char* source, int scriptId) {
    if (!impl_) return;
    std::lock_guard<std::mutex> lock(impl_->msgMutex);
    impl_->nextScriptId = std::max(impl_->nextScriptId, scriptId + 1);
    impl_->scripts[scriptId] = { url ? url : "", source ? source : "" };
    const std::string& scriptSource = impl_->scripts[scriptId].source;
    std::string sourceMapUrl;
    const size_t sourceMap = scriptSource.rfind("sourceMappingURL=");
    if (sourceMap != std::string::npos) {
        sourceMapUrl = scriptSource.substr(sourceMap + strlen("sourceMappingURL="));
        const size_t end = sourceMapUrl.find_first_of("\r\n");
        if (end != std::string::npos) sourceMapUrl.resize(end);
    }
    std::ostringstream ev;
    ev << "{\"method\":\"Debugger.scriptParsed\",\"params\":{"
       << "\"scriptId\":\"" << scriptId << "\","
       << "\"url\":\"" << jsonEscape(url ? url : "") << "\","
       << "\"startLine\":0,\"startColumn\":0,\"endLine\":0,\"endColumn\":0,"
       << "\"executionContextId\":1,\"hash\":\"\",\"hasSourceURL\":true";
    if (!sourceMapUrl.empty()) ev << ",\"sourceMapURL\":\"" << jsonEscape(sourceMapUrl) << "\"";
    ev
       << "}}";
    impl_->outbound.push_back(ev.str());
}

void CDPHandler::registerScript(const char* url, const char* source) {
    if (!impl_) return;
    int scriptId = 0;
    {
        std::lock_guard<std::mutex> lock(impl_->msgMutex);
        scriptId = impl_->nextScriptId++;
    }
    registerScript(url, source, scriptId);
}

void CDPHandler::onConsoleMessage(const char* level, const char* message) {
    if (!impl_) return;
    std::lock_guard<std::mutex> lock(impl_->msgMutex);
    std::ostringstream ev;
    ev << "{\"method\":\"Runtime.consoleAPICalled\",\"params\":{"
       << "\"type\":\"" << jsonEscape(level ? level : "log") << "\","
       << "\"args\":[{\"type\":\"string\",\"value\":\"" << jsonEscape(message ? message : "") << "\"}],"
       << "\"executionContextId\":1"
       << "}}";
    impl_->outbound.push_back(ev.str());
    impl_->consoleHistory.push_back(ev.str());
    if (impl_->consoleHistory.size() > 1000) impl_->consoleHistory.pop_front();
}

void CDPHandler::emitEvent(const char* method, const char* payloadJson) {
    if (!impl_ || !method) return;
    std::lock_guard<std::mutex> lock(impl_->msgMutex);
    const std::string event = std::string("{\"method\":\"") + jsonEscape(method) +
                              "\",\"params\":" + (payloadJson ? payloadJson : "{}") + "}";
    // A Runtime binding belongs to the DevTools session that installed it.
    // Broadcasting React bridge traffic to every CDP client makes two open
    // frontends ingest each other's operation streams and corrupt their Store.
    if (std::strcmp(method, "Runtime.bindingCalled") == 0) {
        const int fd = impl_->reactBindingClient.load();
        if (fd >= 0) impl_->targetedOutbound.emplace_back(fd, event);
    } else {
        impl_->outbound.push_back(event);
    }
}

void CDPHandler::onNetworkEvent(const char* method, const char* paramsJson) {
    emitEvent(method, paramsJson);
}

void CDPHandler::storeResponseBody(const char* requestId, const void* data, size_t size,
                                   bool base64Encoded) {
    if (!impl_ || !requestId || !*requestId || (!data && size)) return;
    const size_t kept = std::min(size, kMaxResponseBody);
    std::string body(static_cast<const char*>(data), kept);
    if (base64Encoded) {
        body = base64Encode(reinterpret_cast<const unsigned char*>(body.data()), body.size());
    }
    std::lock_guard<std::mutex> lock(impl_->msgMutex);
    auto old = impl_->responseBodies.find(requestId);
    if (old != impl_->responseBodies.end()) impl_->responseBodyBytes -= old->second.data.size();
    impl_->responseBodies[requestId] = {std::move(body), base64Encoded};
    impl_->responseBodyBytes += impl_->responseBodies[requestId].data.size();
    impl_->responseBodyOrder.emplace_back(requestId);
    while (impl_->responseBodyBytes > kMaxResponseBodies && !impl_->responseBodyOrder.empty()) {
        std::string evict = std::move(impl_->responseBodyOrder.front());
        impl_->responseBodyOrder.pop_front();
        auto it = impl_->responseBodies.find(evict);
        if (it == impl_->responseBodies.end()) continue;
        impl_->responseBodyBytes -= it->second.data.size();
        impl_->responseBodies.erase(it);
    }
}

static int remoteObjectId(const std::string& objectId) {
    static const std::string prefix = "rayact-";
    if (objectId.rfind(prefix, 0) != 0) return -1;
    return atoi(objectId.c_str() + prefix.size());
}

static std::string remoteObjectJson(CDPHandler::Impl* impl, JSContext* ctx,
                                    JSValueConst value, const std::string& group = "") {
    if (JS_IsUndefined(value)) return "{\"type\":\"undefined\"}";
    if (JS_IsNull(value)) return "{\"type\":\"object\",\"subtype\":\"null\",\"value\":null}";
    if (JS_IsBool(value)) {
        return std::string("{\"type\":\"boolean\",\"value\":") +
               (JS_ToBool(ctx, value) ? "true}" : "false}");
    }
    if (JS_IsNumber(value)) {
        double number = 0;
        JS_ToFloat64(ctx, &number, value);
        if (std::isnan(number)) return "{\"type\":\"number\",\"unserializableValue\":\"NaN\",\"description\":\"NaN\"}";
        if (std::isinf(number)) {
            const char* text = number < 0 ? "-Infinity" : "Infinity";
            return std::string("{\"type\":\"number\",\"unserializableValue\":\"") + text +
                   "\",\"description\":\"" + text + "\"}";
        }
        std::ostringstream out;
        out.precision(17);
        out << "{\"type\":\"number\",\"value\":" << number << "}";
        return out.str();
    }
    if (JS_IsBigInt(value)) {
        const char* text = JS_ToCString(ctx, value);
        std::string result = "{\"type\":\"bigint\",\"unserializableValue\":\"" +
                             jsonEscape(text ? text : "0") + "n\",\"description\":\"" +
                             jsonEscape(text ? text : "0") + "n\"}";
        if (text) JS_FreeCString(ctx, text);
        return result;
    }
    if (JS_IsString(value)) {
        const char* text = JS_ToCString(ctx, value);
        std::string result = "{\"type\":\"string\",\"value\":\"" +
                             jsonEscape(text ? text : "") + "\"}";
        if (text) JS_FreeCString(ctx, text);
        return result;
    }

    const bool function = JS_IsFunction(ctx, value);
    const bool array = JS_IsArray(value);
    const JSPromiseStateEnum promiseState = JS_IsObject(value) ? JS_PromiseState(ctx, value) : JS_PROMISE_NOT_A_PROMISE;
    const bool promise = promiseState != JS_PROMISE_NOT_A_PROMISE;
    const int objectId = impl->nextRemoteObjectId++;
    impl->remoteObjects.emplace(objectId, JS_DupValue(ctx, value));
    impl->remoteObjectGroups.emplace(objectId, group);
    std::string description = function ? "function" : (array ? "Array" : (promise ? "Promise" : "Object"));
    if (array) {
        int64_t length = 0;
        if (JS_GetLength(ctx, value, &length) == 0) description += "(" + std::to_string(length) + ")";
    }
    std::ostringstream out;
    out << "{\"type\":\"" << (function ? "function" : "object") << "\"";
    if (array) out << ",\"subtype\":\"array\"";
    if (promise) out << ",\"subtype\":\"promise\"";
    out << ",\"className\":\"" << (function ? "Function" : (array ? "Array" : (promise ? "Promise" : "Object"))) << "\""
        << ",\"description\":\"" << description << "\""
        << ",\"objectId\":\"rayact-" << objectId << "\"}";
    return out.str();
}

void CDPHandler::onConsoleArgs(JSContext* ctx, const char* level, int argc, JSValueConst* argv) {
    if (!impl_ || !ctx) return;
    std::ostringstream ev;
    ev << "{\"method\":\"Runtime.consoleAPICalled\",\"params\":{"
       << "\"type\":\"" << jsonEscape(level ? level : "log") << "\",\"args\":[";
    for (int i = 0; i < argc; ++i) {
        if (i) ev << ",";
        ev << remoteObjectJson(impl_, ctx, argv[i], "console");
    }
    const auto now = std::chrono::duration<double, std::milli>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    ev << "],\"executionContextId\":1,\"timestamp\":" << now << "}}";
    std::lock_guard<std::mutex> lock(impl_->msgMutex);
    impl_->outbound.push_back(ev.str());
    impl_->consoleHistory.push_back(ev.str());
    if (impl_->consoleHistory.size() > 1000) impl_->consoleHistory.pop_front();
}

static std::string handleCdpMessage(CDPHandler::Impl* impl, JSContext* ctx, const std::string& msg, int clientFd) {
    std::string id = extractJsonField(msg, "id");
    std::string method = extractJsonField(msg, "method");
    auto error = [&](int code, const std::string& message) {
        return "{\"id\":" + (id.empty() ? "null" : id) + ",\"error\":{\"code\":" +
               std::to_string(code) + ",\"message\":\"" + jsonEscape(message) + "\"}}";
    };
    if (id.empty() || method.empty()) return error(-32600, "Invalid Request");

    if (method == "Runtime.enable") {
        std::lock_guard<std::mutex> lock(impl->msgMutex);
        // Chrome's RuntimeModel registers its execution context from
        // Runtime.executionContextCreated emitted in response to enable. Send it
        // here (not only at connect) so the Console context/`$0`/eval target is
        // populated regardless of attach ordering.
        impl->targetedOutbound.emplace_back(clientFd,
            "{\"method\":\"Runtime.executionContextCreated\",\"params\":{"
            "\"context\":{\"id\":1,\"uniqueId\":\"rayact-main-1\",\"origin\":\"rayact://app\","
            "\"name\":\"main\",\"auxData\":{\"isDefault\":true,\"type\":\"default\",\"frameId\":\"rayact-frame\"}}}}");
        for (const auto& event : impl->consoleHistory) {
            impl->targetedOutbound.emplace_back(clientFd, event);
        }
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Runtime.addBinding") {
        const std::string name = extractJsonField(msg, "name");
        if (!ctx || name.empty()) {
            return "{\"id\":" + id + ",\"error\":{\"code\":-32602,\"message\":\"Binding name is required\"}}";
        }
        const std::string quotedName = "\"" + jsonEscape(name) + "\"";
        const std::string install =
            "globalThis[" + quotedName + "] = function(payload) {"
            "globalThis.__rayactEmitReactDevtoolsEvent('Runtime.bindingCalled', JSON.stringify({"
            "name:" + quotedName + ",payload:String(payload),executionContextId:1}));"
            "};";
        JSValue result = JS_Eval(ctx, install.c_str(), install.size(), "<cdp-binding>", JS_EVAL_TYPE_GLOBAL);
        if (JS_IsException(result)) {
            JS_FreeValue(ctx, result);
            return "{\"id\":" + id + ",\"error\":{\"code\":-32000,\"message\":\"Could not install runtime binding\"}}";
        }
        JS_FreeValue(ctx, result);
        impl->reactBindingClient.store(clientFd);
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "RayactReact.enable") {
        return "{\"id\":" + id + ",\"result\":{\"protocolVersion\":1}}";
    }
    if (method == "RayactReact.sendMessage") {
        // The development backend consumes this through the native bridge in
        // future frontend revisions. Acknowledge now so older frontends can
        // feature-detect the versioned transport without falling back to a
        // browser-only extension path.
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Debugger.enable") {
        // scriptParsed must be replayed after a frontend attaches; early
        // registrations otherwise disappear before DevTools enables Debugger.
        {
            std::lock_guard<std::mutex> lock(impl->msgMutex);
            for (const auto& [scriptId, script] : impl->scripts) {
                std::ostringstream ev;
                ev << "{\"method\":\"Debugger.scriptParsed\",\"params\":{"
                   << "\"scriptId\":\"" << scriptId << "\",\"url\":\"" << jsonEscape(script.url) << "\","
                   << "\"startLine\":0,\"startColumn\":0,\"endLine\":0,\"endColumn\":0,"
                   << "\"executionContextId\":1,\"hash\":\"\",\"hasSourceURL\":true}}";
                impl->outbound.push_back(ev.str());
            }
        }
        return "{\"id\":" + id + ",\"result\":{\"debuggerId\":\"rayact-1\"}}";
    }
    if (method == "Debugger.getScriptSource") {
        const int scriptId = atoi(extractJsonField(msg, "scriptId").c_str());
        std::string source;
        {
            std::lock_guard<std::mutex> lock(impl->msgMutex);
            auto it = impl->scripts.find(scriptId);
            if (it != impl->scripts.end()) source = it->second.source;
        }
        if (source.empty()) return "{\"id\":" + id + ",\"error\":{\"code\":-32000,\"message\":\"Unknown script\"}}";
        return "{\"id\":" + id + ",\"result\":{\"scriptSource\":\"" + jsonEscape(source) + "\"}}";
    }
    if (method == "Performance.enable") return "{\"id\":" + id + ",\"result\":{}}";
    if (method == "Performance.getMetrics") {
        JSMemoryUsage usage{};
        if (ctx) JS_ComputeMemoryUsage(JS_GetRuntime(ctx), &usage);
        const int64_t heapTotal = std::max(usage.memory_used_size, usage.malloc_size);
        double frameMs = 0, fps = 0, dropped = 0, janky = 0;
        if (ctx) {
            JSValue global = JS_GetGlobalObject(ctx);
            JSValue getter = JS_GetPropertyStr(ctx, global, "__rayactGetFrameDiagnostics");
            if (JS_IsFunction(ctx, getter)) {
                JSValue snapshot = JS_Call(ctx, getter, global, 0, nullptr);
                auto number = [&](const char* key, double* out) {
                    JSValue value = JS_GetPropertyStr(ctx, snapshot, key);
                    JS_ToFloat64(ctx, out, value);
                    JS_FreeValue(ctx, value);
                };
                if (!JS_IsException(snapshot)) {
                    number("rollingFrameTimeMs", &frameMs);
                    number("fps", &fps);
                    number("droppedFrames", &dropped);
                    number("jankyFrames", &janky);
                }
                JS_FreeValue(ctx, snapshot);
            }
            JS_FreeValue(ctx, getter);
            JS_FreeValue(ctx, global);
        }
        std::ostringstream metrics;
        metrics << "{\"id\":" << id << ",\"result\":{\"metrics\":["
                << "{\"name\":\"JSHeapUsedSize\",\"value\":" << usage.memory_used_size << "},"
                << "{\"name\":\"JSHeapTotalSize\",\"value\":" << heapTotal << "},"
                << "{\"name\":\"RayactFrameTime\",\"value\":" << frameMs << "},"
                << "{\"name\":\"RayactFPS\",\"value\":" << fps << "},"
                << "{\"name\":\"RayactDroppedFrames\",\"value\":" << dropped << "},"
                << "{\"name\":\"RayactJankyFrames\",\"value\":" << janky << "}"
                << "]}}";
        return metrics.str();
    }
    if (method == "Network.enable") {
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Network.getResponseBody") {
        const std::string requestId = extractJsonField(msg, "requestId");
        std::lock_guard<std::mutex> lock(impl->msgMutex);
        auto it = impl->responseBodies.find(requestId);
        if (it == impl->responseBodies.end()) {
            return error(-32000, "Response body is unavailable or was evicted");
        }
        return "{\"id\":" + id + ",\"result\":{\"body\":\"" +
               jsonEscape(it->second.data) + "\",\"base64Encoded\":" +
               (it->second.base64 ? "true" : "false") + "}}";
    }
    if (method == "Log.enable") {
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Runtime.evaluate") {
        std::string expr = extractJsonField(msg, "expression");
        if (ctx && !expr.empty()) {
            JSValue r = JS_Eval(ctx, expr.c_str(), expr.size(), "<cdp>", JS_EVAL_TYPE_GLOBAL);
            if (JS_IsException(r)) {
                JSValue exc = JS_GetException(ctx);
                const char* s = JS_ToCString(ctx, exc);
                const std::string text = s ? s : "Evaluation failed";
                if (s) JS_FreeCString(ctx, s);
                const std::string remote = remoteObjectJson(impl, ctx, exc, extractJsonField(msg, "objectGroup"));
                JS_FreeValue(ctx, exc);
                JS_FreeValue(ctx, r);
                return "{\"id\":" + id + ",\"result\":{\"result\":" + remote +
                       ",\"exceptionDetails\":{\"exceptionId\":1,\"text\":\"Uncaught\","
                       "\"lineNumber\":0,\"columnNumber\":0,\"exception\":" + remote +
                       ",\"description\":\"" + jsonEscape(text) + "\"}}}";
            }
            const std::string remote = remoteObjectJson(impl, ctx, r, extractJsonField(msg, "objectGroup"));
            JS_FreeValue(ctx, r);
            return "{\"id\":" + id + ",\"result\":{\"result\":" + remote + "}}";
        }
        return "{\"id\":" + id + ",\"result\":{\"result\":{\"type\":\"undefined\"}}}";
    }
    if (method == "Runtime.callFunctionOn") {
        const int objectId = remoteObjectId(extractJsonField(msg, "objectId"));
        auto target = impl->remoteObjects.find(objectId);
        const std::string declaration = extractJsonField(msg, "functionDeclaration");
        if (!ctx || declaration.empty()) return error(-32602, "functionDeclaration is required");
        const std::string source = "(" + declaration + ")";
        JSValue functionValue = JS_Eval(ctx, source.c_str(), source.size(), "<cdp-call>", JS_EVAL_TYPE_GLOBAL);
        if (JS_IsException(functionValue) || !JS_IsFunction(ctx, functionValue)) {
            JS_FreeValue(ctx, functionValue);
            return error(-32000, "Could not compile functionDeclaration");
        }
        JSValue thisValue = target == impl->remoteObjects.end() ? JS_UNDEFINED : target->second;
        JSValue result = JS_Call(ctx, functionValue, thisValue, 0, nullptr);
        JS_FreeValue(ctx, functionValue);
        if (JS_IsException(result)) {
            JSValue exception = JS_GetException(ctx);
            std::string remote = remoteObjectJson(impl, ctx, exception, extractJsonField(msg, "objectGroup"));
            JS_FreeValue(ctx, exception);
            JS_FreeValue(ctx, result);
            return "{\"id\":" + id + ",\"result\":{\"result\":" + remote +
                   ",\"exceptionDetails\":{\"text\":\"Uncaught\",\"exception\":" + remote + "}}}";
        }
        std::string remote = remoteObjectJson(impl, ctx, result, extractJsonField(msg, "objectGroup"));
        JS_FreeValue(ctx, result);
        return "{\"id\":" + id + ",\"result\":{\"result\":" + remote + "}}";
    }
    if (method == "Runtime.awaitPromise") {
        const int objectId = remoteObjectId(extractJsonField(msg, "promiseObjectId"));
        auto promise = impl->remoteObjects.find(objectId);
        if (!ctx || promise == impl->remoteObjects.end()) return error(-32000, "Could not find promise");
        const JSPromiseStateEnum state = JS_PromiseState(ctx, promise->second);
        if (state == JS_PROMISE_PENDING) return error(-32000, "Promise is still pending");
        if (state == JS_PROMISE_NOT_A_PROMISE) return error(-32602, "Object is not a Promise");
        JSValue result = JS_PromiseResult(ctx, promise->second);
        const std::string remote = remoteObjectJson(impl, ctx, result, extractJsonField(msg, "objectGroup"));
        JS_FreeValue(ctx, result);
        if (state == JS_PROMISE_REJECTED) {
            return "{\"id\":" + id + ",\"result\":{\"result\":" + remote +
                   ",\"exceptionDetails\":{\"text\":\"Uncaught (in promise)\",\"exception\":" + remote + "}}}";
        }
        return "{\"id\":" + id + ",\"result\":{\"result\":" + remote + "}}";
    }
    if (method == "Runtime.getProperties") {
        const int objectId = remoteObjectId(extractJsonField(msg, "objectId"));
        auto it = impl->remoteObjects.find(objectId);
        if (!ctx || it == impl->remoteObjects.end()) {
            return "{\"id\":" + id + ",\"error\":{\"code\":-32000,\"message\":\"Could not find object\"}}";
        }
        JSPropertyEnum* properties = nullptr;
        uint32_t count = 0;
        if (JS_GetOwnPropertyNames(ctx, &properties, &count, it->second,
                                   JS_GPN_STRING_MASK | JS_GPN_SYMBOL_MASK | JS_GPN_SET_ENUM) < 0) {
            return "{\"id\":" + id + ",\"error\":{\"code\":-32000,\"message\":\"Could not read properties\"}}";
        }
        std::ostringstream result;
        result << "{\"id\":" << id << ",\"result\":{\"result\":[";
        for (uint32_t i = 0; i < count; ++i) {
            if (i) result << ",";
            const char* name = JS_AtomToCString(ctx, properties[i].atom);
            JSValue value = JS_GetProperty(ctx, it->second, properties[i].atom);
            result << "{\"name\":\"" << jsonEscape(name ? name : "") << "\","
                   << "\"value\":" << remoteObjectJson(impl, ctx, value, impl->remoteObjectGroups[objectId]) << ","
                   << "\"writable\":true,\"configurable\":true,"
                   << "\"enumerable\":" << (properties[i].is_enumerable ? "true" : "false") << ","
                   << "\"isOwn\":true}";
            if (name) JS_FreeCString(ctx, name);
            JS_FreeValue(ctx, value);
        }
        JS_FreePropertyEnum(ctx, properties, count);
        result << "],\"internalProperties\":[]}}";
        return result.str();
    }
    if (method == "Runtime.releaseObject") {
        const int objectId = remoteObjectId(extractJsonField(msg, "objectId"));
        auto it = impl->remoteObjects.find(objectId);
        if (ctx && it != impl->remoteObjects.end()) {
            JS_FreeValue(ctx, it->second);
            impl->remoteObjects.erase(it);
            impl->remoteObjectGroups.erase(objectId);
        }
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Runtime.releaseObjectGroup") {
        const std::string group = extractJsonField(msg, "objectGroup");
        if (ctx) {
            for (auto it = impl->remoteObjects.begin(); it != impl->remoteObjects.end();) {
                if (impl->remoteObjectGroups[it->first] == group) {
                    JS_FreeValue(ctx, it->second);
                    impl->remoteObjectGroups.erase(it->first);
                    it = impl->remoteObjects.erase(it);
                } else {
                    ++it;
                }
            }
        }
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Runtime.getHeapUsage") {
        JSMemoryUsage usage{};
        if (ctx) JS_ComputeMemoryUsage(JS_GetRuntime(ctx), &usage);
        const int64_t total = std::max(usage.memory_used_size, usage.malloc_size);
        return "{\"id\":" + id + ",\"result\":{\"usedSize\":" +
               std::to_string(usage.memory_used_size) + ",\"totalSize\":" +
               std::to_string(total) + "}}";
    }
    if (method == "Memory.getDOMCounters") {
        const std::string dom = buildCdpDomJson();
        size_t nodes = 1;
        size_t pos = 0;
        while ((pos = dom.find("\"nodeId\"", pos)) != std::string::npos) { ++nodes; pos += 8; }
        return "{\"id\":" + id + ",\"result\":{\"documents\":1,\"nodes\":" +
               std::to_string(nodes) + ",\"jsEventListeners\":0}}";
    }
    if (method == "Debugger.setBreakpointByUrl") {
        return error(-32000, "Sources are read-only; breakpoints are not supported by QuickJS");
    }
    if (method == "Debugger.pause" || method == "Debugger.resume" ||
        method == "Debugger.stepInto" || method == "Debugger.stepOut" ||
        method == "Debugger.stepOver" || method == "Debugger.setScriptSource") {
        return error(-32000, "QuickJS pause, stepping, and live editing are not supported");
    }
    if (method == "Rayact.DOM.getDocument" || method == "DOM.getDocument") {
        return "{\"id\":" + id + ",\"result\":{\"root\":{\"nodeId\":1,\"backendNodeId\":1,"
               "\"nodeType\":9,\"nodeName\":\"#document\",\"localName\":\"\",\"nodeValue\":\"\","
               "\"documentURL\":\"rayact://app\",\"baseURL\":\"rayact://app\","
               "\"children\":[{\"nodeId\":2,\"backendNodeId\":2,\"nodeType\":1,"
               "\"nodeName\":\"RAYACT-APP\",\"localName\":\"rayact-app\",\"nodeValue\":\"\","
               "\"attributes\":[\"data-rayact-root\",\"true\"],\"children\":" +
               buildCdpDomJson() + "}]}}}";
    }
    if (method == "Page.getResourceTree") {
        return "{\"id\":" + id + ",\"result\":{\"frameTree\":{\"frame\":{\"id\":\"rayact-frame\","
               "\"loaderId\":\"rayact-loader\",\"url\":\"rayact://app\",\"securityOrigin\":\"rayact://app\","
               "\"mimeType\":\"text/html\"},\"resources\":[]}}}";
    }
    if (method == "DOM.requestChildNodes") {
        // getDocument already returns the full-depth tree; nothing more to send.
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "DOM.setInspectedNode") {
        const int nodeId = atoi(extractJsonField(msg, "nodeId").c_str());
        impl->inspectedNodes[clientFd] = nodeId;
        if (ctx && nodeId > 0) {
            JSValue global = JS_GetGlobalObject(ctx);
            JSValue object = JS_NewObject(ctx);
            JS_SetPropertyStr(ctx, object, "__rayactBackendNodeId", JS_NewInt32(ctx, nodeId));
            JS_SetPropertyStr(ctx, object, "nodeName", JS_NewString(ctx, "RayactHostNode"));
            JS_SetPropertyStr(ctx, global, "$0", object);
            JS_FreeValue(ctx, global);
        }
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "DOM.getNodeForLocation") {
        const float x = (float)atof(extractJsonField(msg, "x").c_str());
        const float y = (float)atof(extractJsonField(msg, "y").c_str());
        const int nativeId = getInspectorNodeAt(x, y);
        if (nativeId < 0) return error(-32000, "No node at location");
        const int cdpId = nativeId + 100;
        return "{\"id\":" + id + ",\"result\":{\"backendNodeId\":" +
               std::to_string(cdpId) + ",\"nodeId\":" + std::to_string(cdpId) + "}}";
    }
    if (method == "DOM.resolveNode") {
        std::string nodeId = extractJsonField(msg, "nodeId");
        if (nodeId.empty()) nodeId = extractJsonField(msg, "backendNodeId");
        if (!ctx || nodeId.empty()) return error(-32602, "nodeId or backendNodeId is required");
        JSValue object = JS_NewObject(ctx);
        JS_SetPropertyStr(ctx, object, "__rayactBackendNodeId", JS_NewInt32(ctx, atoi(nodeId.c_str())));
        JS_SetPropertyStr(ctx, object, "nodeName", JS_NewString(ctx, "RayactHostNode"));
        std::string remote = remoteObjectJson(impl, ctx, object, extractJsonField(msg, "objectGroup"));
        JS_FreeValue(ctx, object);
        return "{\"id\":" + id + ",\"result\":{\"object\":" + remote + "}}";
    }
    if (method == "DOM.requestNode") {
        const int objectId = remoteObjectId(extractJsonField(msg, "objectId"));
        auto object = impl->remoteObjects.find(objectId);
        if (!ctx || object == impl->remoteObjects.end()) return error(-32000, "Could not find object");
        JSValue value = JS_GetPropertyStr(ctx, object->second, "__rayactBackendNodeId");
        int32_t nodeId = 0;
        JS_ToInt32(ctx, &nodeId, value);
        JS_FreeValue(ctx, value);
        if (nodeId <= 0) return error(-32000, "Object is not a Rayact host node");
        return "{\"id\":" + id + ",\"result\":{\"nodeId\":" + std::to_string(nodeId) + "}}";
    }
    if (method == "DOM.pushNodesByBackendIdsToFrontend") {
        // backendNodeId == nodeId in this backend; echo the ids back.
        std::string ids = "[]";
        size_t arrStart = msg.find("\"backendNodeIds\"");
        if (arrStart != std::string::npos) {
            size_t open = msg.find('[', arrStart);
            size_t close = msg.find(']', open);
            if (open != std::string::npos && close != std::string::npos) {
                ids = msg.substr(open, close - open + 1);
            }
        }
        return "{\"id\":" + id + ",\"result\":{\"nodeIds\":" + ids + "}}";
    }
    if (method == "DOM.getBoxModel") {
        std::string nodeIdStr = extractJsonField(msg, "nodeId");
        if (nodeIdStr.empty()) nodeIdStr = extractJsonField(msg, "backendNodeId");
        std::string model = nodeIdStr.empty() ? "" : buildCdpBoxModelJson(atoi(nodeIdStr.c_str()));
        if (model.empty()) {
            return "{\"id\":" + id + ",\"error\":{\"code\":-32000,\"message\":\"No node\"}}";
        }
        return "{\"id\":" + id + ",\"result\":{\"model\":" + model + "}}";
    }
    if (method == "CSS.getMatchedStylesForNode") {
        std::string nodeIdStr = extractJsonField(msg, "nodeId");
        std::string style = nodeIdStr.empty() ? "" : buildCdpNodeStyleJson(atoi(nodeIdStr.c_str()));
        if (style.empty()) {
            return "{\"id\":" + id + ",\"result\":{}}";
        }
        return "{\"id\":" + id + ",\"result\":{\"inlineStyle\":" + style +
               ",\"matchedCSSRules\":[],\"inherited\":[],\"pseudoElements\":[],"
               "\"cssKeyframesRules\":[]}}";
    }
    if (method == "CSS.getComputedStyleForNode") {
        std::string nodeIdStr = extractJsonField(msg, "nodeId");
        std::string props = nodeIdStr.empty() ? "" : buildCdpComputedStyleJson(atoi(nodeIdStr.c_str()));
        if (props.empty()) props = "[]";
        return "{\"id\":" + id + ",\"result\":{\"computedStyle\":" + props + "}}";
    }
    if (method == "Overlay.setInspectMode") {
        std::string mode = extractJsonField(msg, "mode");
        const bool enable = (mode == "searchForNode");
        if (enable) {
            impl->cdpInspectMode = true;
            impl->lastPickedNode = getInspectorPickedNode();
            setInspectorPickMode(true);
        } else if (impl->cdpInspectMode) {
            // Only clear pick mode CDP itself enabled — leave the in-app
            // dev-menu toggle alone if that is what turned picking on.
            impl->cdpInspectMode = false;
            setInspectorPickMode(false);
        }
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Overlay.highlightNode" || method == "DOM.highlightNode") {
        std::string nodeIdStr = extractJsonField(msg, "nodeId");
        if (nodeIdStr.empty()) nodeIdStr = extractJsonField(msg, "backendNodeId");
        if (!nodeIdStr.empty()) {
            setInspectorHighlight(rayactNodeIdFromCdpId(atoi(nodeIdStr.c_str())));
        }
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Overlay.hideHighlight" || method == "DOM.hideHighlight") {
        setInspectorHighlight(-1);
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Tracing.start") {
        impl->tracingClients.insert(clientFd);
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Tracing.end") {
        if (!impl->tracingClients.erase(clientFd)) return error(-32000, "Tracing was not started");
        JSMemoryUsage usage{};
        if (ctx) JS_ComputeMemoryUsage(JS_GetRuntime(ctx), &usage);
        const auto now = std::chrono::duration<double, std::micro>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
        std::ostringstream data;
        data << "{\"method\":\"Tracing.dataCollected\",\"params\":{\"value\":["
             << "{\"name\":\"process_name\",\"cat\":\"__metadata\",\"ph\":\"M\",\"pid\":1,\"tid\":1,\"ts\":0,\"args\":{\"name\":\"Rayact QuickJS\"}},"
             << "{\"name\":\"UpdateCounters\",\"cat\":\"devtools.timeline\",\"ph\":\"I\",\"s\":\"t\",\"pid\":1,\"tid\":1,\"ts\":" << now
             << ",\"args\":{\"data\":{\"jsHeapSizeUsed\":" << usage.memory_used_size << "}}}"
             << "]}}";
        impl->targetedOutbound.emplace_back(clientFd, data.str());
        impl->targetedOutbound.emplace_back(clientFd,
            "{\"method\":\"Tracing.tracingComplete\",\"params\":{\"dataLossOccurred\":false}}" );
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "HeapProfiler.enable" || method == "HeapProfiler.disable") {
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method.rfind("HeapProfiler.", 0) == 0) {
        return error(-32000, "QuickJS heap snapshots and allocation profiling are not supported");
    }
    static const std::set<std::string> readOnlyMutations = {
        "DOM.setAttributeValue", "DOM.setAttributesAsText", "DOM.removeAttribute",
        "DOM.setNodeValue", "DOM.setOuterHTML", "DOM.removeNode", "CSS.setStyleTexts",
        "CSS.setRuleSelector", "CSS.addRule"
    };
    if (readOnlyMutations.count(method)) {
        return error(-32000, "Elements are read-only in Rayact DevTools v1");
    }
    static const std::set<std::string> noOpEnables = {
        "DOM.enable", "DOM.disable", "CSS.enable", "CSS.disable", "Overlay.enable",
        "Overlay.disable", "Page.enable", "Page.disable", "Network.disable", "Runtime.disable",
        "Debugger.disable", "Log.disable", "Performance.disable"
    };
    if (noOpEnables.count(method)) return "{\"id\":" + id + ",\"result\":{}}";
    return error(-32601, "Method not found: " + method);
}

// Answer one HTTP request or upgrade the socket to a CDP WebSocket client.
// Never blocks on an open WS session — frames are read by serverLoop's select
// and handled on the engine thread via pump().
static void handleClientRequest(CDPHandler::Impl* impl, int clientFd, const std::string& req) {

    if (req.find("GET /json/list") != std::string::npos ||
        (req.find("GET /json") != std::string::npos &&
         req.find("GET /json/version") == std::string::npos)) {
        std::string body;
        {
            std::lock_guard<std::mutex> lock(impl->msgMutex);
            body = handleJsonList(impl->port, impl->title, impl->devtoolsFrontendUrl);
        }
        std::ostringstream resp;
        resp << "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: "
             << body.size() << "\r\n\r\n" << body;
        sendAll(clientFd, resp.str());
        close(clientFd);
        return;
    }
    if (req.find("GET /json/version") != std::string::npos) {
        std::string body = handleJsonVersion(impl->port);
        std::ostringstream resp;
        resp << "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: "
             << body.size() << "\r\n\r\n" << body;
        sendAll(clientFd, resp.str());
        close(clientFd);
        return;
    }

    if (req.find("Upgrade: websocket") != std::string::npos ||
        req.find("upgrade: websocket") != std::string::npos) {
        std::string wsKey;
        size_t keyPos = req.find("Sec-WebSocket-Key:");
        if (keyPos == std::string::npos) keyPos = req.find("sec-websocket-key:");
        if (keyPos != std::string::npos) {
            keyPos = req.find(':', keyPos) + 1;
            while (keyPos < req.size() && (req[keyPos] == ' ' || req[keyPos] == '\t')) keyPos++;
            size_t keyEnd = req.find("\r\n", keyPos);
            wsKey = req.substr(keyPos, keyEnd - keyPos);
        }
        std::string acceptKey;
        if (!wsKey.empty()) {
            std::string concat = wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
#if defined(__ANDROID__) || defined(__APPLE__)
            unsigned char hash[20];
            sha1Hash((const unsigned char*)concat.data(), concat.size(), hash);
            acceptKey = base64Encode(hash, 20);
#else
            unsigned char hash[SHA_DIGEST_LENGTH];
            SHA1((const unsigned char*)concat.data(), concat.size(), hash);
            BIO* b64 = BIO_new(BIO_f_base64());
            BIO* mem = BIO_new(BIO_s_mem());
            b64 = BIO_push(b64, mem);
            BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
            BIO_write(b64, hash, SHA_DIGEST_LENGTH);
            BIO_flush(b64);
            BUF_MEM* bptr;
            BIO_get_mem_ptr(b64, &bptr);
            acceptKey.assign(bptr->data, bptr->length);
            BIO_free_all(b64);
#endif
        } else {
            acceptKey = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";
        }
        std::ostringstream handshake;
        handshake << "HTTP/1.1 101 Switching Protocols\r\n"
                  << "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                  << "Sec-WebSocket-Accept: " << acceptKey << "\r\n\r\n";
        sendAll(clientFd, handshake.str());

        {
            std::lock_guard<std::mutex> lock(impl->clientMutex);
            impl->clients.push_back(clientFd);
            impl->rxBuffers[clientFd] = {};
            impl->fragmentedPayloads.erase(clientFd);
            impl->fragmentedOpcodes.erase(clientFd);
        }

        // React Native's pinned frontend intentionally binds its React
        // DevTools backend only to the single runtime context named `main`.
        std::string hello = "{\"method\":\"Runtime.executionContextCreated\",\"params\":{"
                            "\"context\":{\"id\":1,\"origin\":\"\",\"name\":\"main\"}}}";
        queueWsText(impl, clientFd, hello);
        return;
    }

    std::string notFound = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
    sendAll(clientFd, notFound);
    close(clientFd);
}

static void dropWsClient(CDPHandler::Impl* impl, int fd) {
    close(fd);
    if (impl->reactBindingClient.load() == fd) impl->reactBindingClient.store(-1);
    impl->tracingClients.erase(fd);
    impl->inspectedNodes.erase(fd);
    std::lock_guard<std::mutex> lock(impl->clientMutex);
    auto& v = impl->clients;
    v.erase(std::remove(v.begin(), v.end(), fd), v.end());
    impl->rxBuffers.erase(fd);
    impl->fragmentedPayloads.erase(fd);
    impl->fragmentedOpcodes.erase(fd);
    {
        std::lock_guard<std::mutex> writeLock(impl->writeMutex);
        auto pending = impl->pendingWrites.find(fd);
        if (pending != impl->pendingWrites.end()) {
            for (const auto& write : pending->second)
                impl->pendingWriteBytes -= write.bytes.size() - write.offset;
            impl->pendingWrites.erase(pending);
        }
    }
}

// Socket-thread read of one WS client: buffer bytes, queue complete text
// frames for the engine thread, answer pings, honor close.
static bool readWsClient(CDPHandler::Impl* impl, int fd) {
    char buf[8192];
    ssize_t n = recv(fd, buf, sizeof(buf), 0);
    if (n <= 0) { dropWsClient(impl, fd); return false; }

    std::vector<WsFrame> frames;
    {
        std::lock_guard<std::mutex> lock(impl->clientMutex);
        auto it = impl->rxBuffers.find(fd);
        if (it == impl->rxBuffers.end()) return false;
        it->second.insert(it->second.end(), buf, buf + n);
        wsExtractFrames(it->second, frames);
    }
    for (const WsFrame& frame : frames) {
        if (frame.opcode == 0x8) { dropWsClient(impl, fd); return false; }
        if (frame.opcode == 0x9) { // ping → pong
            std::vector<uint8_t> pong;
            pong.push_back(0x8a);
            pong.push_back((uint8_t)std::min<size_t>(frame.payload.size(), 125));
            pong.insert(pong.end(), frame.payload.begin(), frame.payload.end());
            send(fd, pong.data(), pong.size(), 0);
            continue;
        }
        if (frame.opcode == 0x1 && !frame.fin) {
            std::lock_guard<std::mutex> lock(impl->clientMutex);
            impl->fragmentedOpcodes[fd] = frame.opcode;
            impl->fragmentedPayloads[fd] = frame.payload;
            continue;
        }
        if (frame.opcode == 0x0) {
            std::string complete;
            bool ready = false;
            {
                std::lock_guard<std::mutex> lock(impl->clientMutex);
                auto opcode = impl->fragmentedOpcodes.find(fd);
                if (opcode == impl->fragmentedOpcodes.end() || opcode->second != 0x1) continue;
                impl->fragmentedPayloads[fd] += frame.payload;
                if (frame.fin) {
                    complete.swap(impl->fragmentedPayloads[fd]);
                    impl->fragmentedPayloads.erase(fd);
                    impl->fragmentedOpcodes.erase(fd);
                    ready = true;
                }
            }
            if (ready && !complete.empty()) {
                std::lock_guard<std::mutex> lock(impl->msgMutex);
                impl->inbound.emplace_back(fd, std::move(complete));
            }
            continue;
        }
        if (frame.opcode != 0x1 || !frame.fin || frame.payload.empty()) continue;
        std::lock_guard<std::mutex> lock(impl->msgMutex);
        impl->inbound.emplace_back(fd, frame.payload);
    }
    return true;
}

static void serverLoop(CDPHandler::Impl* impl) {
#ifndef _WIN32
    impl->listenFd = socket(AF_INET, SOCK_STREAM, 0);
    if (impl->listenFd < 0) return;

    int opt = 1;
    setsockopt(impl->listenFd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons((uint16_t)impl->port);

    if (bind(impl->listenFd, (sockaddr*)&addr, sizeof(addr)) < 0) {
        close(impl->listenFd);
        impl->listenFd = -1;
        return;
    }
    if (listen(impl->listenFd, 8) < 0) {
        close(impl->listenFd);
        impl->listenFd = -1;
        return;
    }

    fprintf(stderr, "[cdp] Debug server started on ws://127.0.0.1:%d\n", impl->port);

#ifdef __ANDROID__
    fprintf(stderr, "[cdp] Run: adb forward tcp:%d tcp:%d\n", impl->port, impl->port);
#endif

    while (impl->running.load()) {
        fd_set readFds;
        fd_set writeFds;
        FD_ZERO(&readFds);
        FD_ZERO(&writeFds);
        FD_SET(impl->listenFd, &readFds);
        int maxFd = impl->listenFd;
        std::vector<int> wsFds;
        {
            std::lock_guard<std::mutex> lock(impl->clientMutex);
            wsFds = impl->clients;
        }
        for (int fd : wsFds) {
            FD_SET(fd, &readFds);
            maxFd = std::max(maxFd, fd);
        }
        {
            std::lock_guard<std::mutex> lock(impl->writeMutex);
            for (int fd : wsFds) {
                auto pending = impl->pendingWrites.find(fd);
                if (pending != impl->pendingWrites.end() && !pending->second.empty())
                    FD_SET(fd, &writeFds);
            }
        }
        std::vector<int> httpFds;
        for (const auto& [fd, ignored] : impl->pendingHttp) {
            (void)ignored;
            FD_SET(fd, &readFds);
            maxFd = std::max(maxFd, fd);
            httpFds.push_back(fd);
        }
        timeval tv{0, 200000};
        int r = select(maxFd + 1, &readFds, &writeFds, nullptr, &tv);
        if (r < 0) continue;
        for (int fd : wsFds) {
            if (FD_ISSET(fd, &readFds) && !readWsClient(impl, fd)) continue;
            if (FD_ISSET(fd, &writeFds) && !flushWsWrites(impl, fd))
                dropWsClient(impl, fd);
        }
        for (int fd : httpFds) {
            if (!FD_ISSET(fd, &readFds)) continue;
            char buf[8192];
            ssize_t n = recv(fd, buf, sizeof(buf), 0);
            if (n <= 0) {
                close(fd);
                impl->pendingHttp.erase(fd);
                impl->pendingHttpSince.erase(fd);
                continue;
            }
            auto& request = impl->pendingHttp[fd];
            request.append(buf, (size_t)n);
            if (request.size() > 65536) {
                close(fd);
                impl->pendingHttp.erase(fd);
                impl->pendingHttpSince.erase(fd);
                continue;
            }
            if (request.find("\r\n\r\n") != std::string::npos) {
                std::string complete = std::move(request);
                impl->pendingHttp.erase(fd);
                impl->pendingHttpSince.erase(fd);
                handleClientRequest(impl, fd, complete);
            }
        }
        const auto now = std::chrono::steady_clock::now();
        for (auto it = impl->pendingHttpSince.begin(); it != impl->pendingHttpSince.end();) {
            if (now - it->second > std::chrono::seconds(2)) {
                close(it->first);
                impl->pendingHttp.erase(it->first);
                it = impl->pendingHttpSince.erase(it);
            } else {
                ++it;
            }
        }
        if (FD_ISSET(impl->listenFd, &readFds)) {
            int client = accept(impl->listenFd, nullptr, nullptr);
            if (client >= 0) {
                // Keep incomplete HTTP handshakes in the select loop. Chrome
                // intentionally opens speculative idle sockets; reading here
                // would block discovery for every real /json request behind it.
                impl->pendingHttp.emplace(client, std::string{});
                impl->pendingHttpSince[client] = std::chrono::steady_clock::now();
            }
        }
    }

    if (impl->listenFd >= 0) {
        close(impl->listenFd);
        impl->listenFd = -1;
    }
    for (const auto& [fd, ignored] : impl->pendingHttp) {
        (void)ignored;
        close(fd);
    }
    impl->pendingHttp.clear();
    impl->pendingHttpSince.clear();
    std::vector<int> remainingClients;
    {
        std::lock_guard<std::mutex> lock(impl->clientMutex);
        remainingClients = impl->clients;
    }
    for (int fd : remainingClients) dropWsClient(impl, fd);
#endif
}

// Deliver one CDP message through the session-owned native transport. The
// platform callback wraps it with the current page/session identifiers and
// sends it to the host InspectorProxy without crossing through app JavaScript.
static void sendToUplink(CDPHandler::Impl* impl, const std::string& msg) {
    if (impl && impl->outboundCallback) impl->outboundCallback(impl->outboundOpaque, msg.c_str());
}

bool CDPHandler::start(JSContext* ctx) {
    if (!impl_ || impl_->running.load()) return false;
    impl_->ctx = ctx;
    g_instance = this;
    impl_->running.store(true);
    // No on-device socket server: CDP rides the dev client's `/rayact/debugger`
    // uplink (see sendToUplink / enqueueInbound). This removes the hand-rolled
    // HTTP/WS server (accept storms, FD_SETSIZE, real-Chrome ws drops) — the dev
    // server (Node `ws`) now terminates the Chrome connection.
    return impl_->running.load();
}

void CDPHandler::stop() {
    if (!impl_ || !impl_->running.load()) return;
    impl_->running.store(false);
    if (impl_->ctx) {
        for (auto& [id, value] : impl_->remoteObjects) {
            (void)id;
            JS_FreeValue(impl_->ctx, value);
        }
    }
    impl_->remoteObjects.clear();
    impl_->remoteObjectGroups.clear();
    g_instance = nullptr;
}

void CDPHandler::pump(JSContext* ctx) {
    if (!impl_ || !impl_->running.load()) return;
    impl_->ctx = ctx;

    // Handle queued CDP requests here, on the engine thread — DOM/JS access
    // must not race the render loop.
    // Chrome enables many domains at once. Bound engine-thread inspector work
    // per render pump so an attach burst cannot monopolize an entire frame.
    static constexpr size_t kMaxRequestsPerPump = 8;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(2);
    for (size_t i = 0; i < kMaxRequestsPerPump; ++i) {
        std::pair<int, std::string> request;
        {
            std::lock_guard<std::mutex> lock(impl_->msgMutex);
            if (impl_->inbound.empty()) break;
            request = std::move(impl_->inbound.front());
            impl_->inbound.pop_front();
            impl_->inboundBytes -= request.second.size();
        }
        const auto& [fd, msg] = request;
        std::string reply = handleCdpMessage(impl_, ctx, msg, fd);
        if (!reply.empty()) sendToUplink(impl_, reply);
        if (std::chrono::steady_clock::now() >= deadline) break;
    }

    // DevTools-driven element picking: surface native tap-to-inspect picks as
    // Overlay.inspectNodeRequested so the Elements panel selects the node.
    if (impl_->cdpInspectMode) {
        const int picked = getInspectorPickedNode();
        if (picked >= 0 && picked != impl_->lastPickedNode) {
            impl_->lastPickedNode = picked;
            std::ostringstream ev;
            ev << "{\"method\":\"Overlay.inspectNodeRequested\",\"params\":{"
               << "\"backendNodeId\":" << (picked + 100) << "}}";
            std::lock_guard<std::mutex> lock(impl_->msgMutex);
            impl_->outbound.push_back(ev.str());
        }
    }

    // Deliver events + binding traffic to the single attached frontend. With a
    // proxy-terminated session there is exactly one logical CDP client, so the
    // former per-fd broadcast/targeting collapses to one uplink.
    std::vector<std::string> events;
    std::vector<std::pair<int, std::string>> targetedEvents;
    {
        std::lock_guard<std::mutex> lock(impl_->msgMutex);
        events.swap(impl_->outbound);
        targetedEvents.swap(impl_->targetedOutbound);
    }
    for (const auto& ev : events) sendToUplink(impl_, ev);
    for (const auto& [fd, ev] : targetedEvents) { (void)fd; sendToUplink(impl_, ev); }
}

void CDPHandler::enqueueInbound(const char* json) {
    if (!impl_ || !json || !*json) return;
    const size_t size = strlen(json);
    if (size > kMaxInboundMessage) return;
    {
        std::lock_guard<std::mutex> lock(impl_->msgMutex);
        if (impl_->inbound.size() >= kMaxInboundMessages || impl_->inboundBytes + size > kMaxInboundBytes) return;
        impl_->inbound.emplace_back(0, std::string(json));
        impl_->inboundBytes += size;
    }
    // Wake an idle on-demand host so the next frame's pump drains this command.
    engineRequestFrame();
}

void CDPHandler::setOutboundCallback(OutboundCallback callback, void* opaque) {
    if (!impl_) return;
    std::lock_guard<std::mutex> lock(impl_->msgMutex);
    impl_->outboundCallback = callback;
    impl_->outboundOpaque = opaque;
}

bool CDPHandler::hasPendingInbound() const {
    if (!impl_) return false;
    std::lock_guard<std::mutex> lock(impl_->msgMutex);
    return !impl_->inbound.empty();
}

void CDPHandler::setTitle(const char* title) {
    if (!impl_ || !title) return;
    std::lock_guard<std::mutex> lock(impl_->msgMutex);
    impl_->title = title;
    // Stock Chrome is the primary CDP frontend. The version-matched React
    // frontend is exposed separately by the development manifest; advertising
    // it here replaces Chrome's Elements/Console/Sources inspector link.
    impl_->devtoolsFrontendUrl.clear();
}

void CDPHandler::notifyDocumentUpdated() {
    if (!impl_) return;
    std::lock_guard<std::mutex> lock(impl_->msgMutex);
    impl_->outbound.push_back("{\"method\":\"DOM.documentUpdated\",\"params\":{}}");
}

void CDPHandler::retarget(JSContext* ctx) {
    if (!impl_) return;
    if (impl_->ctx && impl_->ctx != ctx) {
        for (auto& [id, value] : impl_->remoteObjects) {
            (void)id;
            JS_FreeValue(impl_->ctx, value);
        }
        impl_->remoteObjects.clear();
        impl_->remoteObjectGroups.clear();
    }
    impl_->ctx = ctx;
    if (impl_->cdpInspectMode) {
        impl_->cdpInspectMode = false;
        impl_->lastPickedNode = -1;
    }
    notifyDocumentUpdated();
}

bool CDPHandler::isRunning() const {
    return impl_ && impl_->running.load();
}

} // namespace rayact
