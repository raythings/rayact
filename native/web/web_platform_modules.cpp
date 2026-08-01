// Web platform-module bridge.
//
// `platformCall(module, method, payload, cb)` is how JS reaches a native module
// that is not a render node — sensors, haptics, linking and friends. Android and
// iOS route it into their host registries; this routes it into the browser-side
// module registry that module scripts register with (see the `web.script` field
// in rayact.module.json and apps/web/shell.html's registry).
//
// Synchronous by contract: the JS wrapper reads the callback's value on the same
// tick, so the browser handler must answer immediately. Anything genuinely async
// (permissions, pickers) reports through a poll method, exactly as the mobile
// hosts do with drainEvents.

#include <emscripten.h>

#include <string>

namespace rayact {

std::string webPlatformCall(const char* module, const char* method,
                            const char* payloadJson) {
    if (!module || !method) {
        return "{\"ok\":false,\"error\":\"platformCall requires a module and method\"}";
    }
    // Returns a malloc'd UTF-8 JSON string owned by us, or 0 when no browser
    // module claims the name (so the caller reports the same "unavailable"
    // shape every other host uses).
    char* response = (char*)EM_ASM_PTR({
        var modules = Module.__rayactPlatformModules;
        if (!modules || typeof modules.call !== 'function') return 0;
        var json = modules.call(UTF8ToString($0), UTF8ToString($1), UTF8ToString($2));
        if (typeof json !== 'string') return 0;
        var length = lengthBytesUTF8(json) + 1;
        var buffer = _malloc(length);
        stringToUTF8(json, buffer, length);
        return buffer;
    }, module, method, payloadJson ? payloadJson : "null");

    if (!response) {
        return std::string("{\"ok\":false,\"error\":\"Platform module '") + module +
               "' is not available on this host\"}";
    }
    std::string result(response);
    free(response);
    return result;
}

} // namespace rayact
