// Web build stubs: engine_js.cpp calls into the plugin loader, the dev-client
// bridge, and the CDP/devtools server unconditionally. Those desktop units pull in
// dlopen / libcurl / libwebsockets and are excluded from the web build. Provide
// no-op implementations so the engine links. (Phase 2 wires the real dev-client
// over Emscripten WebSockets; web plugin fallbacks land in Phase 4.)

extern "C" {
#include "quickjs.h"
}
#include <string>
#include <cstdlib>
#include <emscripten.h>
#include "module_bus.hpp"

// Synchronous same/cross-origin GET for the dev loader. The module-HMR runtime
// fetches modules synchronously (QuickJS eval is sync), so this is a sync XHR —
// only used in dev, never in production bundles.
EM_JS(char*, rayactWebSyncGet, (const char* urlPtr), {
    try {
        var url = UTF8ToString(urlPtr);
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

// Built-in native plugins are linked statically on web (no dlopen) and registered by
// their unique entry points. mmkv + secure-store use file I/O (MEMFS now; IDBFS for
// persistence is a follow-up). secure-store falls back to the file-backed backend
// (the macOS Keychain path is __APPLE__-only).
extern "C" int rayact_mmkv_register(const RayactHost* host);
extern "C" int rayact_secure_store_register(const RayactHost* host);

namespace rayact {

void loadPlugins(const std::string& /*extraDir*/) {
    const RayactHost* host = busHost();
    if (!host) return;
    rayact_mmkv_register(host);
    rayact_secure_store_register(host);
}
void installDevClientBridge(JSContext* /*ctx*/, JSValue /*global*/) {}
void devtoolsInit(JSContext* /*ctx*/) {}
void devtoolsPump(JSContext* /*ctx*/) {}

// Dev-loader HTTP shim (see JS_rayactDevFetch / loadDevServerBundle): the web
// build has no libcurl, so fetch via a synchronous browser XHR instead.
std::string webDevFetch(const std::string& url) {
    char* body = rayactWebSyncGet(url.c_str());
    if (!body) return std::string();
    std::string out(body);
    free(body);
    return out;
}

} // namespace rayact
