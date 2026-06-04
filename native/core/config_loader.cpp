#include "config_loader.hpp"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

extern "C" {
#include "raylib.h"  // TraceLog / LOG_INFO
}

namespace rayact {

namespace {

AppConfig g_config;   // last-loaded config (defaults until loadAppConfig is called)

std::string readFileText(const char* path)
{
    FILE* f = fopen(path, "rb");
    if (!f) return {};
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (n <= 0) { fclose(f); return {}; }
    std::string buf;
    buf.resize(static_cast<size_t>(n));
    size_t got = fread(buf.data(), 1, buf.size(), f);
    fclose(f);
    if (got != buf.size()) buf.resize(got);
    return buf;
}

bool exists(const char* path)
{
    FILE* f = fopen(path, "rb");
    if (!f) return false;
    fclose(f);
    return true;
}

// Apply the `rayact` key of `cfg` to `out`. Walks known fields and leaves
// everything else at the default.
void applyConfig(JSContext* ctx, JSValue cfg, AppConfig& out)
{
    if (!JS_IsObject(cfg)) return;

    // Single `backgroundColor` field. It's used as the pre-raym3 clear AND
    // the first-frame clear. (We used to have a separate `noRenderColor`
    // / `map` for the pre-raym3 path, but a dev shouldn't have to think
    // about that distinction.)
    JSValue bg = JS_GetPropertyStr(ctx, cfg, "backgroundColor");
    if (!JS_IsUndefined(bg)) {
        uint8_t rgba[4];
        if (parseColorValue(ctx, bg, rgba))
            memcpy(out.backgroundColor, rgba, 4);
    }
    JS_FreeValue(ctx, bg);
}

bool tryJson(const char* path, AppConfig& out)
{
    std::string text = readFileText(path);
    if (text.empty()) return false;

    // QuickJS ships a one-shot JSON parser; we don't need a runtime here.
    JSContext* tmp = JS_NewContext(JS_NewRuntime());
    if (!tmp) return false;
    JSValue parsed = JS_ParseJSON(tmp, text.c_str(), text.size(), path);
    bool ok = false;
    if (!JS_IsException(parsed)) {
        JSValue key = JS_GetPropertyStr(tmp, parsed, "rayact");
        if (JS_IsObject(key)) {
            applyConfig(tmp, key, out);
            ok = true;
        }
        JS_FreeValue(tmp, key);
    }
    JS_FreeValue(tmp, parsed);
    JS_FreeContext(tmp);
    return ok;
}

bool tryJsModule(JSContext* ctx, const char* path, AppConfig& out)
{
    if (!ctx) return false;
    if (!exists(path)) return false;

    // Build a tiny CJS harness: load the file as a module named after the
    // path, inject `module.exports = {}` + `module` so the user's
    //   module.exports = { rayact: { ... } }
    // pattern works without us having to pre-process anything.
    static const char* kPreamble =
        "globalThis.__rayact_cfg_module = globalThis.__rayact_cfg_module || {};\n"
        "var module = globalThis.__rayact_cfg_module;\n"
        "if (!module.exports) module.exports = {};\n";
    std::string src(kPreamble);
    std::string body = readFileText(path);
    if (body.empty()) return false;
    src.append(body);

    // Run in a fresh, throwaway global object so the user's config can't
    // pollute the host engine. We copy `rayact` back out at the end.
    JSValue globalObj = JS_GetGlobalObject(ctx);
    JSValue savedCfg = JS_GetPropertyStr(ctx, globalObj, "rayact");
    JS_FreeValue(ctx, globalObj);

    JSValue mod = JS_Eval(ctx, src.c_str(), src.size(), path, JS_EVAL_TYPE_GLOBAL);
    bool ok = false;
    if (!JS_IsException(mod)) {
        JSValue modObj = JS_Eval(ctx, "module.exports", 15, "<config-read>",
                                  JS_EVAL_TYPE_GLOBAL);
        if (!JS_IsException(modObj)) {
            JSValue key = JS_GetPropertyStr(ctx, modObj, "rayact");
            if (JS_IsObject(key)) {
                applyConfig(ctx, key, out);
                ok = true;
            }
            JS_FreeValue(ctx, key);
            JS_FreeValue(ctx, modObj);
        }
        JS_FreeValue(ctx, mod);
    }

    // Restore the engine's previous rayact key (we shouldn't have stomped
    // it because we ran in the global ctx, but be defensive).
    JSValue g2 = JS_GetGlobalObject(ctx);
    if (JS_IsUndefined(savedCfg)) {
        JSValue empty = JS_UNDEFINED;
        JS_SetPropertyStr(ctx, g2, "rayact", empty);
    } else {
        JS_SetPropertyStr(ctx, g2, "rayact", savedCfg);
    }
    JS_FreeValue(ctx, g2);
    JS_FreeValue(ctx, savedCfg);
    return ok;
}

} // namespace

bool parseColorValue(JSContext* ctx, JSValue v, uint8_t out[4])
{
    if (JS_IsString(v)) {
        const char* s = JS_ToCString(ctx, v);
        if (!s) return false;
        std::string str(s);
        JS_FreeCString(ctx, s);

        // Accept #RGB, #RGBA, #RRGGBB, #RRGGBBAA
        if (!str.empty() && str[0] == '#') str.erase(0, 1);
        if (str.size() != 3 && str.size() != 4 && str.size() != 6 && str.size() != 8)
            return false;

        auto hexVal = [](char c) -> int {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return 10 + c - 'a';
            if (c >= 'A' && c <= 'F') return 10 + c - 'A';
            return -1;
        };
        auto expand = [&](int hi, int lo) -> uint8_t {
            if (hi < 0 || lo < 0) return 0;
            return static_cast<uint8_t>((hi << 4) | lo);
        };

        if (str.size() == 3) {
            int r = hexVal(str[0]); int g = hexVal(str[1]); int b = hexVal(str[2]);
            if (r < 0 || g < 0 || b < 0) return false;
            out[0] = expand(r, r); out[1] = expand(g, g); out[2] = expand(b, b);
            out[3] = 255;
        } else if (str.size() == 4) {
            int r = hexVal(str[0]); int g = hexVal(str[1]); int b = hexVal(str[2]); int a = hexVal(str[3]);
            if (r < 0 || g < 0 || b < 0 || a < 0) return false;
            out[0] = expand(r, r); out[1] = expand(g, g); out[2] = expand(b, b);
            out[3] = expand(a, a);
        } else if (str.size() == 6) {
            int r = hexVal(str[0]) * 16 + hexVal(str[1]);
            int g = hexVal(str[2]) * 16 + hexVal(str[3]);
            int b = hexVal(str[4]) * 16 + hexVal(str[5]);
            if (r < 0 || g < 0 || b < 0) return false;
            out[0] = (uint8_t)r; out[1] = (uint8_t)g; out[2] = (uint8_t)b;
            out[3] = 255;
        } else { // 8
            int r = hexVal(str[0]) * 16 + hexVal(str[1]);
            int g = hexVal(str[2]) * 16 + hexVal(str[3]);
            int b = hexVal(str[4]) * 16 + hexVal(str[5]);
            int a = hexVal(str[6]) * 16 + hexVal(str[7]);
            if (r < 0 || g < 0 || b < 0 || a < 0) return false;
            out[0] = (uint8_t)r; out[1] = (uint8_t)g; out[2] = (uint8_t)b;
            out[3] = (uint8_t)a;
        }
        return true;
    }

    if (JS_IsNumber(v)) {
        int64_t n = 0;
        JS_ToInt64(ctx, &n, v);
        // Treat as 0xRRGGBBAA, with the high byte being R.
        out[0] = (uint8_t)((n >> 24) & 0xFF);
        out[1] = (uint8_t)((n >> 16) & 0xFF);
        out[2] = (uint8_t)((n >>  8) & 0xFF);
        out[3] = (uint8_t)( n        & 0xFF);
        return true;
    }

    return false;
}

AppConfig loadAppConfig(JSContext* ctx, const char* assetsPath)
{
    AppConfig cfg;  // start from defaults
    if (!assetsPath || !*assetsPath) return cfg;

    // Try each file in priority order. The first one that parses AND has a
    // `rayact` key wins. Subsequent files are skipped.
    char path[1024];

    snprintf(path, sizeof(path), "%s/app.json", assetsPath);
    if (tryJson(path, cfg)) {
        TraceLog(LOG_INFO, "RAYACT: loaded app config from %s", path);
        g_config = cfg;
        return g_config;
    }

    snprintf(path, sizeof(path), "%s/app.config.js", assetsPath);
    if (tryJsModule(ctx, path, cfg)) {
        TraceLog(LOG_INFO, "RAYACT: loaded app config from %s", path);
        g_config = cfg;
        return g_config;
    }

    // .ts support is best-effort: try as-is, fall back to swapping the
    // extension. The bundler / dev-server is expected to emit a .js next to
    // a .ts source, so the .js path above usually covers it.
    snprintf(path, sizeof(path), "%s/app.config.ts", assetsPath);
    if (tryJsModule(ctx, path, cfg)) {
        TraceLog(LOG_INFO, "RAYACT: loaded app config from %s", path);
        g_config = cfg;
        return g_config;
    }
    char pathJs[1024];
    snprintf(pathJs, sizeof(pathJs), "%s/app.config.js", assetsPath);
    if (pathJs[0] && tryJsModule(ctx, pathJs, cfg)) {
        // already tried, skip
    }

    TraceLog(LOG_INFO, "RAYACT: no app config found in %s — using defaults (black)", assetsPath);
    g_config = cfg;
    return g_config;
}

const AppConfig& appConfig() { return g_config; }

} // namespace rayact
