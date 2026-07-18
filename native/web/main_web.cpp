// Rayact web entry point: a thin Emscripten embedder over the engine API
// (native/core/engine.hpp), mirroring the desktop main() and the iOS wrapper.
//
// The browser cannot block, so unlike desktop there is no while(WindowShouldClose())
// loop. Instead:
//   1. main() asynchronously acquires the WebGPU device (rlwgAcquireDeviceAsync,
//      NO -sASYNCIFY) and returns to the browser event loop.
//   2. When the device is ready, onDeviceReady() boots the engine, loads the app
//      (which calls initRaylib() -> InitWindow() -> rlglInit(), finding the device
//      already set), and starts an emscripten_set_main_loop (requestAnimationFrame).
//   3. tick() pumps QuickJS and renders the raym3 tree once per animation frame —
//      the same enginePumpJS()/engineRenderFrame() the Android Choreographer and iOS
//      CADisplayLink hosts drive.

#include "../core/engine.hpp"
#include "../desktop/accessibility_bridge.hpp"

#include <raylib.h>
#include <raym3/v2/Density.h>

#include <emscripten/emscripten.h>
#include <emscripten/html5.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

// rlwg async device acquisition (declared in rlwg.h; the engine links the WEBGPU
// backend so these symbols resolve at link time).
extern "C" {
void rlwgAcquireDeviceAsync(const char *canvasSelector, void (*cb)(void *user), void *user);
}

// Browser-WebSocket bridge for the WASM runtime (native/web/web_websocket.cpp) —
// gives QuickJS a `WebSocket` so the module-HMR client can connect /rayact/hmr.
namespace rayact {
void registerWebSocketBridge(JSContext *ctx);
void pumpWebSocketBridge(JSContext *ctx);
}

static const char *kCanvasSelector = "#canvas";

// Phase 1 smoke app: immediate-mode draw through the engine's legacy render path
// (no React bundle required). Proves QuickJS boots and rlwg renders via the engine.
// Later phases replace this with embedded .qjsbc / a dev-server bundle.
#if !RAYACT_RELEASE_HOST
static const char *kDemoScript =
    "initRaylib(960, 540, \"Rayact Web\");\n"
    "globalThis.__rayactOnDimensionsChange = function(){};\n"
    // Immediate-mode shapes recorded once into the engine's shape list; the legacy
    // render path (engineRenderScreenInSurface, g_root == null) redraws them each
    // frame. Colors are 0xRRGGBBAA (matches the engine's shape-color unpack).
    "renderRect(80, 80, 300, 200, 0x3B82F6FF);\n"   // blue
    "renderCircle(560, 280, 90, 0x22C55EFF);\n"      // green
    "renderRect(420, 360, 240, 120, 0xEAB308FF);\n"  // amber
    "renderLine(80, 480, 880, 480, 0xEF4444FF);\n";  // red
#endif

static bool g_engineReady = false;  // set once the device is up and the engine booted
static bool g_finished = false;
static bool g_resizePending = true;
static int g_canvasCssWidth = 0;
static int g_canvasCssHeight = 0;

static void syncWebAccessibility() {
    const std::string snapshot = rayact::accessibilityBridge().snapshotJson();
    EM_ASM({
        var json = UTF8ToString($0);
        if (Module.__rayactSemanticSnapshot === json) return;
        Module.__rayactSemanticSnapshot = json;
        var nodes;
        try { nodes = JSON.parse(json); } catch (_) { nodes = []; }
        var root = document.getElementById('rayact-semantic-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'rayact-semantic-root';
            root.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden;';
            (document.getElementById('wrap') || document.body).appendChild(root);
            var canvas = document.getElementById('canvas');
            if (canvas) canvas.setAttribute('aria-hidden', 'true');
        }
        var validRoles = new Set([
            'alert','button','checkbox','dialog','heading','image','link','list','listitem',
            'menu','menuitem','progressbar','radio','radiogroup','searchbox','slider','spinbutton',
            'status','switch','tab','tablist','tabpanel','textbox','timer','toolbar'
        ]);
        var fragment = document.createDocumentFragment();
        nodes.forEach(function(node) {
            var element = document.createElement('div');
            element.dataset.rayactNodeId = String(node.id);
            element.setAttribute('role', validRoles.has(node.role) ? node.role : 'group');
            if (node.label) element.setAttribute('aria-label', node.label);
            if (node.disabled) element.setAttribute('aria-disabled', 'true');
            if (node.hasState && (node.role === 'checkbox' || node.role === 'radio' || node.role === 'switch')) {
                element.setAttribute('aria-checked', node.checked ? 'true' : 'false');
            }
            if (node.hasState) {
                element.setAttribute('aria-selected', node.selected ? 'true' : 'false');
                element.setAttribute('aria-expanded', node.expanded ? 'true' : 'false');
            }
            element.tabIndex = node.focusable && !node.disabled ? 0 : -1;
            element.style.cssText = 'position:absolute;opacity:.001;color:transparent;background:transparent;' +
                'pointer-events:none;left:' + node.x + 'px;top:' + node.y + 'px;width:' +
                Math.max(1, node.w) + 'px;height:' + Math.max(1, node.h) + 'px;';
            element.addEventListener('click', function() {
                if (Module._rayactWebAccessibilityActivate) Module._rayactWebAccessibilityActivate(node.id);
            });
            element.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (Module._rayactWebAccessibilityActivate) Module._rayactWebAccessibilityActivate(node.id);
                }
            });
            fragment.appendChild(element);
        });
        root.replaceChildren(fragment);
    }, snapshot.c_str());
}

static void publishWindowDimensions(JSContext *ctx, int widthPx, int heightPx) {
    if (!ctx || widthPx <= 0 || heightPx <= 0) return;
    const float w = raym3::v2::Density::PxToDp((float)widthPx);
    const float h = raym3::v2::Density::PxToDp((float)heightPx);
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, obj, "width", JS_NewFloat64(ctx, w));
    JS_SetPropertyStr(ctx, obj, "height", JS_NewFloat64(ctx, h));
    JS_SetPropertyStr(ctx, global, "__rayactWindowDimensions", obj);
    JSValue fn = JS_GetPropertyStr(ctx, global, "__rayactOnDimensionsChange");
    if (JS_IsFunction(ctx, fn)) {
        JSValue r = JS_Call(ctx, fn, JS_UNDEFINED, 0, nullptr);
        if (JS_IsException(r)) {
            JSValue exc = JS_GetException(ctx);
            const char *s = JS_ToCString(ctx, exc);
            fprintf(stderr, "__rayactOnDimensionsChange threw: %s\n", s ? s : "?");
            if (s) JS_FreeCString(ctx, s);
            JS_FreeValue(ctx, exc);
        }
        JS_FreeValue(ctx, r);
    }
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, global);
}

static bool readCanvasCssSize(int &width, int &height) {
    double cssW = 0.0;
    double cssH = 0.0;
    emscripten_get_element_css_size(kCanvasSelector, &cssW, &cssH);
    if (cssW <= 0.0 || cssH <= 0.0) {
        cssW = EM_ASM_DOUBLE({
            var c = document.querySelector('#canvas');
            return Math.max(1, Math.round((c && c.clientWidth) || innerWidth || 1));
        });
        cssH = EM_ASM_DOUBLE({
            var c = document.querySelector('#canvas');
            return Math.max(1, Math.round((c && c.clientHeight) || innerHeight || 1));
        });
    }
    width = std::max(1, (int)std::lround(cssW));
    height = std::max(1, (int)std::lround(cssH));
    return true;
}

static bool syncCanvasSizeAndPublish(void) {
    if (!IsWindowReady()) return false;
    int cssW = 0;
    int cssH = 0;
    if (!readCanvasCssSize(cssW, cssH)) return false;
    if (!g_resizePending && cssW == g_canvasCssWidth && cssH == g_canvasCssHeight)
        return false;

    g_resizePending = false;
    g_canvasCssWidth = cssW;
    g_canvasCssHeight = cssH;
    SetWindowSize(cssW, cssH);
    int renderW = GetRenderWidth() > 0 ? GetRenderWidth() : cssW;
    int renderH = GetRenderHeight() > 0 ? GetRenderHeight() : cssH;
    publishWindowDimensions(rayact::engineContext(), renderW, renderH);
    rayact::engineRequestSurfaceRelayout(1);
    return true;
}

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebNotifyResize(void) {
    g_resizePending = true;
    if (g_engineReady && IsWindowReady())
        syncCanvasSizeAndPublish();
}

static EM_BOOL onBrowserResize(int, const EmscriptenUiEvent *, void *) {
    rayactWebNotifyResize();
    return EM_TRUE;
}

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebFinishBoot(void) {
    if (!g_engineReady || g_finished || !IsWindowReady()) return;
    rayact::enginePrepareJSThread();
    rayact::engineFinishLoad();
    g_finished = true;
    syncCanvasSizeAndPublish();
    rayact::engineRenderFrame(GetRenderWidth(), GetRenderHeight());
    syncWebAccessibility();
    EM_ASM({
        Module.__rayactFinishBootDone = true;
        if (Module.__rayactSetLoading) Module.__rayactSetLoading(false);
    });
}

static void tick(void) {
    // The rAF loop is registered up front (from main, simulate_infinite_loop=1, so the
    // runtime stays alive without ASYNCIFY). Do nothing until the async device
    // acquisition has booted the engine.
    if (!g_engineReady) return;

    rayact::enginePrepareJSThread();
    rayact::enginePumpJS();
    // Dispatch any browser WebSocket events (HMR socket) into JS handlers.
    rayact::pumpWebSocketBridge(rayact::engineContext());

    // The app's initRaylib() opens the window during the first pumps; wait for it.
    if (!IsWindowReady()) return;
    syncCanvasSizeAndPublish();

    // The one-time mount (engineFinishLoad → React initial-render flush) is a DEEP
    // synchronous JS recursion (react reconciler over the navigation/theme tree). On
    // web that recursion lands on V8's native wasm call stack, whose depth limit is
    // NOT raised by emscripten STACK_SIZE. Running it from this tick — nested under
    // emscripten's main-loop dispatch — leaves less native headroom and overflows
    // intermittently on cold loads (renders only after a refresh, when the GPU/compile
    // burst has settled). So we do NOT mount here: the mount runs exclusively from
    // rayactWebFinishBoot, invoked from a bare top-level setTimeout once the page is
    // idle (shallowest possible stack, maximum headroom). tick only pumps + renders.
    if (!g_finished) return;

    rayact::engineRenderFrame(GetRenderWidth(), GetRenderHeight());
    syncWebAccessibility();

    // Periodically flush persistent storage (kv/mmkv/secure-store) to IndexedDB so it
    // survives reloads. ~every 2s (120 ticks @ 60fps); coalesces bursts of writes.
    static int syncTick = 0;
    if (++syncTick >= 120) {
        syncTick = 0;
        EM_ASM({ FS.syncfs(false, function(err){ if (err) console.error('[rayact-web] IDBFS sync error: ' + err); }); });
    }
}

// Production load: a `rayact build --web` dist embeds the app into the VFS (via
// --preload-file / --embed-file). Prefer pre-compiled bytecode (instant boot, no
// parse), else a raw JS bundle. Returns false if neither is present.
static bool loadBundledApp() {
    if (FILE* f = fopen("/app.qjsbc", "rb")) {
        fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
        if (n > 0) {
            std::vector<uint8_t> buf((size_t)n);
            size_t got = fread(buf.data(), 1, (size_t)n, f);
            fclose(f);
            printf("[rayact-web] loading /app.qjsbc (%zu bytes)\n", got);
            return rayact::engineLoadBytecode(buf.data(), got, "app.qjsbc");
        }
        fclose(f);
    }
    if (FILE* f = fopen("/app.js", "rb")) {
        fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
        std::string src(n > 0 ? (size_t)n : 0, '\0');
        if (n > 0) fread(&src[0], 1, (size_t)n, f);
        fclose(f);
        if (!src.empty()) {
            printf("[rayact-web] loading /app.js (%zu bytes)\n", src.size());
            return rayact::engineLoadSource(src, "app.js");
        }
    }
    return false;
}

static void onDeviceReady(void * /*user*/) {
    printf("[rayact-web] WebGPU device ready; booting engine\n");

    if (!rayact::engineCreate()) {
        fprintf(stderr, "[rayact-web] engineCreate() failed\n");
        return;
    }
    rayact::enginePrepareJSThread();
    // Install `globalThis.WebSocket` before the dev bundle loads so the module-HMR
    // runtime can open /rayact/hmr (no native libwebsockets in the web build).
    rayact::registerWebSocketBridge(rayact::engineContext());

    bool ok = false;
#if !RAYACT_RELEASE_HOST
    // A `?dev=<origin>` query param connects to a Rayact dev server (module HMR);
    // otherwise load the bundled app or the built-in development demo.
    char* devUrl = (char*)EM_ASM_PTR({
        var m = (location.search || '').match(/[?&]dev=([^&]+)/);
        if (!m) return 0;
        var s = decodeURIComponent(m[1]);
        var len = lengthBytesUTF8(s) + 1;
        var buf = _malloc(len);
        stringToUTF8(s, buf, len);
        return buf;
    });
    if (devUrl && devUrl[0]) {
        printf("[rayact-web] dev server: %s\n", devUrl);
        ok = rayact::engineLoadDevServer(devUrl);
    } else if (loadBundledApp()) {
        ok = true;                                   // production bundle from the VFS
    } else {
        ok = rayact::engineLoadSource(kDemoScript, "rayact_web_demo.js");  // fallback demo
    }
    if (devUrl) free(devUrl);
#else
    // Release hosts accept only the app placed in the virtual filesystem by the
    // release shell. No URL-selected server or demo fallback is compiled in.
    ok = loadBundledApp();
#endif
    if (!ok) {
        fprintf(stderr, "[rayact-web] app load failed\n");
        EM_ASM({
            if (Module.__rayactSetLoading) {
                Module.__rayactSetLoading(true, 'Unable to load the project. Check the console for details.');
            }
        });
        return;
    }

    g_engineReady = true;
    printf("[rayact-web] engine booted; rendering\n");
    EM_ASM({
        Module.__rayactFinishBootDone = false;
        var attempts = 0;
        // Each attempt runs the deep one-time mount recursion from a bare setTimeout
        // macrotask — the shallowest native stack we can give it (see tick()).
        function finish() {
            attempts++;
            if (Module._rayactWebFinishBoot) Module._rayactWebFinishBoot();
            if (!Module.__rayactFinishBootDone && attempts < 600) setTimeout(finish, 16);
        }
        // Defer the first attempt until the page is fully loaded and has settled
        // (full load → two animation frames → a fresh macrotask). This lets the
        // initial download/compile/layout/GPU-init burst unwind off the stack before
        // the mount runs, maximizing V8's native call-stack headroom for the deep
        // React reconcile — the difference between a blank first load and a working one.
        function kick() {
            requestAnimationFrame(function() {
                requestAnimationFrame(function() { setTimeout(finish, 0); });
            });
        }
        if (document.readyState === 'complete') kick();
        else window.addEventListener('load', kick, { once: true });
    });
}

// Called from the IDBFS syncfs(true) callback once persisted storage has loaded.
// Exported (KEEPALIVE) so the JS callback can invoke it as Module._rayactWebStart.
extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebStart(void) {
    printf("[rayact-web] storage ready; requesting WebGPU device for canvas %s\n", kCanvasSelector);
    // Async device acquisition; the engine boots from onDeviceReady (tick no-ops until).
    rlwgAcquireDeviceAsync(kCanvasSelector, onDeviceReady, nullptr);
}

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebPointer(int action, int id, float x, float y) {
    rayact::engineQueueTouch(action, id, x, y);
}

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebAccessibilityActivate(uint32_t id) {
    if (rayact::accessibilityBridge().activate(id)) {
        rayact::engineRequestSurfaceRelayout(1);
    }
}

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebKey(
    int type, const char* key, const char* code, const char* text, int repeat,
    int ctrl, int alt, int shift, int meta) {
    rayact::engineQueueKeyEvent(type, key, code, text, repeat != 0, ctrl != 0,
                               alt != 0, shift != 0, meta != 0);
}

int main(void) {
    setvbuf(stdout, nullptr, _IOLBF, 0);
    emscripten_set_resize_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, nullptr, EM_TRUE, onBrowserResize);

    // Mount IDBFS for persistent storage (kv / mmkv / secure-store under /rayact_idbfs,
    // see rayactDataDir) and load any existing data, THEN start the engine. All
    // callback-driven — no ASYNCIFY. tick() periodically flushes back to IndexedDB.
    EM_ASM({
        try {
            FS.mkdir('/rayact_idbfs');
        } catch (e) { /* already exists */ }
        FS.mount(IDBFS, {}, '/rayact_idbfs');
        FS.syncfs(true, function(err) {
            if (err) console.error('[rayact-web] IDBFS load error: ' + err);
            Module._rayactWebStart();
        });
        (function installRayactResizeObserver() {
            var canvas = document.querySelector('#canvas');
            if (!canvas) {
                setTimeout(installRayactResizeObserver, 16);
                return;
            }
            if (!Module.__rayactCanvasResizeObserver && typeof ResizeObserver !== 'undefined') {
                Module.__rayactCanvasResizeObserver = new ResizeObserver(function() {
                    if (Module._rayactWebNotifyResize) Module._rayactWebNotifyResize();
                });
                Module.__rayactCanvasResizeObserver.observe(canvas);
            }
            if (!Module.__rayactWindowResizeInstalled) {
                Module.__rayactWindowResizeInstalled = true;
                window.addEventListener('resize', function() {
                    if (Module._rayactWebNotifyResize) Module._rayactWebNotifyResize();
                }, { passive: true });
            }
        })();
    });

    // Register the main loop now. simulate_infinite_loop=1 keeps the runtime alive
    // (no ASYNCIFY) so the IDBFS/WebGPU callbacks resolve and tick() keeps firing.
    // fps=60 selects setTimeout scheduling (vs rAF when fps<=0); setTimeout keeps
    // running in hidden/headless tabs where rAF is throttled to zero.
    emscripten_set_main_loop(tick, 60, 1);
    return 0;
}
