#include "cdp_handler.hpp"
#include "raym3_bridge.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#ifdef __ANDROID__
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
    for (int i = 0; i < 5; ++i) {
        uint32_t v = (&h0)[i];
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
#include <unistd.h>
#ifdef __ANDROID__
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
    std::mutex msgMutex;
    std::vector<std::string> outbound;
    int nextScriptId = 1;
    std::map<int, std::string> scripts;
    int nextMsgId = 1;
};

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

static std::string handleJsonList(int port) {
    std::ostringstream ss;
    ss << "[{"
       << "\"description\":\"Rayact Dev Client\","
       << "\"devtoolsFrontendUrl\":\"devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=localhost:"
       << port << "/rayact-main\","
       << "\"id\":\"rayact-main\","
       << "\"title\":\"Rayact - QuickJS\","
       << "\"type\":\"page\","
       << "\"webSocketDebuggerUrl\":\"ws://localhost:" << port << "/rayact-main\""
       << "}]";
    return ss.str();
}

static std::string handleJsonVersion(int port) {
    std::ostringstream ss;
    ss << "{"
       << "\"Browser\":\"Rayact/0.1.0\","
       << "\"Protocol-Version\":\"1.3\","
       << "\"User-Agent\":\"Rayact/0.1.0\","
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

static void wsSendText(int fd, const std::string& text) {
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
    send(fd, frame.data(), frame.size(), 0);
}

static std::string wsRecvText(const std::vector<uint8_t>& data) {
    if (data.size() < 2) return "";
    size_t offset = 2;
    uint8_t mask = data[1] & 0x80;
    uint64_t len = data[1] & 0x7f;
    if (len == 126) {
        len = ((uint64_t)data[2] << 8) | data[3];
        offset = 4;
    } else if (len == 127) {
        len = 0;
        for (int i = 0; i < 8; ++i) len = (len << 8) | data[2 + i];
        offset = 10;
    }
    uint8_t masking[4] = {0, 0, 0, 0};
    if (mask) {
        memcpy(masking, data.data() + offset, 4);
        offset += 4;
    }
    std::string out;
    out.resize((size_t)len);
    for (size_t i = 0; i < (size_t)len && offset + i < data.size(); ++i) {
        out[i] = (char)(data[offset + i] ^ (mask ? masking[i % 4] : 0));
    }
    return out;
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
        size_t end = json.find('"', pos);
        if (end == std::string::npos) return "";
        return json.substr(pos, end - pos);
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
    impl_->scripts[scriptId] = source ? source : "";
    std::ostringstream ev;
    ev << "{\"method\":\"Debugger.scriptParsed\",\"params\":{"
       << "\"scriptId\":\"" << scriptId << "\","
       << "\"url\":\"" << jsonEscape(url ? url : "") << "\","
       << "\"startLine\":0,\"startColumn\":0,\"endLine\":0,\"endColumn\":0,"
       << "\"executionContextId\":1,\"hash\":\"\",\"hasSourceURL\":true"
       << "}}";
    impl_->outbound.push_back(ev.str());
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
}

static std::string handleCdpMessage(CDPHandler::Impl* impl, JSContext* ctx, const std::string& msg) {
    std::string id = extractJsonField(msg, "id");
    std::string method = extractJsonField(msg, "method");

    if (method == "Runtime.enable") {
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Debugger.enable") {
        return "{\"id\":" + id + ",\"result\":{\"debuggerId\":\"rayact-1\"}}";
    }
    if (method == "Network.enable") {
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Log.enable") {
        return "{\"id\":" + id + ",\"result\":{}}";
    }
    if (method == "Runtime.evaluate") {
        std::string expr = extractJsonField(msg, "expression");
        if (ctx && !expr.empty()) {
            JSValue r = JS_Eval(ctx, expr.c_str(), expr.size(), "<cdp>", JS_EVAL_TYPE_GLOBAL);
            std::string value = "undefined";
            if (JS_IsException(r)) {
                value = "error";
                JSValue exc = JS_GetException(ctx);
                const char* s = JS_ToCString(ctx, exc);
                if (s) { value = s; JS_FreeCString(ctx, s); }
                JS_FreeValue(ctx, exc);
            } else {
                const char* s = JS_ToCString(ctx, r);
                if (s) { value = s; JS_FreeCString(ctx, s); }
            }
            JS_FreeValue(ctx, r);
            return "{\"id\":" + id + ",\"result\":{\"result\":{\"type\":\"string\",\"value\":\"" +
                   jsonEscape(value) + "\"},\"wasThrown\":false}}";
        }
        return "{\"id\":" + id + ",\"result\":{\"result\":{\"type\":\"undefined\"}}}";
    }
    if (method == "Debugger.setBreakpointByUrl") {
        return "{\"id\":" + id + ",\"result\":{\"breakpointId\":\"bp-1\",\"locations\":[]}}";
    }
    if (method == "Rayact.DOM.getDocument" || method == "DOM.getDocument") {
        std::string tree = jsonEscape(buildNodeTreeJson());
        return "{\"id\":" + id + ",\"result\":{\"root\":{\"nodeId\":1,\"nodeType\":9,\"nodeName\":\"#document\",\"children\":"
               + tree + "}}}";
    }
    return "{\"id\":" + id + ",\"result\":{}}";
}

static void handleClient(CDPHandler::Impl* impl, int clientFd) {
    char buf[8192];
    ssize_t n = recv(clientFd, buf, sizeof(buf) - 1, 0);
    if (n <= 0) { close(clientFd); return; }
    buf[n] = '\0';
    std::string req(buf);

    if (req.find("GET /json/list") != std::string::npos) {
        std::string body = handleJsonList(impl->port);
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
#ifdef __ANDROID__
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
        }

        std::string hello = "{\"method\":\"Runtime.executionContextCreated\",\"params\":{"
                            "\"context\":{\"id\":1,\"origin\":\"\",\"name\":\"Rayact\"}}}";
        wsSendText(clientFd, hello);

        while (impl->running.load()) {
            n = recv(clientFd, buf, sizeof(buf), 0);
            if (n <= 0) break;
            std::string cdpMsg = wsRecvText(std::vector<uint8_t>(buf, buf + n));
            if (cdpMsg.empty()) continue;
            std::string reply = handleCdpMessage(impl, impl->ctx, cdpMsg);
            if (!reply.empty()) wsSendText(clientFd, reply);
        }

        close(clientFd);
        std::lock_guard<std::mutex> lock(impl->clientMutex);
        auto& v = impl->clients;
        v.erase(std::remove(v.begin(), v.end(), clientFd), v.end());
        return;
    }

    std::string notFound = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
    sendAll(clientFd, notFound);
    close(clientFd);
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
    fprintf(stderr, "[cdp] Run: adb reverse tcp:%d tcp:%d\n", impl->port, impl->port);
#endif

    while (impl->running.load()) {
        fd_set fds;
        FD_ZERO(&fds);
        FD_SET(impl->listenFd, &fds);
        timeval tv{0, 200000};
        int r = select(impl->listenFd + 1, &fds, nullptr, nullptr, &tv);
        if (r <= 0) continue;
        int client = accept(impl->listenFd, nullptr, nullptr);
        if (client >= 0) handleClient(impl, client);
    }

    if (impl->listenFd >= 0) {
        close(impl->listenFd);
        impl->listenFd = -1;
    }
#endif
}

bool CDPHandler::start(JSContext* ctx) {
    if (!impl_ || impl_->running.load()) return false;
    impl_->ctx = ctx;
    g_instance = this;
    impl_->running.store(true);
    impl_->serverThread = std::thread(serverLoop, impl_);
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    return impl_->running.load();
}

void CDPHandler::stop() {
    if (!impl_ || !impl_->running.load()) return;
    impl_->running.store(false);
    if (impl_->listenFd >= 0) {
        close(impl_->listenFd);
        impl_->listenFd = -1;
    }
    if (impl_->serverThread.joinable()) impl_->serverThread.join();
    g_instance = nullptr;
}

void CDPHandler::pump(JSContext* ctx) {
    if (!impl_ || !impl_->running.load()) return;
    impl_->ctx = ctx;
    std::vector<std::string> events;
    {
        std::lock_guard<std::mutex> lock(impl_->msgMutex);
        events.swap(impl_->outbound);
    }
    std::lock_guard<std::mutex> lock(impl_->clientMutex);
    for (int fd : impl_->clients) {
        for (const auto& ev : events) wsSendText(fd, ev);
    }
}

bool CDPHandler::isRunning() const {
    return impl_ && impl_->running.load();
}

} // namespace rayact
