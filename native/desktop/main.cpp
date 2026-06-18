// Rayact desktop entry point: thin driver over the engine API
// (native/core/engine.hpp). The engine itself lives in engine_js.cpp (QuickJS
// half) and engine_render.cpp (raym3/raylib half).
#include "raylib_bridge.hpp"
#include "platform.hpp"
#include "engine_internal.hpp"
#include "engine_thread.hpp"
#include "raym3_bridge.hpp"
#include "../core/engine.hpp"

#include <raym3/raym3.h>
#include <raym3/v2/Density.h>
#include <raym3/v2/View.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <chrono>
#include <functional>
#include <iostream>
#include <string>
#include <thread>
#ifndef _WIN32
#include <climits>
#include <cstdlib>
#endif

static std::string getArgValue(int argc, char** argv, const std::string& name) {
    for (int i = 1; i + 1 < argc; i++) {
        if (argv[i] && name == argv[i]) {
            return argv[i + 1] ? argv[i + 1] : "";
        }
    }
    return "";
}

#ifndef RAYACT_ANDROID
// Publish the new window size (layout dp) to JS and fire the change callback.
// Mirrors the Android pump in jni_bridge.cpp (__rayactWindowDimensions /
// __rayactOnDimensionsChange) so apps see one API on both platforms.
static void publishWindowDimensions(JSContext* ctx, int widthPx, int heightPx) {
    if (!ctx) return;
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
            const char* s = JS_ToCString(ctx, exc);
            fprintf(stderr, "__rayactOnDimensionsChange threw: %s\n", s ? s : "?");
            if (s) JS_FreeCString(ctx, s);
            JS_FreeValue(ctx, exc);
        }
        JS_FreeValue(ctx, r);
    }
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, global);
}

// During interactive resize (macOS modal drag loop) the main loop is blocked;
// raylib invokes this hook from the framebuffer-size callback so the UI
// reflows live instead of stretching the last frame. PollInputEvents is
// suppressed inside the hook (see rcore_desktop_glfw.c).
extern "C" void SetWindowLiveResizeHook(void (*hook)(int width, int height));
static JSContext* g_liveResizeCtx = nullptr;
static void liveResizeRender(int, int) {
    if (!rayact::engineThreadedModeEnabled())
        rayact::enginePumpJS();
    publishWindowDimensions(g_liveResizeCtx, GetRenderWidth(), GetRenderHeight());
    rayact::engineRenderFrame(GetRenderWidth(), GetRenderHeight());
}

// Desktop render loop: thin driver over the engine API.
void mainLoop(JSContext* ctx) {
    printf("Starting main loop\n");
    g_liveResizeCtx = ctx;
    SetWindowLiveResizeHook(liveResizeRender);

    if (!IsWindowReady()) {
        // Module-HMR dev bootstrap imports the project entry asynchronously; the
        // project's initRaylib() may run only after the JS job queue is pumped.
        for (int i = 0; i < 10000 && !IsWindowReady(); ++i) {
            if (!rayact::engineThreadedModeEnabled())
                rayact::enginePumpJS();
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
        if (!IsWindowReady()) {
            fprintf(stderr, "Window not ready — cannot start render loop\n");
            return;
        }
    }

    // raym3::Initialize() + initSystemAppearance() were already done by
    // rayact::engineFinishLoad() before this loop starts.
    while (!WindowShouldClose()) {
        if (!rayact::engineThreadedModeEnabled())
            rayact::enginePumpJS();
        if (IsWindowResized())
            publishWindowDimensions(ctx, GetRenderWidth(), GetRenderHeight());
        rayact::engineRenderFrame(GetRenderWidth(), GetRenderHeight());

        // Input debug harness: capture down/up/after-500ms screenshots.
        rayact::inputDebugTakeScreenshots();

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

        // Scripted input harness (RAYACT_SCRIPT="frame:cmd[:args];...").
        // Commands: size:w,h | scrollbottom | tap:x,y | down:x,y | up:x,y |
        // shot:name | quit.
        // Pair with RAYACT_SYNTH_INPUT=1 so taps route through the queued-touch
        // source instead of the real mouse.
        if (const char* script = std::getenv("RAYACT_SCRIPT")) {
            static int frame = 0; ++frame;
            static bool tapDownPending = false;
            static int tapUpFrame = -1;
            static float tapX = 0, tapY = 0;
            if (tapUpFrame == frame) rayact::engineQueueTouch(1, 0, tapX, tapY);
            std::string s(script);
            size_t pos = 0;
            bool quit = false;
            while (pos < s.size()) {
                size_t end = s.find(';', pos);
                std::string cmd = s.substr(pos, end == std::string::npos ? std::string::npos : end - pos);
                pos = end == std::string::npos ? s.size() : end + 1;
                int at = 0; char op[32] = {0}; char arg[128] = {0};
                if (sscanf(cmd.c_str(), "%d:%31[a-z]:%127s", &at, op, arg) < 2) continue;
                if (at != frame) continue;
                if (strcmp(op, "size") == 0) {
                    int w = 0, h = 0;
                    if (sscanf(arg, "%d,%d", &w, &h) == 2) SetWindowSize(w, h);
                } else if (strcmp(op, "scrollbottom") == 0 && g_root) {
                    std::function<void(const raym3::v2::NodePtr&)> sc = [&](const raym3::v2::NodePtr& n){
                        if (!n) return;
                        if (n->scrollContentHeight > n->layout.height) n->scrollOffsetY = n->scrollContentHeight;
                        for (auto& c : n->children) sc(c);
                    };
                    sc(g_root);
                } else if (strcmp(op, "tap") == 0) {
                    if (sscanf(arg, "%f,%f", &tapX, &tapY) == 2) {
                        rayact::engineQueueTouch(0, 0, tapX, tapY);
                        tapUpFrame = frame + 6;
                        (void)tapDownPending;
                    }
                } else if (strcmp(op, "down") == 0) {
                    if (sscanf(arg, "%f,%f", &tapX, &tapY) == 2) {
                        rayact::engineQueueTouch(0, 0, tapX, tapY);
                        tapUpFrame = -1;
                    }
                } else if (strcmp(op, "up") == 0) {
                    if (sscanf(arg, "%f,%f", &tapX, &tapY) == 2) {
                        rayact::engineQueueTouch(1, 0, tapX, tapY);
                        tapUpFrame = -1;
                    }
                } else if (strcmp(op, "shot") == 0) {
                    TakeScreenshot(arg);
                } else if (strcmp(op, "quit") == 0) {
                    quit = true;
                }
            }
            if (quit) break;
        }
    }

    g_shapes.clear();
    raym3::Shutdown();
    printf("Main loop finished\n");
}

int main(int argc, char** argv) {
    setvbuf(stdout, nullptr, _IOLBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);

#ifndef _WIN32
    // A packaged desktop app ships bundled native plugins in <exeDir>/modules.
    // Point the plugin loader there (without clobbering a user-set value) before
    // engineCreate() boots the module bus and scans RAYACT_MODULE_PATH.
    if (!std::getenv("RAYACT_MODULE_PATH") && argc > 0 && argv[0]) {
        char resolved[PATH_MAX];
        if (realpath(argv[0], resolved)) {
            std::string p(resolved);
            auto slash = p.rfind('/');
            std::string dir = slash == std::string::npos ? "." : p.substr(0, slash);
            std::string mod = dir + "/modules";
            setenv("RAYACT_MODULE_PATH", mod.c_str(), 0);
        }
    }
#endif

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
