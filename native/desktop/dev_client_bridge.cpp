#include "dev_client_bridge.hpp"
#include "raym3_bridge.hpp"
#include "../core/engine.hpp"

#include <sstream>
#include <string>
#include <vector>

namespace rayact {

namespace {

static std::string g_devServerUrl;
static std::vector<std::string> g_recentUrls;

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

#ifndef __ANDROID__
static std::string desktopDevCall(const char* method, const char* dataJson) {
    const std::string m = method ? method : "";
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
            engineLoadDevServer(url);
        }
        return "null";
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
    if (m == "getDiscoveredServers") return "[]";
    if (m == "startDiscovery" || m == "stopDiscovery" || m == "scanQR") return "null";
    if (m == "reloadWithProjectBundle") {
        if (!g_devServerUrl.empty()) engineLoadDevServer(g_devServerUrl);
        return "null";
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

} // namespace

void installDevClientBridge(JSContext* ctx, JSValue global) {
    JS_SetPropertyStr(ctx, global, "devCall",
                      JS_NewCFunction(ctx, JS_devCall, "devCall", 3));
    JS_SetPropertyStr(ctx, global, "getNodeTree",
                      JS_NewCFunction(ctx, JS_getNodeTree, "getNodeTree", 0));
    JS_SetPropertyStr(ctx, global, "setInspectorHighlight",
                      JS_NewCFunction(ctx, JS_setInspectorHighlight, "setInspectorHighlight", 1));
}

} // namespace rayact
