#include "raylib_bridge.hpp"
#include "theme_bridge.hpp"
#include "system_appearance.hpp"
#include "platform.hpp"
#include "../core/engine.hpp"
#include "quickjs_bridge.hpp"
#include "raym3_bridge.hpp"
#include "css_bridge.hpp"
#include "js_stdlib.hpp"
#ifndef RAYACT_NO_WORKERS
#include "workers.hpp"
#endif
#ifndef RAYACT_NO_NET
#include "net.hpp"
#endif
#ifndef RAYACT_NO_TS
#include "utils/TypeStripper.h"
#include "utils/ScriptValidator.h"
#endif

extern "C" {
#include "quickjs.h"
#include "quickjs-libc.h"
}

#include <raym3/raym3.h>
#include <raym3/v2/Renderer.h>
#include <raym3/styles/Theme.h>
#ifndef RAYACT_NO_NET
#include <curl/curl.h>
#endif

#include <cstdio>
#include <cstdlib>
#include <cctype>
#include <cstring>
#include <algorithm>
#include <array>
#include <cmath>
#include <iostream>
#include <sstream>
#include <vector>
#include <string>
#include <filesystem>

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
static JSValue JS_resolveAssetUrl(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_resolveAssetPath(JSContext*, JSValue, int, JSValueConst*);
static JSValue JS_readAssetBytes(JSContext*, JSValue, int, JSValueConst*);

// Global variables
static JSRuntime* g_rt = nullptr;
static JSContext* g_ctx = nullptr;
static bool g_running = false;
static std::filesystem::path g_releaseAssetBaseDir;

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

#ifdef RAYACT_ANDROID
static void drawAndroidDiagnosticCube(int width, int height) {
    const float time = static_cast<float>(GetTime());
    struct CubeVertex3 {
        float x;
        float y;
        float z;
    };
    struct CubeFace {
        int i0;
        int i1;
        int i2;
        int i3;
        Color color;
        float depth;
    };

    const float angleY = time * 0.95f;
    const float angleX = time * 0.55f;
    const float cubeSize = 1.25f;
    const float half = cubeSize * 0.5f;
    const float cameraDistance = 4.2f;
    const float focal = 760.0f;
    const float centerX = width * 0.5f;
    const float centerY = height * 0.56f;

    const float sinY = std::sinf(angleY);
    const float cosY = std::cosf(angleY);
    const float sinX = std::sinf(angleX);
    const float cosX = std::cosf(angleX);

    const std::array<CubeVertex3, 8> base = {{
        {-half, -half, -half},
        { half, -half, -half},
        { half,  half, -half},
        {-half,  half, -half},
        {-half, -half,  half},
        { half, -half,  half},
        { half,  half,  half},
        {-half,  half,  half},
    }};

    std::array<CubeVertex3, 8> rotated = {};
    std::array<Vector2, 8> projected = {};
    for (size_t i = 0; i < base.size(); ++i) {
        const CubeVertex3& v = base[i];
        const float xzX = cosY * v.x + sinY * v.z;
        const float xzZ = -sinY * v.x + cosY * v.z;
        const float yzY = cosX * v.y - sinX * xzZ;
        const float yzZ = sinX * v.y + cosX * xzZ;

        rotated[i] = {xzX, yzY, yzZ};

        const float invZ = 1.0f / (cameraDistance - yzZ);
        projected[i] = {
            centerX + xzX * focal * invZ,
            centerY + yzY * focal * invZ
        };
    }

    std::array<CubeFace, 6> faces = {{
        {4, 5, 6, 7, (Color){255, 210, 70, 255}, 0.0f},
        {0, 1, 2, 3, (Color){120, 170, 255, 255}, 0.0f},
        {0, 4, 7, 3, (Color){255, 110, 110, 255}, 0.0f},
        {1, 5, 6, 2, (Color){90, 235, 140, 255}, 0.0f},
        {3, 2, 6, 7, (Color){255, 150, 80, 255}, 0.0f},
        {0, 1, 5, 4, (Color){190, 130, 255, 255}, 0.0f},
    }};

    for (CubeFace& face : faces) {
        face.depth = (rotated[face.i0].z + rotated[face.i1].z + rotated[face.i2].z + rotated[face.i3].z) * 0.25f;
    }

    std::sort(faces.begin(), faces.end(), [](const CubeFace& a, const CubeFace& b) {
        return a.depth < b.depth;
    });

    for (const CubeFace& face : faces) {
        DrawTriangle(projected[face.i0], projected[face.i1], projected[face.i2], face.color);
        DrawTriangle(projected[face.i0], projected[face.i2], projected[face.i3], face.color);
        DrawLineV(projected[face.i0], projected[face.i1], BLACK);
        DrawLineV(projected[face.i1], projected[face.i2], BLACK);
        DrawLineV(projected[face.i2], projected[face.i3], BLACK);
        DrawLineV(projected[face.i3], projected[face.i0], BLACK);
    }
}
#endif

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

    // Platform identity for JS Platform.OS (mirrors RN). JS reads
    // globalThis.__rayactPlatform.os in detectPlatform() before userAgent.
    {
        JSValue platform = JS_NewObject(ctx);
        JS_SetPropertyStr(ctx, platform, "os",
                          JS_NewString(ctx, PlatformBridge::getPlatformName()));
        JS_SetPropertyStr(ctx, platform, "version",
                          JS_NewString(ctx, PlatformBridge::getPlatformVersion().c_str()));
        JS_SetPropertyStr(ctx, global, "__rayactPlatform", platform);
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
#ifndef RAYACT_NO_NET
    registerNetBindings(ctx);
#endif

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
    JS_SetPropertyStr(ctx, global, "createTextInput",
                      JS_NewCFunction(ctx, JS_createTextInput, "createTextInput", 2));
    JS_SetPropertyStr(ctx, global, "createScrollView",
                      JS_NewCFunction(ctx, JS_createScrollView, "createScrollView", 1));
    JS_SetPropertyStr(ctx, global, "createModal",
                      JS_NewCFunction(ctx, JS_createModal, "createModal", 1));
    JS_SetPropertyStr(ctx, global, "createSafeArea",
                      JS_NewCFunction(ctx, JS_createSafeArea, "createSafeArea", 1));
    JS_SetPropertyStr(ctx, global, "createStatusBar",
                      JS_NewCFunction(ctx, JS_createStatusBar, "createStatusBar", 1));
    JS_SetPropertyStr(ctx, global, "createActivityIndicator",
                      JS_NewCFunction(ctx, JS_createActivityIndicator, "createActivityIndicator", 1));
    JS_SetPropertyStr(ctx, global, "createAvoidKeyboard",
                      JS_NewCFunction(ctx, JS_createAvoidKeyboard, "createAvoidKeyboard", 1));
    JS_SetPropertyStr(ctx, global, "createMaterialComponent",
                      JS_NewCFunction(ctx, JS_createMaterialComponent, "createMaterialComponent", 2));
    JS_SetPropertyStr(ctx, global, "setMaterialComponentProps",
                      JS_NewCFunction(ctx, JS_setMaterialComponentProps, "setMaterialComponentProps", 2));
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
    JS_SetPropertyStr(ctx, global, "setOnChangeText",
                      JS_NewCFunction(ctx, JS_setOnChangeText, "setOnChangeText", 2));
    JS_SetPropertyStr(ctx, global, "setOnChangeValue",
                      JS_NewCFunction(ctx, JS_setOnChangeValue, "setOnChangeValue", 2));
    JS_SetPropertyStr(ctx, global, "setOnScroll",
                      JS_NewCFunction(ctx, JS_setOnScroll, "setOnScroll", 2));
    JS_SetPropertyStr(ctx, global, "setOnRequestClose",
                      JS_NewCFunction(ctx, JS_setOnRequestClose, "setOnRequestClose", 2));
    JS_SetPropertyStr(ctx, global, "setStyle",
                      JS_NewCFunction(ctx, JS_setStyle,     "setStyle",     2));
    JS_SetPropertyStr(ctx, global, "setText",
                      JS_NewCFunction(ctx, JS_setText,      "setText",      2));
    JS_SetPropertyStr(ctx, global, "setValue",
                      JS_NewCFunction(ctx, JS_setValue,     "setValue",     2));
    JS_SetPropertyStr(ctx, global, "disposeNode",
                      JS_NewCFunction(ctx, JS_disposeNode,  "disposeNode",  1));
    JS_SetPropertyStr(ctx, global, "createImage",
                      JS_NewCFunction(ctx, JS_createImage,  "createImage",  2));
    JS_SetPropertyStr(ctx, global, "createIcon",
                      JS_NewCFunction(ctx, JS_createIcon,   "createIcon",   4));
    JS_SetPropertyStr(ctx, global, "registerFont",
                      JS_NewCFunction(ctx, JS_registerFont, "registerFont", 2));
    JS_SetPropertyStr(ctx, global, "resolveAssetUrl",
                      JS_NewCFunction(ctx, JS_resolveAssetUrl, "resolveAssetUrl", 1));
    JS_SetPropertyStr(ctx, global, "resolveAssetPath",
                      JS_NewCFunction(ctx, JS_resolveAssetPath, "resolveAssetPath", 1));
    JS_SetPropertyStr(ctx, global, "readAssetBytes",
                      JS_NewCFunction(ctx, JS_readAssetBytes, "readAssetBytes", 1));

    // CSS import bridge
    JS_SetPropertyStr(ctx, global, "importCSS",
                      JS_NewCFunction(ctx, JS_importCSS,    "importCSS",    1));

    registerThemeBindings(ctx);

    JS_FreeValue(ctx, global);

#ifndef RAYACT_NO_WORKERS
    // Worker system (spawnWorker, postToWorker, terminateWorker, drawWorkerCanvas)
    registerWorkerBindings(ctx);
#endif
#ifndef RAYACT_NO_NET
    // Network: fetch, EventSource, WebSocket
    registerNetBindings(ctx);
#endif
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

    raym3::Theme::Initialize();

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
            printf("Material Icons loaded from source (%ld bytes)\n", len);
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
#ifdef RAYACT_NO_TS
        // Android ships pre-stripped/bundled JS; the TS validator/stripper
        // (tree-sitter) is not linked. Evaluate as-is.
        (void)isTypeScript;
#else
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
#endif
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

#ifndef RAYACT_NO_NET
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
#endif // RAYACT_NO_NET

static std::string jsObjectString(JSContext* ctx, JSValue obj, const char* key) {
    JSValue value = JS_GetPropertyStr(ctx, obj, key);
    std::string result;
    if (!JS_IsUndefined(value) && !JS_IsNull(value)) {
        const char* str = JS_ToCString(ctx, value);
        if (str) {
            result = str;
            JS_FreeCString(ctx, str);
        }
    }
    JS_FreeValue(ctx, value);
    return result;
}

static std::string assetUrlFromObject(JSContext* ctx, JSValue asset) {
    std::string id = jsObjectString(ctx, asset, "id");
    std::string name = jsObjectString(ctx, asset, "name");
    std::string outputName = jsObjectString(ctx, asset, "outputName");
    if (!g_devServerUrl.empty() && !id.empty()) {
        return g_devServerUrl + "/rayact/assets/" + id + "/" + name;
    }
    if (!outputName.empty()) {
        std::filesystem::path outputPath(outputName);
        if (!g_releaseAssetBaseDir.empty() && outputPath.is_relative()) {
            return (g_releaseAssetBaseDir / outputPath).string();
        }
        return outputPath.string();
    }
    return name;
}

static JSValue JS_resolveAssetUrl(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsObject(argv[0])) return JS_ThrowTypeError(ctx, "resolveAssetUrl: expected asset object");
    return JS_NewString(ctx, assetUrlFromObject(ctx, argv[0]).c_str());
}

static JSValue JS_resolveAssetPath(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsObject(argv[0])) return JS_ThrowTypeError(ctx, "resolveAssetPath: expected asset object");
    std::string url = assetUrlFromObject(ctx, argv[0]);
    if (url.rfind("http://", 0) != 0 && url.rfind("https://", 0) != 0) {
        return JS_NewString(ctx, url.c_str());
    }

    std::string id = jsObjectString(ctx, argv[0], "id");
    std::string name = jsObjectString(ctx, argv[0], "name");
    std::filesystem::path cacheDir = std::filesystem::temp_directory_path() / "rayact-assets";
    std::error_code ec;
    std::filesystem::create_directories(cacheDir, ec);
    std::filesystem::path outPath = cacheDir / (id.empty() ? name : (id + "-" + name));
    if (!std::filesystem::exists(outPath)) {
#ifdef RAYACT_NO_NET
        return JS_ThrowTypeError(ctx, "resolveAssetPath: remote asset fetch needs the net subsystem (not built here)");
#else
        std::string body;
        std::string error;
        if (!httpGet(url, body, error)) {
            return JS_ThrowTypeError(ctx, "resolveAssetPath: failed to fetch asset: %s", error.c_str());
        }
        FILE* file = fopen(outPath.string().c_str(), "wb");
        if (!file) return JS_ThrowTypeError(ctx, "resolveAssetPath: failed to open cache file");
        fwrite(body.data(), 1, body.size(), file);
        fclose(file);
#endif
    }
    return JS_NewString(ctx, outPath.string().c_str());
}

static JSValue JS_readAssetBytes(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsObject(argv[0])) return JS_ThrowTypeError(ctx, "readAssetBytes: expected asset object");
    JSValue pathValue = JS_resolveAssetPath(ctx, JS_UNDEFINED, argc, argv);
    if (JS_IsException(pathValue)) return pathValue;
    const char* pathStr = JS_ToCString(ctx, pathValue);
    JS_FreeValue(ctx, pathValue);
    if (!pathStr) return JS_ThrowTypeError(ctx, "readAssetBytes: invalid asset path");
    FILE* file = fopen(pathStr, "rb");
    JS_FreeCString(ctx, pathStr);
    if (!file) return JS_ThrowTypeError(ctx, "readAssetBytes: failed to open asset");
    fseek(file, 0, SEEK_END);
    long len = ftell(file);
    fseek(file, 0, SEEK_SET);
    std::vector<uint8_t> bytes((size_t)len);
    if (len > 0) fread(bytes.data(), 1, (size_t)len, file);
    fclose(file);
    return JS_NewArrayBufferCopy(ctx, bytes.data(), bytes.size());
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
#ifdef RAYACT_NO_NET
    (void)ctx; (void)devServer;
    fprintf(stderr, "Rayact: dev-server load needs the net subsystem (not built here)\n");
    return false;
#else
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
#endif // RAYACT_NO_NET
}

static void pollDevServer(JSContext* ctx) {
#ifdef RAYACT_NO_NET
    (void)ctx;
    return;
#else
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
#endif // RAYACT_NO_NET
}

static std::string getArgValue(int argc, char** argv, const std::string& name) {
    for (int i = 1; i + 1 < argc; i++) {
        if (argv[i] && name == argv[i]) {
            return argv[i + 1] ? argv[i + 1] : "";
        }
    }
    return "";
}

// ---------------------------------------------------------------------------
// Engine API (native/core/engine.hpp). Defined here so the wrappers can see the
// file-static helpers + globals above. Both the desktop main() and the Android
// JNI host drive the engine through these.
// ---------------------------------------------------------------------------
namespace rayact {

bool engineCreate() {
    if (g_rt && g_ctx) return true;   // already created (process-singleton)
    g_rt = initRuntime();
    if (!g_rt) return false;
    g_ctx = initContext(g_rt);
    if (!g_ctx) { JS_FreeRuntime(g_rt); g_rt = nullptr; return false; }
    registerNativeFunctions(g_ctx);
    return true;
}

JSContext* engineContext() { return g_ctx; }

bool engineLoadDevServer(const std::string& devServerUrl) {
    return loadDevServerBundle(g_ctx, devServerUrl);
}

bool engineLoadFile(const std::string& path) {
    std::filesystem::path scriptPath(path);
    g_releaseAssetBaseDir = scriptPath.has_parent_path()
        ? scriptPath.parent_path()
        : std::filesystem::current_path();
    return loadJavaScriptFile(g_ctx, path.c_str());
}

bool engineLoadSource(const std::string& source, const std::string& name) {
    injectMaterialIcons(g_ctx);
    JSValue r = JS_Eval(g_ctx, source.c_str(), source.size(), name.c_str(), JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(r)) {
        JSValue e = JS_GetException(g_ctx);
        const char* s = JS_ToCString(g_ctx, e);
        fprintf(stderr, "JavaScript error in '%s': %s\n", name.c_str(), s ? s : "(unknown)");
        if (s) JS_FreeCString(g_ctx, s);
        JS_FreeValue(g_ctx, e);
        JS_FreeValue(g_ctx, r);
        return false;
    }
    JS_FreeValue(g_ctx, r);
    return true;
}

void engineFinishLoad() {
    // Needs a live GL context (window/surface ready) — rasterize icon atlas, GC.
    buildIconSpriteSheet();
    JS_RunGC(g_rt);
    raym3::Initialize();
    initSystemAppearance(g_ctx);
}

void enginePumpJS() {
    JSContext* ctx = g_ctx;
    // js_std_loop_once: drains pending jobs + fires expired QJS os.timers
    // without blocking. js_std_loop (infinite poll) must not be used here.
    js_std_loop_once(ctx);
    tickJSTimers(ctx);
    tickAnimationFrames(ctx);
    tickSystemAppearance(ctx);
    pollDevServer(ctx);
#ifndef RAYACT_NO_NET
    drainNetEvents(ctx);      // deliver fetch responses / SSE / WS frames
#endif
#ifndef RAYACT_NO_WORKERS
    drainWorkerOutbox(ctx);   // deliver worker messages to JS (non-blocking)
#endif

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
}

void engineRenderFrame(int width, int height) {
    BeginDrawing();
#if defined(RAYACT_ANDROID) && defined(RAYACT_ANDROID_DIAGNOSTIC)
    // Native smoke-test screen (set -DRAYACT_ANDROID_DIAGNOSTIC to use). Bypasses raym3.
    ClearBackground((Color){20, 20, 30, 255});
    drawAndroidDiagnosticCube(width, height);
    DrawText("ROTATING CUBE SMOKE TEST", 80, 120, 52, (Color){235, 235, 245, 255});
    EndDrawing();
    return;
#endif
    ClearBackground(BLACK);
    raym3::BeginFrame();

    if (g_root) {
        // raym3 v2 retained-mode path — render the current surface's tree.
        Rectangle bounds = {0, 0, (float)width, (float)height};
        raym3::v2::UpdateLayout(g_root, bounds);
        raym3::v2::Render(g_root, bounds);

        Vector2 mouse = GetMousePosition();
        float wheelY = GetMouseWheelMove();
        bool pressed  = IsMouseButtonPressed(MOUSE_LEFT_BUTTON);
        bool released = IsMouseButtonReleased(MOUSE_LEFT_BUTTON);
        bool down     = IsMouseButtonDown(MOUSE_LEFT_BUTTON);
        bool scrollDragConsumed = processRaym3ScrollInput(mouse, wheelY, pressed, down, released);

#ifndef RAYACT_NO_WORKERS
        // Route hover/move/drag/down/up to any worker canvas node
        processWorkerInputEvents(mouse.x, mouse.y, pressed, released, down);
#endif

        // Standard raym3 press dispatch (fires onPress on release)
        if (released && !scrollDragConsumed) {
            auto hit = raym3::v2::HitTest(g_root, mouse);
            if (hit && hit->onPress) hit->onPress();
        }
    } else {
        // Fallback: immediate-mode shapes (backward compat)
        for (const Shape& shape : g_shapes) {
            Color c = {
                (unsigned char)((shape.color >> 24) & 0xFF),
                (unsigned char)((shape.color >> 16) & 0xFF),
                (unsigned char)((shape.color >>  8) & 0xFF),
                (unsigned char)( shape.color        & 0xFF)
            };
            switch (shape.type) {
                case 0: DrawRectangle(shape.x, shape.y, shape.width, shape.height, c); break;
                case 1: DrawCircle(shape.x, shape.y, shape.radius, c); break;
                case 2: DrawLine(shape.x1, shape.y1, shape.x2, shape.y2, c); break;
            }
        }
    }

    raym3::EndFrame();
    EndDrawing();
}

void engineDestroy() {
    if (!g_ctx) return;
    g_shapes.clear();
#ifndef RAYACT_NO_WORKERS
    shutdownWorkers();          // join all worker threads, unload canvas textures
#endif
#ifndef RAYACT_NO_NET
    shutdownNetCtx(g_ctx);      // stop fetch/SSE/WS threads, free JS values
#endif
    cleanupRaym3Bridge(g_ctx);
    cleanupCSSBridge(g_ctx);
    cleanupJSStdlib(g_ctx);
    JS_FreeContext(g_ctx);
    js_std_free_handlers(g_rt);
    JS_FreeRuntime(g_rt);
    g_ctx = nullptr;
    g_rt = nullptr;
}

} // namespace rayact

#ifndef RAYACT_ANDROID
// Desktop render loop: thin driver over the engine API.
void mainLoop(JSContext* ctx) {
    (void)ctx;
    printf("Starting main loop\n");

    if (!IsWindowReady()) {
        fprintf(stderr, "Window not ready — cannot start render loop\n");
        return;
    }

    // raym3::Initialize() + initSystemAppearance() were already done by
    // rayact::engineFinishLoad() before this loop starts.
    while (!WindowShouldClose()) {
        rayact::enginePumpJS();
        rayact::engineRenderFrame(GetRenderWidth(), GetRenderHeight());

        // Desktop-only scripted screenshot harness (RAYACT_SHOT).
        if (std::getenv("RAYACT_SHOT")) {
            static int sf = 0; ++sf;
            if (sf == 5) SetWindowSize(1120, 900);
            if (sf >= 60 && g_root) {
                std::function<void(const raym3::v2::NodePtr&)> sc = [&](const raym3::v2::NodePtr& n){
                    if (!n) return;
                    if (n->scrollContentHeight > n->layout.height) n->scrollOffsetY = n->scrollContentHeight;
                    for (auto& c : n->children) sc(c);
                };
                sc(g_root);
            }
            if (sf == 120) TakeScreenshot("shot.png");
            if (sf == 122) break;
        }
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

    // Create the process-level engine (runtime + context + native fns).
    std::cout << "\nInitializing Rayact engine..." << std::endl;
    if (!rayact::engineCreate()) {
        std::cerr << "Failed to create Rayact engine" << std::endl;
        return 1;
    }
    g_ctx = rayact::engineContext();
    std::cout << "✓ Engine initialized successfully" << std::endl;

    // --compile <src> [out.jsc]  — compile JS/TS to bytecode and exit
    if (argc >= 3 && std::string(argv[1]) == "--compile") {
        const char* src = argv[2];
        const char* out = argc >= 4 ? argv[3] : nullptr;
        std::string result = compileJSToBytecode(g_ctx, src, out);
        rayact::engineDestroy();
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
        success = rayact::engineLoadDevServer(devServer);
    } else if (argc > 1 && argv[1][0] != '-') {
        jsFile = argv[1];
        std::cout << "\nAttempting to load: " << jsFile << std::endl;
        success = rayact::engineLoadFile(jsFile);
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
        rayact::engineDestroy();
        return 1;
    }

    // Window is now ready (JS called initRaylib): rasterize icon atlas, GC,
    // and bring up raym3 + system appearance.
    rayact::engineFinishLoad();

    // Start main loop
    std::cout << "\nStarting main render loop..." << std::endl;
    mainLoop(g_ctx);

    // Cleanup
    std::cout << "\nCleaning up..." << std::endl;
    rayact::engineDestroy();

    std::cout << "========================================" << std::endl;
    std::cout << "  Rayact - Finished successfully" << std::endl;
    std::cout << "========================================" << std::endl;
    return 0;
}
#endif // RAYACT_ANDROID (desktop entry point: mainLoop + main)
