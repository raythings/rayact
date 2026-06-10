#pragma once

// Shared private state between the engine's JS half (engine_js.cpp), render
// half (engine_render.cpp) and the desktop entry point (main.cpp). This is the
// ONLY contact surface between the two halves besides the public engine API
// (native/core/engine.hpp); in the threaded engine it becomes the commit
// queue boundary, so keep it minimal.

extern "C" {
#include "quickjs.h"
}

#include <raylib.h>
#include <mutex>
#include <string>
#include <vector>

#ifdef RAYACT_ANDROID
#include <android/log.h>
#define RAYACT_LOG_E(...) __android_log_print(ANDROID_LOG_ERROR, "RayactEngine", __VA_ARGS__)
#else
#include <cstdio>
#define RAYACT_LOG_E(...) do { fprintf(stderr, __VA_ARGS__); fprintf(stderr, "\n"); } while (0)
#endif

// Legacy immediate-mode shape (renderRect/renderCircle/renderLine fallback
// path used when no raym3 tree is mounted). Written by JS natives, read by
// the render frame.
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

// Android SurfaceView touches arrive on the UI thread; the render thread
// drains this queue each frame (see engineRenderScreenInSurface).
struct QueuedTouch {
    bool pressed = false;
    bool released = false;
    bool down = false;
    Vector2 position = {0.0f, 0.0f};
};

// The engine's JS context (owned by engine_js.cpp; read by main.cpp).
extern JSContext* g_ctx;

extern std::vector<Shape> g_shapes;

extern std::mutex g_touchMutex;
extern QueuedTouch g_queuedTouch;
extern bool g_touchPressFired; // press consumed for the current gesture

// Window DPI scale (px per dp). Defined in engine_render.cpp.
float getRenderScaleDpi();

// Compile a JS/TS file to QuickJS bytecode (the --compile CLI mode).
// Returns the output path, or empty on failure. Defined in engine_js.cpp.
std::string compileJSToBytecode(JSContext* ctx, const char* srcFile, const char* outFile);

namespace rayact {
// Input debug harness (RAYACT_INPUT_DEBUG): capture pending down/up/after
// screenshots. Called by the desktop main loop after EndDrawing.
void inputDebugTakeScreenshots();
}
