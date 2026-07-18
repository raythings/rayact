// Web build stubs: engine_js.cpp calls into the plugin loader, the dev-client
// bridge, and the CDP/devtools server unconditionally. Those desktop units pull in
// dlopen / libcurl / libwebsockets and are excluded from the web build. Provide
// no-op implementations so the engine links. (Phase 2 wires the real dev-client
// over Emscripten WebSockets; web plugin fallbacks land in Phase 4.)

extern "C" {
#include "quickjs.h"
}
#include <string>
#include <vector>
#include <cstdint>
#include <cstdlib>
#include <emscripten.h>
#include "module_bus.hpp"
#include "web_platform.hpp"

// General binary HTTP fetch used when an app explicitly resolves a remote asset.
// This remains available in release hosts and intentionally has no dev-prefetch
// cache or manifest/revision behavior.
EM_JS(uint8_t*, rayactWebGetBytes, (const char* urlPtr, uint32_t* outLength), {
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', UTF8ToString(urlPtr), false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        if (xhr.status < 200 || xhr.status >= 300 || !xhr.response) return 0;
        var bytes = new Uint8Array(xhr.response);
        var ptr = _malloc(bytes.byteLength || 1);
        if (bytes.byteLength) HEAPU8.set(bytes, ptr);
        HEAPU32[outLength >> 2] = bytes.byteLength;
        return ptr;
    } catch (e) {
        return 0;
    }
});

#if !RAYACT_RELEASE_HOST
// Synchronous same/cross-origin GET for the dev loader. The module-HMR runtime
// fetches modules synchronously (QuickJS eval is sync), so this is a sync XHR —
// only used in dev, never in production bundles.
EM_JS(char*, rayactWebSyncGet, (const char* urlPtr), {
    try {
        var url = UTF8ToString(urlPtr);
        var key;
        try { key = new URL(url, location.href).href; } catch (_) { key = url; }
        var cache = Module.__rayactPrefetchCache;
        var warm = cache && cache.get(key);
        var isManifest = key.indexOf('/rayact/manifest.json') !== -1;
        if (warm && (isManifest || warm.revision === Module.__rayactActiveRevision)) {
            cache.delete(key);
            var text = new TextDecoder().decode(warm.bytes);
            var warmLen = lengthBytesUTF8(text) + 1;
            var warmBuf = _malloc(warmLen);
            stringToUTF8(text, warmBuf, warmLen);
            return warmBuf;
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.send(null);
        if (xhr.status < 200 || xhr.status >= 300) return 0;
        var text = xhr.responseText || '';
        var len = lengthBytesUTF8(text) + 1;
        var buf = _malloc(len);
        stringToUTF8(text, buf, len);
        return buf;
    } catch (e) {
        return 0;
    }
});

EM_JS(void, rayactWebSetPrefetchRevision, (int revision), {
    Module.__rayactActiveRevision = revision;
});

EM_JS(uint8_t*, rayactWebSyncGetBytes, (const char* urlPtr, uint32_t* outLength), {
    try {
        var url = UTF8ToString(urlPtr);
        var key;
        try { key = new URL(url, location.href).href; } catch (_) { key = url; }
        var cache = Module.__rayactPrefetchCache;
        var warm = cache && cache.get(key);
        var bytes = null;
        if (warm && warm.revision === Module.__rayactActiveRevision) {
            cache.delete(key);
            bytes = warm.bytes;
        } else {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.responseType = 'arraybuffer';
            xhr.send(null);
            if (xhr.status < 200 || xhr.status >= 300 || !xhr.response) return 0;
            bytes = new Uint8Array(xhr.response);
        }
        var ptr = _malloc(bytes.byteLength || 1);
        if (bytes.byteLength) HEAPU8.set(bytes, ptr);
        HEAPU32[outLength >> 2] = bytes.byteLength;
        return ptr;
    } catch (e) {
        return 0;
    }
});
#endif

namespace rayact {

std::vector<uint8_t> webFetchBytes(const std::string& url) {
    uint32_t length = 0;
    uint8_t* body = rayactWebGetBytes(url.c_str(), &length);
    if (!body) return {};
    std::vector<uint8_t> out(body, body + length);
    free(body);
    return out;
}

void loadPlugins(const std::string& /*extraDir*/) {
    // The generic Web host contains only built-in engine modules. Optional
    // modules must supply a WASM artifact and be selected by a custom client.
}
void installDevClientBridge(JSContext* /*ctx*/, JSValue /*global*/) {}
void devtoolsInit(JSContext* /*ctx*/) {}
void devtoolsPump(JSContext* /*ctx*/) {}
void devtoolsConsole(JSContext*, const char*, const char*) {}
void devtoolsConsoleArgs(JSContext*, const char*, int, JSValueConst*) {}
bool devtoolsHasPendingWork() { return false; }

#if !RAYACT_RELEASE_HOST
// Dev-loader HTTP shim (see JS_rayactDevFetch / loadDevServerBundle): the web
// build has no libcurl, so fetch via a synchronous browser XHR instead.
std::string webDevFetch(const std::string& url) {
    char* body = rayactWebSyncGet(url.c_str());
    if (!body) return std::string();
    std::string out(body);
    free(body);
    return out;
}

std::vector<uint8_t> webDevFetchBytes(const std::string& url) {
    uint32_t length = 0;
    uint8_t* body = rayactWebSyncGetBytes(url.c_str(), &length);
    if (!body) return {};
    std::vector<uint8_t> out(body, body + length);
    free(body);
    return out;
}

void webDevPrefetchValidate(int revision) {
    rayactWebSetPrefetchRevision(revision);
}
#endif

} // namespace rayact
