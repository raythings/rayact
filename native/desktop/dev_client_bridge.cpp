#include "dev_client_bridge.hpp"
#include "cdp_handler.hpp"
#if !defined(__ANDROID__) && !defined(RAYACT_IOS) && !defined(RAYACT_WEB)
#include "desktop_mdns.hpp"
#include "desktop_dev_loader.hpp"
#include "devtools.hpp"
#endif
#include "raym3_bridge.hpp"
#include "../core/engine.hpp"
#ifndef RAYACT_NO_WORKERS
#include "workers.hpp"
#endif

#include <sstream>
#include <string>
#include <vector>

#if defined(RAYACT_WEB)
#include <emscripten.h>
#elif !defined(__ANDROID__) && !defined(RAYACT_IOS)
#include "raylib.h"
#endif

namespace rayact {

namespace {

static std::string g_devServerUrl;
static std::vector<std::string> g_recentUrls;

static std::string jsonStringField(const char* dataJson, const char* key) {
    if (!dataJson || !key) return {};
    const std::string needle = std::string("\"") + key + "\"";
    const char* pos = strstr(dataJson, needle.c_str());
    if (!pos) return {};
    pos = strchr(pos + needle.size(), '"');
    if (!pos) return {};
    ++pos;
    const char* end = strchr(pos, '"');
    return end ? std::string(pos, end - pos) : std::string();
}

static bool isAllowedExternalUrl(const std::string& url) {
    return url.rfind("https://", 0) == 0 || url.rfind("http://", 0) == 0 ||
           url.rfind("mailto:", 0) == 0;
}

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

static void addRecent(const std::string& url) {
    std::vector<std::string> next;
    next.push_back(url);
    for (const auto& u : g_recentUrls) {
        if (u != url) next.push_back(u);
    }
    while (next.size() > 10) next.pop_back();
    g_recentUrls = std::move(next);
}

static std::string recentEntriesJson() {
    std::ostringstream ss;
    ss << "[";
    for (size_t i = 0; i < g_recentUrls.size(); ++i) {
        if (i) ss << ",";
        ss << "{\"url\":\"" << jsonEscape(g_recentUrls[i]) << "\"}";
    }
    ss << "]";
    return ss.str();
}

#if !defined(__ANDROID__) && !defined(RAYACT_IOS) && !defined(RAYACT_WEB)
static std::string desktopDevCall(const char* method, const char* dataJson) {
    const std::string m = method ? method : "";
    if (m == "openExternalUrl") {
        const std::string url = jsonStringField(dataJson, "url");
        if (!isAllowedExternalUrl(url)) return "false";
        OpenURL(url.c_str());
        return "true";
    }
    if (m == "getDevToolsState" || m == "setDevToolsEnabled") {
        JSContext* ctx = engineContext();
        const bool forcedOff = std::string(engineDevBundleFormat()) == "qjsbc";
        if (m == "setDevToolsEnabled" && !forcedOff && ctx) {
            const bool requested = dataJson && strstr(dataJson, "\"enabled\":true");
            if (requested) devtoolsEnableForContext(ctx, 9229, "Rayact Desktop");
            else devtoolsDetachContext(ctx);
        }
        const bool enabled = !forcedOff && ctx && devtoolsActiveForContext(ctx);
        std::ostringstream out;
        out << "{\"enabled\":" << (enabled ? "true" : "false")
            << ",\"forcedOff\":" << (forcedOff ? "true" : "false")
            << ",\"bundleFormat\":\"" << (forcedOff ? "qjsbc" : "js") << "\""
            << ",\"reason\":\"";
        if (forcedOff) out << "Rayact DevTools are disabled while running bytecode for better performance.";
        out << "\"}";
        return out.str();
    }
    if (m == "setDevServerUrl") {
        std::string url;
        if (dataJson) {
            const char* key = "\"url\"";
            const char* pos = strstr(dataJson, key);
            if (pos) {
                pos = strchr(pos + strlen(key), '"');
                if (pos) {
                    pos++;
                    const char* end = strchr(pos, '"');
                    if (end) url.assign(pos, end - pos);
                }
            }
        }
        if (!url.empty()) {
            g_devServerUrl = url;
            addRecent(url);
            desktopMdnsStop();
            engineLoadDevServer(url);
        }
        return "null";
    }
    if (m == "openProjectDirect") {
        std::string url;
        if (dataJson) {
            const char* key = "\"url\"";
            const char* pos = strstr(dataJson, key);
            if (pos) {
                pos = strchr(pos + strlen(key), '"');
                if (pos) {
                    pos++;
                    const char* end = strchr(pos, '"');
                    if (end) url.assign(pos, end - pos);
                }
            }
        }
        if (url.empty()) return "{\"ok\":false,\"error\":\"Invalid server URL\"}";
        g_devServerUrl = url;
        addRecent(url);
        desktopMdnsStop();
        if (!engineLoadDevServer(url)) {
            return "{\"ok\":false,\"error\":\"Failed to load dev server\"}";
        }
        return std::string("{\"ok\":true,\"url\":\"") + jsonEscape(url) + "\"}";
    }
    if (m == "getDevServerUrl") return "\"" + jsonEscape(g_devServerUrl) + "\"";
    if (m == "getRecentEntries") return recentEntriesJson();
    if (m == "removeRecentUrl") {
        std::string url;
        if (dataJson) {
            const char* key = "\"url\"";
            const char* pos = strstr(dataJson, key);
            if (pos) {
                pos = strchr(pos + strlen(key), '"');
                if (pos) {
                    pos++;
                    const char* end = strchr(pos, '"');
                    if (end) url.assign(pos, end - pos);
                }
            }
        }
        std::vector<std::string> next;
        for (const auto& u : g_recentUrls) if (u != url) next.push_back(u);
        g_recentUrls = std::move(next);
        return "null";
    }
    if (m == "getDiscoveredServers") return desktopMdnsServersJson();
    if (m == "startDiscovery") {
        desktopMdnsStart();
        return "null";
    }
    if (m == "stopDiscovery") {
        desktopMdnsStop();
        return "null";
    }
    if (m == "scanQR") return "null";
    if (m == "reloadWithProjectBundle") {
        if (!g_devServerUrl.empty()) engineLoadDevServer(g_devServerUrl);
        return "null";
    }
    return "null";
}
#endif

#if defined(RAYACT_WEB)
static std::string webDevCall(const char* method, const char* dataJson) {
    const std::string m = method ? method : "";
    if (m == "openExternalUrl") {
        const std::string url = jsonStringField(dataJson, "url");
        if (!isAllowedExternalUrl(url)) return "false";
        EM_ASM({
            const url = UTF8ToString($0);
            window.open(url, '_blank', 'noopener,noreferrer');
        }, url.c_str());
        return "true";
    }
    if (m == "getDevToolsState" || m == "setDevToolsEnabled") {
        const bool bytecode = std::string(engineDevBundleFormat()) == "qjsbc";
        return std::string("{\"enabled\":false,\"forcedOff\":true,\"bundleFormat\":\"")
            + (bytecode ? "qjsbc" : "js")
            + "\",\"reason\":\""
            + (bytecode
                ? "Rayact DevTools are disabled while running bytecode for better performance."
                : "Use the browser developer tools on web builds.")
            + "\"}";
    }
    return "null";
}
#endif

static JSValue JS_devCall(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    const char* method = JS_ToCString(ctx, argv[0]);
    if (!method) return JS_UNDEFINED;

    std::string dataJson;
    if (argc >= 2 && !JS_IsUndefined(argv[1]) && !JS_IsNull(argv[1])) {
        if (JS_IsObject(argv[1])) {
            JSValue json = JS_JSONStringify(ctx, argv[1], JS_UNDEFINED, JS_UNDEFINED);
            if (!JS_IsException(json)) {
                const char* s = JS_ToCString(ctx, json);
                if (s) {
                    dataJson = s;
                    JS_FreeCString(ctx, s);
                }
            } else {
                JSValue exc = JS_GetException(ctx);
                JS_FreeValue(ctx, exc);
            }
            JS_FreeValue(ctx, json);
        } else {
            const char* s = JS_ToCString(ctx, argv[1]);
            if (s) {
                dataJson = s;
                JS_FreeCString(ctx, s);
            }
        }
    }

    std::string resultJson;
#ifdef __ANDROID__
    resultJson = androidDevCall(method, dataJson.empty() ? nullptr : dataJson.c_str());
#elif defined(RAYACT_IOS)
    resultJson = iosDevCall(method, dataJson.empty() ? nullptr : dataJson.c_str());
#elif defined(RAYACT_WEB)
    resultJson = webDevCall(method, dataJson.empty() ? nullptr : dataJson.c_str());
#else
    resultJson = desktopDevCall(method, dataJson.empty() ? nullptr : dataJson.c_str());
#endif

    JS_FreeCString(ctx, method);

    if (argc >= 3 && JS_IsFunction(ctx, argv[2])) {
        JSValue arg = JS_UNDEFINED;
        if (resultJson == "null") {
            arg = JS_NULL;
        } else if (!resultJson.empty() && resultJson.front() == '"') {
            // Parse as JSON so escapes are decoded. The Android side quotes
            // strings with org.json's JSONObject.quote(), which escapes '/'
            // as '\/'; stripping the outer quotes verbatim used to leak the
            // backslashes into JS (URLs showed as http:\/\/host).
            arg = JS_ParseJSON(ctx, resultJson.c_str(), resultJson.size(), "<devCall>");
            if (JS_IsException(arg)) {
                JSValue exc = JS_GetException(ctx);
                JS_FreeValue(ctx, exc);
                arg = JS_NewString(ctx, resultJson.substr(1, resultJson.size() - 2).c_str());
            }
        } else if (!resultJson.empty() && (resultJson.front() == '[' || resultJson.front() == '{')) {
            arg = JS_ParseJSON(ctx, resultJson.c_str(), resultJson.size(), "<devCall>");
            if (JS_IsException(arg)) {
                JSValue exc = JS_GetException(ctx);
                JS_FreeValue(ctx, exc);
                arg = JS_UNDEFINED;
            }
        } else if (!resultJson.empty()) {
            arg = JS_NewString(ctx, resultJson.c_str());
        }
        JSValue cbResult = JS_Call(ctx, argv[2], JS_UNDEFINED, 1, &arg);
        JS_FreeValue(ctx, arg);
        JS_FreeValue(ctx, cbResult);
    }
    return JS_UNDEFINED;
}

static JSValue JS_getNodeTree(JSContext*, JSValue, int, JSValueConst*) {
    return JS_NewString(g_bridge_ctx, buildNodeTreeJson().c_str());
}

static JSValue JS_setInspectorHighlight(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    int id = -1;
    if (argc >= 1) JS_ToInt32(ctx, &id, argv[0]);
    setInspectorHighlight(id);
    return JS_UNDEFINED;
}

static JSValue JS_setInspectorPickMode(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    setInspectorPickMode(argc >= 1 && JS_ToBool(ctx, argv[0]));
    return JS_UNDEFINED;
}

static JSValue JS_getInspectorPickedNode(JSContext* ctx, JSValue, int, JSValueConst*) {
    return JS_NewInt32(ctx, getInspectorPickedNode());
}

// __rayactRegisterDebugScript(url, source) — runtime-owned, dev-only module
// source registry. This avoids re-reading project files on the host and gives
// CDP Sources the exact Vite transform that QuickJS evaluated.
static JSValue JS_registerDebugScript(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
#if RAYACT_ENABLE_DEVTOOLS
    if (argc < 2 || !CDPHandler::instance()) return JS_UNDEFINED;
    const char* url = JS_ToCString(ctx, argv[0]);
    const char* source = JS_ToCString(ctx, argv[1]);
    if (url && source) CDPHandler::instance()->registerScript(url, source);
    if (url) JS_FreeCString(ctx, url);
    if (source) JS_FreeCString(ctx, source);
    return JS_UNDEFINED;
#else
    (void)ctx; (void)argc; (void)argv;
    return JS_UNDEFINED;
#endif
}

static JSValue JS_emitReactDevtoolsEvent(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
#if RAYACT_ENABLE_DEVTOOLS
    if (argc < 2 || !CDPHandler::instance()) return JS_UNDEFINED;
    const char* method = JS_ToCString(ctx, argv[0]);
    const char* payload = JS_ToCString(ctx, argv[1]);
    if (method) CDPHandler::instance()->emitEvent(method, payload ? payload : "{}");
    if (method) JS_FreeCString(ctx, method);
    if (payload) JS_FreeCString(ctx, payload);
    return JS_UNDEFINED;
#else
    (void)ctx; (void)argc; (void)argv;
    return JS_UNDEFINED;
#endif
}

// setInspectorSourceName(nodeId, name) — dev-mode reconciler reports the
// nearest named source component owning a host node so the inspector can
// label nodes with app-code names instead of host kinds.
static JSValue JS_setInspectorSourceName(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_UNDEFINED;
    int id = -1;
    JS_ToInt32(ctx, &id, argv[0]);
    if (id < 0) return JS_UNDEFINED;
    if (JS_IsString(argv[1])) {
        const char* name = JS_ToCString(ctx, argv[1]);
        if (name) {
            setInspectorSourceName(id, name);
            JS_FreeCString(ctx, name);
        }
    } else {
        clearInspectorSourceName(id);
    }
    return JS_UNDEFINED;
}

// getLoadedWasmModules() → JSON string array of currently-running .wasm
// worker file paths. Shows what's ACTUALLY loaded at runtime, as opposed to
// the native modules declared at build time (already shown in the launcher).
static JSValue JS_getLoadedWasmModules(JSContext* ctx, JSValue, int, JSValueConst*) {
    std::ostringstream ss;
    ss << "[";
#ifndef RAYACT_NO_WORKERS
    auto paths = getLoadedWasmModulePaths();
    for (size_t i = 0; i < paths.size(); ++i) {
        if (i) ss << ",";
        ss << "\"" << jsonEscape(paths[i]) << "\"";
    }
#endif
    ss << "]";
    return JS_NewString(ctx, ss.str().c_str());
}

} // namespace

void installDevClientBridge(JSContext* ctx, JSValue global) {
    JS_SetPropertyStr(ctx, global, "devCall",
                      JS_NewCFunction(ctx, JS_devCall, "devCall", 3));
    JS_SetPropertyStr(ctx, global, "getNodeTree",
                      JS_NewCFunction(ctx, JS_getNodeTree, "getNodeTree", 0));
    JS_SetPropertyStr(ctx, global, "setInspectorHighlight",
                      JS_NewCFunction(ctx, JS_setInspectorHighlight, "setInspectorHighlight", 1));
    JS_SetPropertyStr(ctx, global, "setInspectorPickMode",
                      JS_NewCFunction(ctx, JS_setInspectorPickMode, "setInspectorPickMode", 1));
    JS_SetPropertyStr(ctx, global, "getInspectorPickedNode",
                      JS_NewCFunction(ctx, JS_getInspectorPickedNode, "getInspectorPickedNode", 0));
#if RAYACT_ENABLE_DEVTOOLS
    JS_SetPropertyStr(ctx, global, "__rayactRegisterDebugScript",
                      JS_NewCFunction(ctx, JS_registerDebugScript, "__rayactRegisterDebugScript", 2));
    JS_SetPropertyStr(ctx, global, "__rayactEmitReactDevtoolsEvent",
                      JS_NewCFunction(ctx, JS_emitReactDevtoolsEvent, "__rayactEmitReactDevtoolsEvent", 2));
#endif
    JS_SetPropertyStr(ctx, global, "setInspectorSourceName",
                      JS_NewCFunction(ctx, JS_setInspectorSourceName, "setInspectorSourceName", 2));
    JS_SetPropertyStr(ctx, global, "getLoadedWasmModules",
                      JS_NewCFunction(ctx, JS_getLoadedWasmModules, "getLoadedWasmModules", 0));
}

} // namespace rayact
