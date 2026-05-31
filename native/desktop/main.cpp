#include "raylib_bridge.hpp"
#include "platform.hpp"
#include "quickjs_bridge.hpp"
#include "raym3_bridge.hpp"
#include "css_bridge.hpp"
#include "js_stdlib.hpp"
#include "workers.hpp"
#include "net.hpp"
#include "net.hpp"
#include "utils/TypeStripper.h"
#include "utils/ScriptValidator.h"

extern "C" {
#include "quickjs.h"
#include "quickjs-libc.h"
}

#include <raym3/raym3.h>
#include <raym3/v2/Renderer.h>
#include <curl/curl.h>

#include <cstdio>
#include <cstdlib>
#include <cctype>
#include <cstring>
#include <iostream>
#include <sstream>
#include <vector>
#include <string>

// Forward declarations
static JSValue JS_initRaylib(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_renderRect(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_renderCircle(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_renderLine(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_updateFrame(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_createWindow(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_closeWindow(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_setCurrentWindow(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_getCurrentWindow(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_getWindowCount(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_navigateTo(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_navigateBack(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_navigateForward(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_clearNavigationStack(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_registerScreen(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_getCurrentScreen(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_printNavigationStatus(JSContext*, JSValue, int, JSValueConst*);

// Global variables
static JSRuntime* g_rt = nullptr;
static JSContext* g_ctx = nullptr;
static bool g_running = false;

// Default: MSAA 4x. User can override before initRaylib() via setConfigFlags().
static unsigned int g_configFlags = FLAG_MSAA_4X_HINT | FLAG_VSYNC_HINT;
static int g_targetFPS = 60;

// Window management
#include "window_manager.hpp"
static RayactWindow* g_currentWindow = nullptr;
static bool g_windowManagementEnabled = false;

// Screen management
static char** g_registeredScreens = nullptr;
static int g_screenCount = 0;
static int g_maxScreens = 0;

// Frame update function for QuickJS
static JSValue frameUpdateFunction = JS_UNDEFINED;

// Render frame function
static JSValue renderFrameFunction = JS_UNDEFINED;

// Shape data structure
struct Shape {
    int type;  // 0: rect, 1: circle, 2: line
    int x;
    int y;
    int width;
    int height;
    int radius;
    int x1;
    int y1;
    int x2;
    int y2;
    int rotation;
    int color;
};

static std::vector<Shape> g_shapes;
static std::string g_devServerUrl;
static int g_devRevision = 0;
static std::chrono::steady_clock::time_point g_nextDevPoll = std::chrono::steady_clock::now();

// Initialize QuickJS runtime
static JSRuntime* initRuntime() {
    JSRuntime* rt = JS_NewRuntime();
    if (!rt) {
        fprintf(stderr, "Failed to create QuickJS runtime\n");
        return nullptr;
    }

    js_std_init_handlers(rt);

    // Initialize window management
    g_windowManagementEnabled = true;
    initWindowManager();
    initNavigationSystem();

    printf("QuickJS runtime initialized with window management\n");

    return rt;
}

// Initialize QuickJS context for a window
static JSContext* initContextForWindow(JSRuntime* rt, const char* title) {
    JSContext* ctx = JS_NewContext(rt);
    if (!ctx) {
        fprintf(stderr, "Failed to create QuickJS context for window: %s\n", title);
        return nullptr;
    }

    // Initialize std and os modules
    js_init_module_std(ctx, "std");
    js_init_module_os(ctx, "os");

    return ctx;
}

// Initialize main QuickJS context
static JSContext* initContext(JSRuntime* rt) {
    JSContext* ctx = JS_NewContext(rt);
    if (!ctx) {
        fprintf(stderr, "Failed to create QuickJS context\n");
        return nullptr;
    }

    // Initialize std and os modules
    js_init_module_std(ctx, "std");
    js_init_module_os(ctx, "os");

    return ctx;
}

// Helper to get current window context safely
static JSContext* getCurrentContext() {
    if (!g_windowManagementEnabled || !g_currentWindow) {
        fprintf(stderr, "No current window active. Please create a window first.\n");
        return nullptr;
    }

    if (!isWindowValid(g_currentWindow)) {
        fprintf(stderr, "Current window is invalid.\n");
        return nullptr;
    }

    return g_currentWindow->context;
}

// Get current window context safely
static JSValue JS_getCurrentContext(JSContext* ctx, JSValue this_val,
                                    int argc, JSValue* argv) {
    JSContext* currentCtx = getCurrentContext();
    if (!currentCtx) {
        return JS_ThrowTypeError(ctx, "No current window");
    }
    return JS_NewInt32(ctx, 1); // Return success
}

// Register native functions
static void registerNativeFunctions(JSContext* ctx) {
    JSValue global;

    if (g_windowManagementEnabled) {
        // Get current window's global or main runtime global
        if (g_currentWindow) {
            global = JS_GetGlobalObject(g_currentWindow->context);
        } else {
            global = JS_GetGlobalObject(ctx);
        }
    } else {
        global = JS_GetGlobalObject(ctx);
    }

    // Window management functions
    if (g_windowManagementEnabled) {
        JS_SetPropertyStr(ctx, global, "createWindow",
                          JS_NewCFunction(ctx, JS_createWindow, "createWindow", 3));
        JS_SetPropertyStr(ctx, global, "closeWindow",
                          JS_NewCFunction(ctx, JS_closeWindow, "closeWindow", 1));
        JS_SetPropertyStr(ctx, global, "setCurrentWindow",
                          JS_NewCFunction(ctx, JS_setCurrentWindow, "setCurrentWindow", 1));
        JS_SetPropertyStr(ctx, global, "getCurrentWindow",
                          JS_NewCFunction(ctx, JS_getCurrentWindow, "getCurrentWindow", 0));
        JS_SetPropertyStr(ctx, global, "getWindowCount",
                          JS_NewCFunction(ctx, JS_getWindowCount, "getWindowCount", 0));
        JS_SetPropertyStr(ctx, global, "getCurrentContext",
                          JS_NewCFunction(ctx, JS_getCurrentContext, "getCurrentContext", 0));
    }

    // console, timers, performance, queueMicrotask, print, structuredClone, globalThis
    registerJSStdlib(ctx);
    registerNetBindings(ctx);

    // Original Raylib functions
    JS_SetPropertyStr(ctx, global, "initRaylib",
                      JS_NewCFunction(ctx, JS_initRaylib, "initRaylib", 3));

    JS_SetPropertyStr(ctx, global, "setConfigFlags",
        JS_NewCFunction(ctx, [](JSContext* ctx, JSValue, int argc, JSValueConst* argv) -> JSValue {
            if (argc >= 1) {
                uint32_t flags;
                JS_ToUint32(ctx, &flags, argv[0]);
                g_configFlags = flags;
            }
            return JS_UNDEFINED;
        }, "setConfigFlags", 1));

    JS_SetPropertyStr(ctx, global, "setTargetFPS",
        JS_NewCFunction(ctx, [](JSContext* ctx, JSValue, int argc, JSValueConst* argv) -> JSValue {
            if (argc >= 1) {
                int32_t fps;
                JS_ToInt32(ctx, &fps, argv[0]);
                g_targetFPS = fps;
                if (IsWindowReady()) SetTargetFPS(fps);
            }
            return JS_UNDEFINED;
        }, "setTargetFPS", 1));

    // ── Frame callback ───────────────────────────────────────────────────────
    JS_SetPropertyStr(ctx, global, "setOnFrame",
        JS_NewCFunction(ctx, [](JSContext* ctx, JSValue, int argc, JSValueConst* argv) -> JSValue {
            if (argc >= 1 && JS_IsFunction(ctx, argv[0])) {
                if (!JS_IsUndefined(frameUpdateFunction))
                    JS_FreeValue(ctx, frameUpdateFunction);
                frameUpdateFunction = JS_DupValue(ctx, argv[0]);
            }
            return JS_UNDEFINED;
        }, "setOnFrame", 1));

    // ── Mouse / input queries ────────────────────────────────────────────────
    JS_SetPropertyStr(ctx, global, "getMouseX",
        JS_NewCFunction(ctx, [](JSContext* ctx, JSValue, int, JSValueConst*) -> JSValue {
            return JS_NewFloat64(ctx, GetMousePosition().x);
        }, "getMouseX", 0));
    JS_SetPropertyStr(ctx, global, "getMouseY",
        JS_NewCFunction(ctx, [](JSContext* ctx, JSValue, int, JSValueConst*) -> JSValue {
            return JS_NewFloat64(ctx, GetMousePosition().y);
        }, "getMouseY", 0));
    JS_SetPropertyStr(ctx, global, "isMouseDown",
        JS_NewCFunction(ctx, [](JSContext* ctx, JSValue, int argc, JSValueConst* argv) -> JSValue {
            int btn = 0;
            if (argc >= 1) JS_ToInt32(ctx, &btn, argv[0]);
            return JS_NewBool(ctx, IsMouseButtonDown(btn));
        }, "isMouseDown", 1));
    JS_SetPropertyStr(ctx, global, "isMousePressed",
        JS_NewCFunction(ctx, [](JSContext* ctx, JSValue, int argc, JSValueConst* argv) -> JSValue {
            int btn = 0;
            if (argc >= 1) JS_ToInt32(ctx, &btn, argv[0]);
            return JS_NewBool(ctx, IsMouseButtonPressed(btn));
        }, "isMousePressed", 1));
    JS_SetPropertyStr(ctx, global, "isMouseReleased",
        JS_NewCFunction(ctx, [](JSContext* ctx, JSValue, int argc, JSValueConst* argv) -> JSValue {
            int btn = 0;
            if (argc >= 1) JS_ToInt32(ctx, &btn, argv[0]);
            return JS_NewBool(ctx, IsMouseButtonReleased(btn));
        }, "isMouseReleased", 1));
    JS_SetPropertyStr(ctx, global, "getMouseDelta",
        JS_NewCFunction(ctx, [](JSContext* ctx, JSValue, int, JSValueConst*) -> JSValue {
            Vector2 d = GetMouseDelta();
            JSValue obj = JS_NewObject(ctx);
            JS_SetPropertyStr(ctx, obj, "x", JS_NewFloat64(ctx, d.x));
            JS_SetPropertyStr(ctx, obj, "y", JS_NewFloat64(ctx, d.y));
            return obj;
        }, "getMouseDelta", 0));

    JS_SetPropertyStr(ctx, global, "renderRect",
                      JS_NewCFunction(ctx, JS_renderRect, "renderRect", 5));

    JS_SetPropertyStr(ctx, global, "renderCircle",
                      JS_NewCFunction(ctx, JS_renderCircle, "renderCircle", 4));

    JS_SetPropertyStr(ctx, global, "renderLine",
                      JS_NewCFunction(ctx, JS_renderLine, "renderLine", 5));

    JS_SetPropertyStr(ctx, global, "updateFrame",
                      JS_NewCFunction(ctx, JS_updateFrame, "updateFrame", 0));

    if (g_windowManagementEnabled) {
        // Navigation functions
        JS_SetPropertyStr(ctx, global, "navigateTo",
                          JS_NewCFunction(ctx, JS_navigateTo, "navigateTo", 1));
        JS_SetPropertyStr(ctx, global, "navigateBack",
                          JS_NewCFunction(ctx, JS_navigateBack, "navigateBack", 0));
        JS_SetPropertyStr(ctx, global, "navigateForward",
                          JS_NewCFunction(ctx, JS_navigateForward, "navigateForward", 0));
        JS_SetPropertyStr(ctx, global, "clearNavigationStack",
                          JS_NewCFunction(ctx, JS_clearNavigationStack, "clearNavigationStack", 0));

        // Screen registration
        JS_SetPropertyStr(ctx, global, "registerScreen",
                          JS_NewCFunction(ctx, JS_registerScreen, "registerScreen", 2));
        JS_SetPropertyStr(ctx, global, "getCurrentScreen",
                          JS_NewCFunction(ctx, JS_getCurrentScreen, "getCurrentScreen", 0));
        JS_SetPropertyStr(ctx, global, "printNavigationStatus",
                          JS_NewCFunction(ctx, JS_printNavigationStatus, "printNavigationStatus", 0));
    }

    // raym3 v2 bridge
    g_bridge_ctx = ctx;
    JS_SetPropertyStr(ctx, global, "createView",
                      JS_NewCFunction(ctx, JS_createView,   "createView",   1));
    JS_SetPropertyStr(ctx, global, "createText",
                      JS_NewCFunction(ctx, JS_createText,   "createText",   2));
    JS_SetPropertyStr(ctx, global, "createButton",
                      JS_NewCFunction(ctx, JS_createButton, "createButton", 2));
    JS_SetPropertyStr(ctx, global, "appendChild",
                      JS_NewCFunction(ctx, JS_appendChild,  "appendChild",  2));
    JS_SetPropertyStr(ctx, global, "removeChild",
                      JS_NewCFunction(ctx, JS_removeChild,  "removeChild",  2));
    JS_SetPropertyStr(ctx, global, "insertBefore",
                      JS_NewCFunction(ctx, JS_insertBefore, "insertBefore", 3));
    JS_SetPropertyStr(ctx, global, "setRootNode",
                      JS_NewCFunction(ctx, JS_setRootNode,  "setRootNode",  1));
    JS_SetPropertyStr(ctx, global, "clearRootNode",
                      JS_NewCFunction(ctx, JS_clearRootNode, "clearRootNode", 0));
    JS_SetPropertyStr(ctx, global, "setOnPress",
                      JS_NewCFunction(ctx, JS_setOnPress,   "setOnPress",   2));
    JS_SetPropertyStr(ctx, global, "setStyle",
                      JS_NewCFunction(ctx, JS_setStyle,     "setStyle",     2));
    JS_SetPropertyStr(ctx, global, "setText",
                      JS_NewCFunction(ctx, JS_setText,      "setText",      2));
    JS_SetPropertyStr(ctx, global, "disposeNode",
                      JS_NewCFunction(ctx, JS_disposeNode,  "disposeNode",  1));
    JS_SetPropertyStr(ctx, global, "createImage",
                      JS_NewCFunction(ctx, JS_createImage,  "createImage",  2));
    JS_SetPropertyStr(ctx, global, "createIcon",
                      JS_NewCFunction(ctx, JS_createIcon,   "createIcon",   4));
    JS_SetPropertyStr(ctx, global, "registerFont",
                      JS_NewCFunction(ctx, JS_registerFont, "registerFont", 2));

    // CSS import bridge
    JS_SetPropertyStr(ctx, global, "importCSS",
                      JS_NewCFunction(ctx, JS_importCSS,    "importCSS",    1));

    JS_FreeValue(ctx, global);

    // Worker system (spawnWorker, postToWorker, terminateWorker, drawWorkerCanvas)
    registerWorkerBindings(ctx);
    // Network: fetch, EventSource, WebSocket
    registerNetBindings(ctx);
}

// JavaScript function: initRaylib(width, height, title)
static JSValue JS_initRaylib(JSContext* ctx, JSValue this_val,
                            int argc, JSValueConst* argv) {
    int width, height;
    const char* title;

    if (argc != 3) {
        return JS_ThrowTypeError(ctx, "Expected 3 arguments: width, height, title");
    }

    if (JS_ToInt32(ctx, &width, argv[0]) < 0 ||
        JS_ToInt32(ctx, &height, argv[1]) < 0) {
        return JS_ThrowTypeError(ctx, "Invalid width or height");
    }

    title = JS_ToCString(ctx, argv[2]);
    if (!title) {
        return JS_ThrowTypeError(ctx, "Invalid title");
    }

    // Initialize raylib window
    SetConfigFlags(g_configFlags);
    InitWindow(width, height, title);
    SetTargetFPS(g_targetFPS);

    printf("Initialized raylib window: %dx%d \"%s\"\n", width, height, title);

    JS_FreeCString(ctx, title);
    return JS_UNDEFINED;
}

// JavaScript function: renderRect(x, y, width, height, color)
static JSValue JS_renderRect(JSContext* ctx, JSValue this_val,
                             int argc, JSValueConst* argv) {
    int x, y, width, height;
    int color;

    if (argc != 5) {
        return JS_ThrowTypeError(ctx, "Expected 5 arguments: x, y, width, height, color");
    }

    if (JS_ToInt32(ctx, &x, argv[0]) < 0 ||
        JS_ToInt32(ctx, &y, argv[1]) < 0 ||
        JS_ToInt32(ctx, &width, argv[2]) < 0 ||
        JS_ToInt32(ctx, &height, argv[3]) < 0) {
        return JS_ThrowTypeError(ctx, "Invalid rectangle coordinates");
    }

    uint32_t colorVal;
    if (JS_ToUint32(ctx, &colorVal, argv[4]) < 0) {
        return JS_ThrowTypeError(ctx, "Invalid rectangle color");
    }
    color = (int)colorVal;

    // Add shape to render list
    g_shapes.push_back({0, x, y, width, height, 0, 0, 0, 0, 0, 0, color});

    return JS_UNDEFINED;
}

// JavaScript function: renderCircle(x, y, radius, color)
static JSValue JS_renderCircle(JSContext* ctx, JSValue this_val,
                               int argc, JSValueConst* argv) {
    int x, y, radius;
    int color;

    if (argc != 4) {
        return JS_ThrowTypeError(ctx, "Expected 4 arguments: x, y, radius, color");
    }

    if (JS_ToInt32(ctx, &x, argv[0]) < 0 ||
        JS_ToInt32(ctx, &y, argv[1]) < 0 ||
        JS_ToInt32(ctx, &radius, argv[2]) < 0) {
        return JS_ThrowTypeError(ctx, "Invalid circle coordinates");
    }

    uint32_t colorVal;
    if (JS_ToUint32(ctx, &colorVal, argv[3]) < 0) {
        return JS_ThrowTypeError(ctx, "Invalid circle color");
    }
    color = (int)colorVal;

    // Add shape to render list
    g_shapes.push_back({1, x, y, 0, 0, radius, 0, 0, 0, 0, 0, color});

    return JS_UNDEFINED;
}

// JavaScript function: renderLine(x1, y1, x2, y2, color)
static JSValue JS_renderLine(JSContext* ctx, JSValue this_val,
                             int argc, JSValueConst* argv) {
    int x1, y1, x2, y2;
    int color;

    if (argc != 5) {
        return JS_ThrowTypeError(ctx, "Expected 5 arguments: x1, y1, x2, y2, color");
    }

    if (JS_ToInt32(ctx, &x1, argv[0]) < 0 ||
        JS_ToInt32(ctx, &y1, argv[1]) < 0 ||
        JS_ToInt32(ctx, &x2, argv[2]) < 0 ||
        JS_ToInt32(ctx, &y2, argv[3]) < 0) {
        return JS_ThrowTypeError(ctx, "Invalid line coordinates");
    }

    uint32_t colorVal;
    if (JS_ToUint32(ctx, &colorVal, argv[4]) < 0) {
        return JS_ThrowTypeError(ctx, "Invalid line color");
    }
    color = (int)colorVal;

    // Add shape to render list
    g_shapes.push_back({2, x1, y1, 0, 0, 0, x1, y1, x2, y2, 0, color});

    return JS_UNDEFINED;
}

// JavaScript function: updateFrame()
static JSValue JS_updateFrame(JSContext* ctx, JSValue this_val,
                             int argc, JSValueConst* argv) {
    // Clear shape list for new frame
    g_shapes.clear();

    return JS_UNDEFINED;
}

// Window management functions
static JSValue JS_createWindow(JSContext* ctx, JSValue this_val,
                               int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

static JSValue JS_closeWindow(JSContext* ctx, JSValue this_val,
                              int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

static JSValue JS_setCurrentWindow(JSContext* ctx, JSValue this_val,
                                   int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

static JSValue JS_getCurrentWindow(JSContext* ctx, JSValue this_val,
                                   int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

static JSValue JS_getWindowCount(JSContext* ctx, JSValue this_val,
                                 int argc, JSValueConst* argv) {
    return JS_NewInt32(ctx, 0);
}

// Navigation functions
static JSValue JS_navigateTo(JSContext* ctx, JSValue this_val,
                             int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

static JSValue JS_navigateBack(JSContext* ctx, JSValue this_val,
                               int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

static JSValue JS_navigateForward(JSContext* ctx, JSValue this_val,
                                  int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

static JSValue JS_clearNavigationStack(JSContext* ctx, JSValue this_val,
                                       int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

// Screen registration
static JSValue JS_registerScreen(JSContext* ctx, JSValue this_val,
                                 int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

static JSValue JS_getCurrentScreen(JSContext* ctx, JSValue this_val,
                                   int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

static JSValue JS_printNavigationStatus(JSContext* ctx, JSValue this_val,
                                        int argc, JSValueConst* argv) {
    return JS_UNDEFINED;
}

// Auto-inject material_icons once so all user scripts have the Icons map.
// Prefers .jsc bytecode (faster load, no parse) if present alongside the .js.
static void injectMaterialIcons(JSContext* ctx) {
    static bool injected = false;
    if (injected) return;
    injected = true;

    // Try bytecode first (pre-compiled with: rayact_desktop --compile material_icons.js)
    const char* jscCandidates[] = {
        "./resources/fonts/material_icons.jsc",
        "resources/fonts/material_icons.jsc",
        nullptr
    };
    for (int i = 0; jscCandidates[i]; i++) {
        FILE* f = fopen(jscCandidates[i], "rb");
        if (!f) continue;
        fseek(f, 0, SEEK_END);
        long len = ftell(f);
        fseek(f, 0, SEEK_SET);
        std::vector<uint8_t> buf(len);
        fread(buf.data(), 1, len, f);
        fclose(f);
        JSValue obj = JS_ReadObject(ctx, buf.data(), buf.size(), JS_READ_OBJ_BYTECODE);
        if (!JS_IsException(obj)) {
            JSValue r = JS_EvalFunction(ctx, obj);
            if (!JS_IsException(r)) {
                printf("Material Icons loaded from bytecode (%ld bytes)\n", len);
                JS_FreeValue(ctx, r);
                return;
            }
            JS_FreeValue(ctx, r);
        } else {
            JS_FreeValue(ctx, obj);
        }
        JSValue exc = JS_GetException(ctx);
        JS_FreeValue(ctx, exc); // clear exception, fall through to source
    }

    // Fall back to source JS
    const char* candidates[] = {
        "./resources/fonts/material_icons.js",
        "resources/fonts/material_icons.js",
        nullptr
    };
    for (int i = 0; candidates[i]; i++) {
        FILE* f = fopen(candidates[i], "r");
        if (!f) continue;
        fseek(f, 0, SEEK_END);
        long len = ftell(f);
        fseek(f, 0, SEEK_SET);
        std::string src(len, '\0');
        fread(&src[0], 1, len, f);
        fclose(f);
        JSValue r = JS_Eval(ctx, src.c_str(), src.size(), "material_icons.js", JS_EVAL_TYPE_GLOBAL);
        if (JS_IsException(r)) {
            JSValue exc = JS_GetException(ctx);
            const char* s = JS_ToCString(ctx, exc);
            fprintf(stderr, "material_icons.js error: %s\n", s ? s : "?");
            if (s) JS_FreeCString(ctx, s);
            JS_FreeValue(ctx, exc);
        } else {
            printf("Material Icons loaded (%ld bytes)\n", len);
        }
        JS_FreeValue(ctx, r);
        return;
    }
    printf("material_icons.js not found — icon names won't resolve\n");
}

// Load and execute pre-compiled QuickJS bytecode (.jsc file).
static bool loadBytecodeFile(JSContext* ctx, const char* filename) {
    FILE* f = fopen(filename, "rb");
    if (!f) return false;
    fseek(f, 0, SEEK_END);
    long len = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::vector<uint8_t> buf(len);
    fread(buf.data(), 1, len, f);
    fclose(f);

    printf("Loaded bytecode: %s (%ld bytes)\n", filename, len);
    JSValue obj = JS_ReadObject(ctx, buf.data(), buf.size(), JS_READ_OBJ_BYTECODE);
    if (JS_IsException(obj)) {
        JSValue exc = JS_GetException(ctx);
        const char* s = JS_ToCString(ctx, exc);
        fprintf(stderr, "Bytecode load error in '%s': %s\n", filename, s ? s : "?");
        if (s) JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, exc);
        JS_FreeValue(ctx, obj);
        return false;
    }
    JSValue result = JS_EvalFunction(ctx, obj); // obj ownership transferred
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(ctx);
        const char* s = JS_ToCString(ctx, exc);
        fprintf(stderr, "Bytecode eval error in '%s': %s\n", filename, s ? s : "?");
        if (s) JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, exc);
        JS_FreeValue(ctx, result);
        return false;
    }
    JS_FreeValue(ctx, result);
    printf("Successfully executed bytecode: %s\n", filename);
    return true;
}

// Compile a JS source file to QuickJS bytecode and write a .jsc file.
// Returns the output path on success, empty string on failure.
static std::string compileJSToBytecode(JSContext* ctx, const char* srcFile, const char* outFile) {
    FILE* f = fopen(srcFile, "r");
    if (!f) { fprintf(stderr, "compile: cannot open %s\n", srcFile); return ""; }
    fseek(f, 0, SEEK_END);
    long len = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::string src(len, '\0');
    fread(&src[0], 1, len, f);
    fclose(f);

    // Compile to bytecode (no eval)
    JSValue fn = JS_Eval(ctx, src.c_str(), src.size(), srcFile,
                         JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
    if (JS_IsException(fn)) {
        JSValue exc = JS_GetException(ctx);
        const char* s = JS_ToCString(ctx, exc);
        fprintf(stderr, "compile error in '%s': %s\n", srcFile, s ? s : "?");
        if (s) JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, exc);
        JS_FreeValue(ctx, fn);
        return "";
    }

    size_t outLen = 0;
    uint8_t* bytes = JS_WriteObject(ctx, &outLen, fn, JS_WRITE_OBJ_BYTECODE);
    JS_FreeValue(ctx, fn);
    if (!bytes) { fprintf(stderr, "compile: JS_WriteObject failed\n"); return ""; }

    // Determine output path
    std::string out = outFile ? std::string(outFile) : (std::string(srcFile) + "c"); // .js → .jsc
    FILE* of = fopen(out.c_str(), "wb");
    if (!of) {
        fprintf(stderr, "compile: cannot write %s\n", out.c_str());
        js_free(ctx, bytes);
        return "";
    }
    fwrite(bytes, 1, outLen, of);
    fclose(of);
    js_free(ctx, bytes);
    printf("Compiled %s → %s (%zu bytes)\n", srcFile, out.c_str(), outLen);
    return out;
}

// Helper function to load and execute JavaScript (or bytecode)
static bool loadJavaScriptFile(JSContext* ctx, const char* filename) {
    // .jsc = pre-compiled QuickJS bytecode — skip source parsing but still inject globals
    std::string fn(filename);
    if (fn.size() >= 4 && fn.substr(fn.size() - 4) == ".jsc") {
        injectMaterialIcons(ctx);
        return loadBytecodeFile(ctx, filename);
    }

    injectMaterialIcons(ctx);

    // First, try loading the file directly
    FILE* file = fopen(filename, "r");
    if (!file) {
        // Try relative to project root
        file = fopen(("./" + std::string(filename)).c_str(), "r");
        if (!file) {
            // Try from dist directory
            file = fopen(("../dist/" + std::string(filename)).c_str(), "r");
            if (!file) {
                // Try from apps/desktop
                file = fopen(("../apps/desktop/" + std::string(filename)).c_str(), "r");
                if (!file) {
                    // Try to compile a simple example
                    printf("Could not find %s. Using built-in demo.\n", filename);
                    return false;
                }
            }
        }
    }

    // Read file content
    fseek(file, 0, SEEK_END);
    long fileSize = ftell(file);
    fseek(file, 0, SEEK_SET);

    std::string script;
    script.resize(fileSize);
    fread(&script[0], 1, fileSize, file);
    fclose(file);

    printf("Loaded file: %s (%ld bytes)\n", filename, fileSize);

    // TypeScript: validate then strip types
    std::string ext;
    {
        std::string fn(filename);
        auto dot = fn.rfind('.');
        if (dot != std::string::npos) ext = fn.substr(dot);
    }
    bool isTypeScript = (ext == ".ts" || ext == ".tsx");

    if (isTypeScript) {
        std::vector<Fovea::ScriptError> errors;
        if (!Fovea::ScriptValidator::Validate(script, filename, errors)) {
            for (auto& e : errors) {
                fprintf(stderr, "TypeScript error at %u:%u — %s\n", e.line, e.column, e.message.c_str());
            }
            return false;
        }
        printf("TypeScript validated OK, stripping types...\n");
        script = Fovea::TypeStripper::Strip(script);
        printf("Stripped to %zu bytes\n", script.size());
    }

    // Execute JavaScript
    JSValue result = JS_Eval(ctx, script.c_str(), script.length(), filename, JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(result)) {
        JSValue exception = JS_GetException(ctx);
        const char* exceptionStr = JS_ToCString(ctx, exception);
        fprintf(stderr, "JavaScript error in file '%s': %s\n", filename, exceptionStr);
        JS_FreeCString(ctx, exceptionStr);
        JS_FreeValue(ctx, exception);
        JS_FreeValue(ctx, result);
        return false;
    }

    JS_FreeValue(ctx, result);
    printf("Successfully executed JavaScript file: %s\n", filename);

    return true;
}

static size_t writeHttpBody(char* ptr, size_t size, size_t nmemb, void* userdata) {
    auto* body = static_cast<std::string*>(userdata);
    body->append(ptr, size * nmemb);
    return size * nmemb;
}

static bool httpGet(const std::string& url, std::string& body, std::string& error) {
    CURL* curl = curl_easy_init();
    if (!curl) {
        error = "curl_easy_init failed";
        return false;
    }

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeHttpBody);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &body);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);

    CURLcode result = curl_easy_perform(curl);
    long status = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
    curl_easy_cleanup(curl);

    if (result != CURLE_OK) {
        error = curl_easy_strerror(result);
        return false;
    }
    if (status < 200 || status >= 300) {
        std::ostringstream out;
        out << "HTTP " << status << " from " << url << "\n" << body;
        error = out.str();
        return false;
    }

    return true;
}

static int parseJsonIntField(const std::string& json, const std::string& field) {
    std::string key = "\"" + field + "\"";
    size_t pos = json.find(key);
    if (pos == std::string::npos) return 0;
    pos = json.find(':', pos + key.size());
    if (pos == std::string::npos) return 0;
    pos++;
    while (pos < json.size() && std::isspace(static_cast<unsigned char>(json[pos]))) pos++;
    int value = 0;
    while (pos < json.size() && std::isdigit(static_cast<unsigned char>(json[pos]))) {
        value = value * 10 + (json[pos] - '0');
        pos++;
    }
    return value;
}

static std::string jsQuote(const std::string& value) {
    std::string out = "\"";
    for (char ch : value) {
        switch (ch) {
            case '\\': out += "\\\\"; break;
            case '"': out += "\\\""; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += ch; break;
        }
    }
    out += "\"";
    return out;
}

static void setGlobalString(JSContext* ctx, const char* name, const std::string& value) {
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, name, JS_NewString(ctx, value.c_str()));
    JS_FreeValue(ctx, global);
}

static void ensureDevWindow() {
    if (IsWindowReady()) return;
    SetConfigFlags(g_configFlags);
    InitWindow(1000, 700, "Rayact Dev Client");
    SetTargetFPS(g_targetFPS);
    printf("Initialized default dev window: 1000x700 \"Rayact Dev Client\"\n");
}

static void showDevErrorOverlay(JSContext* ctx, const std::string& message) {
    if (!IsWindowReady()) {
        SetConfigFlags(g_configFlags);
        InitWindow(980, 560, "Rayact Dev Error");
        SetTargetFPS(g_targetFPS);
    }

    std::string script =
        "var __rayactErrorRoot = createView({ backgroundColor: 0x2B1111FF, padding: 24, gap: 12, flexGrow: 1 });\n"
        "appendChild(__rayactErrorRoot, createText('Rayact dev client failed', { text: { color: 0xFFFFFFFF, fontSize: 24 } }));\n"
        "appendChild(__rayactErrorRoot, createText(" + jsQuote(message) + ", { text: { color: 0xFFB4B4FF, fontSize: 14 } }));\n"
        "setRootNode(__rayactErrorRoot);\n";
    JSValue result = JS_Eval(ctx, script.c_str(), script.size(), "rayact_dev_error_overlay.js", JS_EVAL_TYPE_GLOBAL);
    JS_FreeValue(ctx, result);
}

static bool loadDevServerBundle(JSContext* ctx, const std::string& devServer) {
    printf("Connecting to Rayact dev server: %s\n", devServer.c_str());
    setGlobalString(ctx, "__RAYACT_DEV_SERVER__", devServer);

    std::string manifest;
    std::string error;
    if (!httpGet(devServer + "/rayact/manifest.json", manifest, error)) {
        showDevErrorOverlay(ctx, "Failed to fetch dev manifest:\n" + error);
        return false;
    }
    printf("Rayact dev manifest: %s\n", manifest.c_str());
    g_devRevision = parseJsonIntField(manifest, "revision");
    g_devServerUrl = devServer;
    g_nextDevPoll = std::chrono::steady_clock::now() + std::chrono::seconds(1);
    printf("Rayact dev polling enabled: %s (revision %d)\n", g_devServerUrl.c_str(), g_devRevision);

    ensureDevWindow();

    std::string bundle;
    if (!httpGet(devServer + "/rayact/bundle", bundle, error)) {
        showDevErrorOverlay(ctx, "Failed to fetch dev bundle:\n" + error);
        return false;
    }

    JSValue result = JS_Eval(ctx, bundle.c_str(), bundle.size(), "rayact_dev_bundle.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(result)) {
        JSValue exception = JS_GetException(ctx);
        const char* exceptionStr = JS_ToCString(ctx, exception);
        std::string message = exceptionStr ? exceptionStr : "Unknown JavaScript exception";
        JS_FreeCString(ctx, exceptionStr);
        JS_FreeValue(ctx, exception);
        JS_FreeValue(ctx, result);
        showDevErrorOverlay(ctx, "Failed to evaluate dev bundle:\n" + message);
        return false;
    }

    JS_FreeValue(ctx, result);
    printf("Successfully loaded Rayact dev bundle (%zu bytes)\n", bundle.size());
    return true;
}

static void pollDevServer(JSContext* ctx) {
    if (g_devServerUrl.empty()) return;
    auto now = std::chrono::steady_clock::now();
    if (now < g_nextDevPoll) return;
    g_nextDevPoll = now + std::chrono::seconds(1);

    std::string status;
    std::string error;
    if (!httpGet(g_devServerUrl + "/rayact/status", status, error)) {
        fprintf(stderr, "Rayact dev poll failed: %s\n", error.c_str());
        return;
    }

    int revision = parseJsonIntField(status, "revision");
    if (revision <= 0 || revision == g_devRevision) return;

    printf("Rayact dev revision changed: %d -> %d\n", g_devRevision, revision);

    std::string bundle;
    if (!httpGet(g_devServerUrl + "/rayact/bundle", bundle, error)) {
        showDevErrorOverlay(ctx, "Failed to fetch dev bundle:\n" + error);
        return;
    }

    JSValue result = JS_Eval(ctx, bundle.c_str(), bundle.size(), "rayact_dev_bundle.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(result)) {
        JSValue exception = JS_GetException(ctx);
        const char* exceptionStr = JS_ToCString(ctx, exception);
        std::string message = exceptionStr ? exceptionStr : "Unknown JavaScript exception";
        JS_FreeCString(ctx, exceptionStr);
        JS_FreeValue(ctx, exception);
        JS_FreeValue(ctx, result);
        showDevErrorOverlay(ctx, "Failed to evaluate dev bundle:\n" + message);
        return;
    }

    JS_FreeValue(ctx, result);
    g_devRevision = revision;
    printf("Rayact dev bundle reloaded (%zu bytes)\n", bundle.size());
}

static std::string getArgValue(int argc, char** argv, const std::string& name) {
    for (int i = 1; i + 1 < argc; i++) {
        if (argv[i] && name == argv[i]) {
            return argv[i + 1] ? argv[i + 1] : "";
        }
    }
    return "";
}

// Main application loop
void mainLoop(JSContext* ctx) {
    printf("Starting main loop\n");

    if (!IsWindowReady()) {
        fprintf(stderr, "Window not ready — cannot start render loop\n");
        return;
    }

    raym3::Initialize();
    // Main event loop
    while (!WindowShouldClose()) {
        // Pump QJS event loop: 1ms timeout allows macOS Cocoa to process window
        // events without blocking the 60fps render loop for more than ~1ms.
        // js_std_loop_once: drains pending jobs + fires expired QJS os.timers
        // without blocking. js_std_loop (infinite poll) must not be used here.
        js_std_loop_once(ctx);
        tickJSTimers(ctx);
        drainNetEvents(ctx);
        pollDevServer(ctx);

        // Deliver worker messages to JS (outbox drain — non-blocking)
        drainWorkerOutbox(ctx);
        // Deliver network events (fetch responses, SSE messages, WS frames)
        drainNetEvents(ctx);

        // Execute JS frame update callback if registered
        if (!JS_IsUndefined(frameUpdateFunction)) {
            if (!g_root) g_shapes.clear();
            JSValue args[] = { JS_NewInt32(ctx, GetRenderWidth()), JS_NewInt32(ctx, GetRenderHeight()) };
            JSValue result = JS_Call(ctx, frameUpdateFunction, JS_UNDEFINED, 2, args);
            JS_FreeValue(ctx, args[0]);
            JS_FreeValue(ctx, args[1]);
            if (JS_IsException(result)) {
                JSValue exception = JS_GetException(ctx);
                const char* exceptionStr = JS_ToCString(ctx, exception);
                fprintf(stderr, "JavaScript error in frame update: %s\n", exceptionStr);
                JS_FreeCString(ctx, exceptionStr);
                JS_FreeValue(ctx, exception);
            }
            JS_FreeValue(ctx, result);
        }

        BeginDrawing();
        ClearBackground(BLACK);

        raym3::BeginFrame();

        if (g_root) {
            // raym3 v2 retained-mode path
            Rectangle bounds = {0, 0, (float)GetRenderWidth(), (float)GetRenderHeight()};
            raym3::v2::UpdateLayout(g_root, bounds);
            raym3::v2::Render(g_root, bounds);

            {
                Vector2 mouse = GetMousePosition();
                bool pressed  = IsMouseButtonPressed(MOUSE_LEFT_BUTTON);
                bool released = IsMouseButtonReleased(MOUSE_LEFT_BUTTON);
                bool down     = IsMouseButtonDown(MOUSE_LEFT_BUTTON);

                // Route hover/move/drag/down/up to any worker canvas node
                processWorkerInputEvents(mouse.x, mouse.y, pressed, released, down);

                // Standard raym3 press dispatch (fires onPress on release)
                if (released) {
                    auto hit = raym3::v2::HitTest(g_root, mouse);
                    if (hit && hit->onPress) hit->onPress();
                }
            }
        } else {
            // Fallback: immediate-mode shapes (backward compat)
            for (const Shape& shape : g_shapes) {
                switch (shape.type) {
                    case 0: {
                        Color c = {
                            (unsigned char)((shape.color >> 24) & 0xFF),
                            (unsigned char)((shape.color >> 16) & 0xFF),
                            (unsigned char)((shape.color >>  8) & 0xFF),
                            (unsigned char)( shape.color        & 0xFF)
                        };
                        DrawRectangle(shape.x, shape.y, shape.width, shape.height, c);
                        break;
                    }
                    case 1: {
                        Color c = {
                            (unsigned char)((shape.color >> 24) & 0xFF),
                            (unsigned char)((shape.color >> 16) & 0xFF),
                            (unsigned char)((shape.color >>  8) & 0xFF),
                            (unsigned char)( shape.color        & 0xFF)
                        };
                        DrawCircle(shape.x, shape.y, shape.radius, c);
                        break;
                    }
                    case 2: {
                        Color c = {
                            (unsigned char)((shape.color >> 24) & 0xFF),
                            (unsigned char)((shape.color >> 16) & 0xFF),
                            (unsigned char)((shape.color >>  8) & 0xFF),
                            (unsigned char)( shape.color        & 0xFF)
                        };
                        DrawLine(shape.x1, shape.y1, shape.x2, shape.y2, c);
                        break;
                    }
                }
            }
        }

        raym3::EndFrame();
        EndDrawing();
    }

    g_shapes.clear();
    raym3::Shutdown();

    printf("Main loop finished\n");
}

int main(int argc, char** argv) {
    setvbuf(stdout, nullptr, _IOLBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);

    std::cout << "========================================" << std::endl;
    std::cout << "  Rayact - QuickJS Desktop Renderer" << std::endl;
    std::cout << "  Version 0.1.0" << std::endl;
    std::cout << "========================================" << std::endl;

    PlatformBridge::printPlatformInfo();

    // Initialize QuickJS runtime
    std::cout << "\n[1/3] Initializing QuickJS runtime..." << std::endl;
    g_rt = initRuntime();
    if (!g_rt) {
        std::cerr << "Failed to create QuickJS runtime" << std::endl;
        return 1;
    }
    std::cout << "✓ QuickJS runtime initialized successfully" << std::endl;

    // Initialize QuickJS context
    std::cout << "[2/3] Initializing QuickJS context..." << std::endl;
    g_ctx = initContext(g_rt);
    if (!g_ctx) {
        std::cerr << "Failed to create QuickJS context" << std::endl;
        JS_FreeRuntime(g_rt);
        return 1;
    }
    std::cout << "✓ QuickJS context initialized successfully" << std::endl;

    // Setup module loader for ES6 modules
    // JS_SetModuleLoaderFunc(g_rt, nullptr, js_module_loader, nullptr);
    // std::cout << "✓ ES6 module loader configured" << std::endl;

    // Register native functions
    std::cout << "[3/3] Registering native functions..." << std::endl;
    registerNativeFunctions(g_ctx);
    std::cout << "✓ Native functions registered" << std::endl;

    // --compile <src> [out.jsc]  — compile JS/TS to bytecode and exit
    if (argc >= 3 && std::string(argv[1]) == "--compile") {
        const char* src = argv[2];
        const char* out = argc >= 4 ? argv[3] : nullptr;
        registerNativeFunctions(g_ctx); // needed for syntax that refs natives
        std::string result = compileJSToBytecode(g_ctx, src, out);
        JS_FreeContext(g_ctx);
        JS_FreeRuntime(g_rt);
        return result.empty() ? 1 : 0;
    }

    // Load JavaScript application
    bool success = false;
    std::string jsFile;
    std::string devServer = getArgValue(argc, argv, "--dev-server");
    if (devServer.empty()) {
        const char* envDevServer = std::getenv("RAYACT_DEV_SERVER");
        if (envDevServer && envDevServer[0]) devServer = envDevServer;
    }
    bool devMode = !devServer.empty();

    if (devMode) {
        success = loadDevServerBundle(g_ctx, devServer);
    } else if (argc > 1 && argv[1][0] != '-') {
        jsFile = argv[1];
        std::cout << "\nAttempting to load: " << jsFile << std::endl;
        success = loadJavaScriptFile(g_ctx, jsFile.c_str());
    }

if (!success && !devMode) {
        std::cout << "\n[4/4] Using built-in demo application" << std::endl;

        // Simple demo that we can run if file loading fails
        const char* demoScript =
            "initRaylib(800, 600, \"Rayact - Built-in Demo\");\n"
            "\n"
            "// Draw red rectangle\n"
            "renderRect(100, 100, 200, 150, 0xFF0000FF);\n"
            "\n"
            "// Draw green circle\n"
            "renderCircle(400, 300, 50, 0xFF00FF00);\n"
            "\n"
            "// Draw blue line\n"
            "renderLine(100, 300, 700, 300, 0x0000FFFF);\n"
            "\n"
            "// Draw additional rectangles\n"
            "renderRect(150, 200, 150, 100, 0xFFFF00FF);\n"
            "renderRect(500, 200, 150, 100, 0xFF00FFFF);\n";

        JSValue demoResult = JS_Eval(g_ctx, demoScript, strlen(demoScript), "built_in_demo.js", JS_EVAL_TYPE_GLOBAL);

        if (JS_IsException(demoResult)) {
            JSValue exception = JS_GetException(g_ctx);
            const char* exceptionStr = JS_ToCString(g_ctx, exception);
            std::cerr << "Error in built-in demo: " << exceptionStr << std::endl;
            JS_FreeCString(g_ctx, exceptionStr);
            JS_FreeValue(g_ctx, exception);
            JS_FreeValue(g_ctx, demoResult);
        } else {
            JS_FreeValue(g_ctx, demoResult);
            success = true;
        }
    }

    if (!success && !devMode) {
        printf("Failed to load JavaScript application\n");
        printf("Usage: rayact_desktop [app.js]\n");
        printf("  app.js - JavaScript application to load (optional)\n");
        printf("\nIf no file is provided, a built-in demo will run.\n");
        JS_FreeContext(g_ctx);
        JS_FreeRuntime(g_rt);
        return 1;
    }

    // Rasterize all icons used during JS init into a single sprite sheet texture.
    // Must happen after JS runs (so all createIcon calls have registered their CPs)
    // and after window is ready (so OpenGL RenderTexture is available).
    buildIconSpriteSheet();

    // Run GC before entering render loop — frees temp objects from script init
    // (parsed AST fragments, intermediate closures, init-only allocations).
    JS_RunGC(g_rt);

    // Start main loop
    std::cout << "\nStarting main render loop..." << std::endl;
    mainLoop(g_ctx);

    // Cleanup
    std::cout << "\nCleaning up..." << std::endl;
    g_shapes.clear();
    shutdownWorkers();          // join all worker threads, unload canvas textures
    shutdownNetCtx(g_ctx);      // stop fetch/SSE/WS threads, free JS values
    cleanupRaym3Bridge(g_ctx);
    cleanupCSSBridge(g_ctx);
    cleanupJSStdlib(g_ctx);

    JS_FreeContext(g_ctx);
    js_std_free_handlers(g_rt);
    JS_FreeRuntime(g_rt);

    std::cout << "========================================" << std::endl;
    std::cout << "  Rayact - Finished successfully" << std::endl;
    std::cout << "========================================" << std::endl;
    return 0;
}
