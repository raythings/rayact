// Rayact Android JNI bridge.
//
// Connects the process-level Rayact engine (native/core/engine.hpp) to an
// Android SurfaceView via the custom raylib PLATFORM_ANDROID_SURFACE backend
// (raylib/src/platforms/rcore_android_surface.{c,h}). The Kotlin host owns
// threading: it runs a render thread, drives a Choreographer frame callback,
// and calls nativeRenderFrame() once per vsync. The engine itself is NOT tied
// to any Activity — it is created once per process and survives Activity
// recreation, so it can coordinate multiple surfaces/screens (react-navigation
// native-stack model).

#include <jni.h>
#include <android/native_window.h>
#include <android/native_window_jni.h>
#include <android/log.h>
#include <string>

#include "../core/engine.hpp"

extern "C" {
#include "rcore_android_surface.h"   // RcoreAndroidSurface_* host hooks (from raylib)
}

// raylib functions we call directly to bring up / drive a surface.
extern "C" {
void  InitWindow(int width, int height, const char *title);
void  CloseWindow(void);
int   GetRenderWidth(void);
int   GetRenderHeight(void);
bool  IsWindowReady(void);
void  SetTargetFPS(int fps);
}

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  "RayactJNI", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "RayactJNI", __VA_ARGS__)

namespace {
bool g_engineReady = false;   // engineCreate() done
bool g_windowReady = false;   // raylib InitWindow done on the current surface
ANativeWindow *g_window = nullptr;

std::string jstr(JNIEnv *env, jstring s) {
    if (!s) return {};
    const char *c = env->GetStringUTFChars(s, nullptr);
    std::string out(c ? c : "");
    if (c) env->ReleaseStringUTFChars(s, c);
    return out;
}
} // namespace

extern "C" {

// Create the engine once per process (idempotent). dataPath = Activity internalDataPath.
JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngine_nativeCreate(JNIEnv *env, jclass, jstring dataPath) {
    if (!g_engineReady) {
        if (!rayact::engineCreate()) { LOGE("engineCreate failed"); return JNI_FALSE; }
        g_engineReady = true;
        LOGI("Rayact engine created");
    }
    std::string dp = jstr(env, dataPath);
    if (!dp.empty()) RcoreAndroidSurface_SetDataPath(strdup(dp.c_str()));
    return JNI_TRUE;
}

// Load the application JS. mode 0 = source string, mode 1 = dev-server URL.
JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngine_nativeLoadScript(JNIEnv *env, jclass, jint mode, jstring arg) {
    if (!g_engineReady) return JNI_FALSE;
    std::string a = jstr(env, arg);
    bool ok = (mode == 1) ? rayact::engineLoadDevServer(a)
                          : rayact::engineLoadSource(a, "app.js");
    if (!ok) LOGE("nativeLoadScript(mode=%d) failed", mode);
    return ok ? JNI_TRUE : JNI_FALSE;
}

// Surface available: bind raylib's GL context to this window. Called on the
// render thread after Surface is created. density = displayDensity (dpi/160).
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeSurfaceCreated(JNIEnv *env, jclass, jobject surface, jfloat density) {
    if (g_window) { ANativeWindow_release(g_window); g_window = nullptr; }
    g_window = ANativeWindow_fromSurface(env, surface);
    RcoreAndroidSurface_SetWindow(g_window);
    RcoreAndroidSurface_SetDensity(density);

    if (!g_windowReady) {
        // Window == screen: InitWindow(0,0) -> the platform reads the surface size.
        SetTargetFPS(0);                 // host drives cadence via Choreographer
        InitWindow(0, 0, "Rayact");
        if (!IsWindowReady()) { LOGE("InitWindow failed (no GL surface)"); return; }
        rayact::engineFinishLoad();      // icon atlas + GC + raym3 init (needs GL)
        g_windowReady = true;
        LOGI("Surface created: %dx%d", GetRenderWidth(), GetRenderHeight());
    }
}

// One frame: pump JS + render the current surface. Called per Choreographer vsync.
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeRenderFrame(JNIEnv *, jclass) {
    if (!g_windowReady) return;
    rayact::enginePumpJS();
    rayact::engineRenderFrame(GetRenderWidth(), GetRenderHeight());
}

// Touch event from the UI thread. action: 0=down 1=up 2=move (RCORE_AS_TOUCH_*).
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeTouch(JNIEnv *, jclass, jint action, jint id, jfloat x, jfloat y) {
    RcoreAndroidSurface_PushTouch(action, id, x, y);
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeSurfaceDestroyed(JNIEnv *, jclass) {
    // Keep the engine + JS state alive (process-level). Just drop the window;
    // raylib's ClosePlatform releases it. A full multi-surface impl will
    // detach the EGLSurface here and rebind on the next surfaceCreated.
    if (g_window) { ANativeWindow_release(g_window); g_window = nullptr; }
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeDestroy(JNIEnv *, jclass) {
    if (g_windowReady) { CloseWindow(); g_windowReady = false; }
    if (g_engineReady) { rayact::engineDestroy(); g_engineReady = false; }
}

} // extern "C"
