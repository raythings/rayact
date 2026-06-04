// Rayact Android JNI bridge.
//
// Connects the process-level Rayact engine (native/core/engine.hpp) to N
// Android SurfaceViews via the custom raylib PLATFORM_ANDROID_SURFACE backend
// (raylib/src/platforms/rcore_android_surface.{c,h}). The Kotlin host owns
// threading: each RayactSurfaceView runs a render thread, drives a
// Choreographer frame callback, and calls nativeRenderFrame() once per vsync.
// The engine itself is NOT tied to any Activity — it is created once per
// process and survives Activity recreation, so it can coordinate multiple
// surfaces/screens (react-navigation native-stack model).
//
// Multi-surface model:
//   - The first nativeCreateSurface() brings up the EGL context (legacy
//     SetWindow + InitWindow path). surfaceId 0 is the "boot" surface.
//   - Subsequent nativeCreateSurface() calls allocate additional EGL surfaces
//     via RcoreAndroidSurface_CreateWindow() and corresponding engine screens
//     via engineCreateScreen(). Each surface owns ONE EGL window + ONE engine
//     screen; surfaceId == screenId (the host can treat them as the same key).
//   - The render loop iterates the engine's screen stack (z-order). For each
//     visible screen, it binds the associated EGL surface, runs the per-screen
//     render body, then swaps. Input dispatch is on the focused (top) screen.
//   - Push/pop: nativePushSurface() / nativePopSurface() drive enginePushScreen
//     / enginePopScreen. The Kotlin ViewGroup adds/removes child SurfaceViews
//     in lockstep.

#include <jni.h>
#include <android/native_window.h>
#include <android/native_window_jni.h>
#include <android/log.h>
#include <atomic>
#include <map>
#include <mutex>
#include <string>
#include <vector>

#include "../core/engine.hpp"
#include "../core/config_loader.hpp"
#include "../desktop/raym3_bridge.hpp"

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

// Per-surface state. surfaceId is also the engine screenId.
struct Surface {
    ANativeWindow* window = nullptr;   // owned; released in destroy
    int windowId = 0;                  // raylib EGL surface id (== surfaceId after CreateWindow)
    int screenId = 0;                  // engine screen id
    float density = 1.0f;
    bool ownsContext = false;          // true only for the boot surface (the one that called InitWindow)
};

bool g_engineReady = false;
bool g_scriptExecuted = false;
int g_pendingScriptMode = -1;          // 0 = source string, 1 = dev-server URL
std::string g_pendingScript;
std::string g_dataPath;                // Activity internalDataPath; used by config loader
std::map<int, Surface> g_surfaces;     // surfaceId -> Surface

// QuickJS + raym3 are single-threaded; each surface has its OWN render thread,
// so without serialization two threads pump JS into the same context at once →
// heap corruption (Scudo "invalid chunk state" abort) the moment a second
// surface appears (i.e. on navigation). All engine work that runs outside the
// request-new-surface parked window takes this lock.
std::mutex g_engineMutex;

// Stored at JNI_OnLoad; the C++ render thread uses it to attach/detach when
// it needs to call back into Kotlin (e.g. JS __rayactHostRequestNewSurface).
JavaVM* g_jvm = nullptr;

// Hardware-back marshaling. Main thread sets g_pendingBackPress = true
// (the Kotlin OnBackPressedCallback forwards here); the render thread
// drains it in enginePumpJS by calling globalThis.__rayactDrainBackPress.
// Atomic so the read on the render thread sees the latest write.
std::atomic<bool> g_pendingBackPress{false};
// Set by the render thread when the drain returns false (no JS listener
// handled the back press). The render thread then schedules a Kotlin
// finishActivityFromHost reverse-call; we don't reenter the JVM directly
// from the render thread.
std::atomic<bool> g_finishActivityRequested{false};
// Set by JS calling __rayactHostExitApp. Same pattern as g_pendingBackPress.
std::atomic<bool> g_exitAppRequested{false};

std::string jstr(JNIEnv* env, jstring s) {
    if (!s) return {};
    const char* c = env->GetStringUTFChars(s, nullptr);
    std::string out(c ? c : "");
    if (c) env->ReleaseStringUTFChars(s, c);
    return out;
}

bool executePendingScript() {
    if (g_scriptExecuted || g_pendingScriptMode < 0) return g_scriptExecuted;
    rayact::enginePrepareJSThread();
    bool ok = (g_pendingScriptMode == 1)
        ? rayact::engineLoadDevServer(g_pendingScript)
        : rayact::engineLoadSource(g_pendingScript, "app.js");
    if (!ok) {
        LOGE("executePendingScript(mode=%d) failed", g_pendingScriptMode);
        return false;
    }
    g_scriptExecuted = true;
    LOGI("JS loaded on render thread: nodes=%zu root=%s",
        g_nodes.size(), g_root ? "yes" : "no");
    return true;
}

// Asks the host (Kotlin RayactEngine.requestNewSurfaceFromHost) to create a
// new EGL surface + engine screen, returning the new surfaceId. Called from
// the render thread when JS invokes __rayactHostRequestNewSurface. Blocks
// until the host finishes (the host does the UI work on the main thread).
static jint callIntoHost_RequestNewSurface() {
    if (!g_jvm) return 0;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    jint rs = g_jvm->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) return 0;
        needDetach = true;
    } else if (rs != JNI_OK) {
        return 0;
    }
    jint surfaceId = 0;
    // Top-level Kotlin functions in package com.rayact.engine are compiled
    // into class com.rayact.engine.RayactEngineKt with static methods.
    jclass cls = env->FindClass("com/rayact/engine/RayactEngineKt");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "requestNewSurfaceFromHost", "()I");
        if (m) surfaceId = env->CallStaticIntMethod(cls, m);
        else LOGE("RayactEngineKt.requestNewSurfaceFromHost not found");
        env->DeleteLocalRef(cls);
    } else {
        LOGE("com/rayact/engine/RayactEngineKt class not found");
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return surfaceId;
}

} // namespace

// ─── JS host API (called by JS_rayactHostRequestNewSurface / ReleaseSurface) ──
//
// These are extern "C" symbols exported from the shared library. The JS-side
// bridge functions (declared in raym3_bridge.cpp) call into these. The
// implementations call back into Kotlin via the JVM when the C++ engine
// needs the host to allocate/destroy a surface. On desktop these would
// be linked too but jni_bridge.cpp is only built for Android (via
// RAYACT_ANDROID in CMakeLists.txt) — so on desktop the symbols don't
// exist. To avoid a desktop link error, we declare weak stubs in
// raym3_bridge.cpp's header.
extern "C" int  rayactJniRequestNewSurface() { return callIntoHost_RequestNewSurface(); }
extern "C" void rayactJniReleaseSurface(int surfaceId) {
    // Surface release: tear down the engine screen (id == surfaceId in our model).
    // The host (Kotlin NavigationHost.pop) has already removed the view and
    // triggered nativeDestroySurface, but we also expose this so JS can drop the
    // surface without going through Kotlin (e.g. for hmr / cleanups).
    if (surfaceId <= 0) return;
    auto it = g_surfaces.find(surfaceId);
    if (it == g_surfaces.end()) return;
    Surface& s = it->second;
    if (engineGetFocusedScreenId() == surfaceId) enginePopScreen();
    RcoreAndroidSurface_DestroyWindow(s.windowId); // releases the ANativeWindow ref
    s.window = nullptr;
    engineDestroyScreen(surfaceId);
    g_surfaces.erase(it);
}
extern "C" int  rayactJniGetRootSurfaceId() {
    if (!g_jvm) return 0;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    jint rs = g_jvm->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) return 0;
        needDetach = true;
    } else if (rs != JNI_OK) {
        return 0;
    }
    jint rootId = 0;
    jclass cls = env->FindClass("com/rayact/engine/RayactEngineKt");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "rootSurfaceIdFromHost", "()I");
        if (m) rootId = env->CallStaticIntMethod(cls, m);
        else LOGE("RayactEngineKt.rootSurfaceIdFromHost not found");
        env->DeleteLocalRef(cls);
    } else {
        LOGE("com/rayact/engine/RayactEngineKt class not found");
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
    return rootId;
}
extern "C" void rayactJniReleaseTopSurface() {
    if (!g_jvm) return;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    jint rs = g_jvm->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) return;
        needDetach = true;
    } else if (rs != JNI_OK) {
        return;
    }
    jclass cls = env->FindClass("com/rayact/engine/RayactEngineKt");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "releaseTopSurfaceFromHost", "()V");
        if (m) env->CallStaticVoidMethod(cls, m);
        else LOGE("RayactEngineKt.releaseTopSurfaceFromHost not found");
        env->DeleteLocalRef(cls);
    } else {
        LOGE("com/rayact/engine/RayactEngineKt class not found");
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
}

// __rayactHostExitApp: JS asks the host to finish the Activity. We don't
// call back into Kotlin directly (would re-enter the JVM on the render
// thread). Instead we trip g_exitAppRequested; the render thread's next
// drain (in nativeRenderFrame) reads it, skips the listener chain, and
// posts a Kotlin finishActivityFromHost reverse-call.
extern "C" void rayactJniExitApp() {
    g_exitAppRequested.store(true, std::memory_order_release);
    g_pendingBackPress.store(true, std::memory_order_release);
}

// __rayactEnginePushScreen: idempotent z-order push from the JS
// navigator. Mutates g_screenStack directly under g_engineMutex (the JS
// pump holds the lock for the duration of the call).
extern "C" void rayactJniPushScreen(int surfaceId) {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    enginePushScreen(surfaceId);
}

extern "C" int rayactJniPopScreen() {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    int top = engineGetFocusedScreenId();
    if (!enginePopScreen()) return 0;
    return top;
}

extern "C" {

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* /*reserved*/) {
    g_jvm = vm;
    return JNI_VERSION_1_6;
}

// Create the engine once per process (idempotent). dataPath = Activity internalDataPath.
JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngine_nativeCreate(JNIEnv* env, jclass, jstring dataPath) {
    if (g_engineReady) {
        std::string dp = jstr(env, dataPath);
        if (!dp.empty()) {
            g_dataPath = dp;
            RcoreAndroidSurface_SetDataPath(strdup(dp.c_str()));
        }
        return JNI_TRUE;
    }
    if (!rayact::engineCreate()) { LOGE("engineCreate failed"); return JNI_FALSE; }
    g_engineReady = true;
    std::string dp = jstr(env, dataPath);
    if (!dp.empty()) {
        g_dataPath = dp;
        RcoreAndroidSurface_SetDataPath(strdup(dp.c_str()));
    }
    LOGI("Rayact engine created");
    return JNI_TRUE;
}

// Reverse-call entry point for the JS-side __rayactHostRequestNewSurface.
// Allocates a new EGL surface + engine screen via the host (NavigationHost)
// and returns the new surfaceId, or 0 on failure.
JNIEXPORT jint JNICALL
Java_com_rayact_engine_RayactEngine_nativeRequestNewSurface(JNIEnv*, jclass) {
    return callIntoHost_RequestNewSurface();
}

// Queue application JS for load on the render thread (QuickJS is not thread-safe).
JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngine_nativeLoadScript(JNIEnv* env, jclass, jint mode, jstring arg) {
    if (!g_engineReady) return JNI_FALSE;
    g_pendingScript = jstr(env, arg);
    g_pendingScriptMode = mode;
    return JNI_TRUE;
}

// Create a new EGL surface + engine screen. Returns the surfaceId (== screenId)
// on success, or 0 on failure. The first call (no surfaces yet) brings up the
// EGL context via the legacy InitWindow path. Subsequent calls allocate extra
// surfaces via RcoreAndroidSurface_CreateWindow.
JNIEXPORT jint JNICALL
Java_com_rayact_engine_RayactEngine_nativeCreateSurface(JNIEnv* env, jclass, jobject surface, jfloat density) {
    if (!g_engineReady) { LOGE("nativeCreateSurface: engine not ready"); return 0; }
    ANativeWindow* win = ANativeWindow_fromSurface(env, surface);
    if (!win) { LOGE("nativeCreateSurface: ANativeWindow_fromSurface returned null"); return 0; }

    int screenId = engineCreateScreen();
    if (screenId <= 0) {
        LOGE("nativeCreateSurface: engineCreateScreen failed");
        ANativeWindow_release(win);
        return 0;
    }

    int windowId = 0;
    bool ownsContext = false;
    if (g_surfaces.empty()) {
        // Boot surface: bring up the EGL context. SetWindow + SetDensity are
        // host hooks the raylib backend reads during InitWindow.
        //
        // Bind this screen as the engine's current screen BEFORE the app JS
        // runs, so a non-navigation app (which renders straight into g_root
        // and never calls setCurrentScreen) associates its tree with THIS
        // surface's screenId rather than the implicit legacy screen 0.
        // Without this the render loop iterates the screen stack (screenId 1+)
        // but the content sits on screen 0 → nothing renders (black).
        engineBindScreenRoot(screenId);
        RcoreAndroidSurface_SetWindow(win);
        RcoreAndroidSurface_SetDensity(density);
        if (!executePendingScript()) {
            LOGE("nativeCreateSurface: script load failed");
            ANativeWindow_release(win);
            return 0;
        }
        SetTargetFPS(0);
        InitWindow(0, 0, "Rayact");
        if (!IsWindowReady()) { LOGE("nativeCreateSurface: InitWindow failed"); ANativeWindow_release(win); return 0; }
        rayact::engineLoadConfig(g_dataPath.c_str());
        rayact::engineFinishLoad();
        windowId = RcoreAndroidSurface_GetCurrentId();
        if (windowId <= 0) windowId = 1; // raylib legacy path: first surface id is 1
        ownsContext = true;
    } else {
        RcoreAndroidSurface_SetDensity(density);
        windowId = RcoreAndroidSurface_CreateWindow(win);
        if (windowId <= 0) { LOGE("nativeCreateSurface: CreateWindow failed"); ANativeWindow_release(win); return 0; }
    }

    Surface s;
    s.window = win;
    s.windowId = windowId;
    s.screenId = screenId;
    s.density = density;
    s.ownsContext = ownsContext;
    g_surfaces[screenId] = s;
    LOGI("nativeCreateSurface: surfaceId=%d windowId=%d (total=%zu)",
         screenId, windowId, g_surfaces.size());
    return (jint)screenId;
}

// Destroy an EGL surface + engine screen. Idempotent.
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeDestroySurface(JNIEnv*, jclass, jint surfaceId) {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    auto it = g_surfaces.find(surfaceId);
    if (it == g_surfaces.end()) return;
    Surface& s = it->second;

    // If this surface is the top of the focus stack, pop it first so the
    // focused screen no longer references a destroyed tree.
    if (engineGetFocusedScreenId() == surfaceId) {
        enginePopScreen();
    }

    // RcoreAndroidSurface_DestroyWindow already releases the ANativeWindow ref
    // (the platform borrows the caller's fromSurface ref but releases it on
    // destroy). Releasing again here under-counts the Surface's native object →
    // Android frees it while the Java Surface still points at it → SIGSEGV in
    // Surface.isValid during the SurfaceView teardown. Just drop our pointer.
    RcoreAndroidSurface_DestroyWindow(s.windowId);
    s.window = nullptr;
    engineDestroyScreen(surfaceId);
    g_surfaces.erase(it);
    LOGI("nativeDestroySurface: surfaceId=%d (remaining=%zu)", surfaceId, g_surfaces.size());
}

// Push a surface to the top of the focus stack (becomes the focused screen).
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativePushSurface(JNIEnv*, jclass, jint surfaceId) {
    // NOTE: no g_engineMutex here — this is called on the main thread inside the
    // request-new-surface window, while the requesting render thread is parked
    // in enginePumpJS still holding g_engineMutex (locking would deadlock). That
    // parked thread already excludes every other render thread, so g_screenStack
    // is not touched concurrently.
    enginePushScreen(surfaceId);
}

// Pop the focused surface from the stack. Returns the popped surfaceId, or 0
// if the stack would underflow (root screen stays).
JNIEXPORT jint JNICALL
Java_com_rayact_engine_RayactEngine_nativePopSurface(JNIEnv*, jclass) {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    int top = engineGetFocusedScreenId();
    if (!enginePopScreen()) return 0;
    return (jint)top;
}

// Returns the currently focused surfaceId.
JNIEXPORT jint JNICALL
Java_com_rayact_engine_RayactEngine_nativeGetFocusedSurfaceId(JNIEnv*, jclass) {
    return (jint)engineGetFocusedScreenId();
}

// One frame: pump JS + render every visible screen. Called per Choreographer
// vsync on the render thread. Multiple surfaces each drive a render thread;
// we debounce by frame id so the engine only renders once per vsync.
static int64_t g_lastRenderFrameNanos = 0;

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeRenderFrame(JNIEnv*, jclass) {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (g_surfaces.empty()) return;

    // Debounce: only the first call per frame (within 1ms of the last) does
    // the actual work. Other surface render threads are no-ops.
    int64_t now = RcoreAndroidSurface_NowNanos();
    if (now - g_lastRenderFrameNanos < 1000000) return; // <1ms since last
    g_lastRenderFrameNanos = now;

    // The initial JS_Eval + React scheduling runs on the UI thread (surfaceCreated),
    // but this pump runs on the render thread. QuickJS captures the JS stack base
    // via JS_UpdateStackTop; if it was last set on the UI thread, the render
    // thread's unrelated stack pointer reads as a massive depth and QuickJS
    // throws "Maximum call stack size exceeded" on the first deep recursion
    // (React's mount), silently aborting it. Re-capture the stack base on THIS
    // thread before running any JS.
    rayact::enginePrepareJSThread();
    rayact::enginePumpJS();

    // Drain pending hardware-back events. g_pendingBackPress is set by the
    // main thread (Kotlin OnBackPressedCallback) or by JS itself (via
    // __rayactHostExitApp). The drain runs the registered JS listeners
    // (newest-first) and consumes the event if any returns true; otherwise
    // it falls back to finishing the Activity. Done under g_engineMutex so
    // a back press can't race a JS pump / setRoot.
    if (g_pendingBackPress.exchange(false, std::memory_order_acq_rel)) {
        bool exitApp = g_exitAppRequested.exchange(false, std::memory_order_acq_rel);
        if (exitApp) {
            // JS asked to exit the app. Skip the listener chain — just finish.
            g_finishActivityRequested.store(true, std::memory_order_release);
        } else {
            JSContext* ctx = rayact::engineContext();
            if (ctx) {
                JSValue global = JS_GetGlobalObject(ctx);
                JSValue fn = JS_GetPropertyStr(ctx, global, "__rayactDrainBackPress");
                bool handled = false;
                if (JS_IsFunction(ctx, fn)) {
                    JSValue r = JS_Call(ctx, fn, JS_UNDEFINED, 0, nullptr);
                    if (JS_IsException(r)) {
                        JSValue exc = JS_GetException(ctx);
                        const char* s = JS_ToCString(ctx, exc);
                        LOGE("__rayactDrainBackPress threw: %s", s ? s : "?");
                        if (s) JS_FreeCString(ctx, s);
                        JS_FreeValue(ctx, exc);
                    } else {
                        handled = JS_ToBool(ctx, r) != 0;
                    }
                    JS_FreeValue(ctx, r);
                } else {
                    LOGE("__rayactDrainBackPress missing (BackHandler not loaded?)");
                }
                JS_FreeValue(ctx, fn);
                JS_FreeValue(ctx, global);
                if (!handled) {
                    g_finishActivityRequested.store(true, std::memory_order_release);
                }
            }
        }
    }

    // If a back-press drain decided to finish the Activity, post a Kotlin
    // reverse-call to do it. We do this on the main thread (not the render
    // thread) so the finish goes through the activity lifecycle properly.
    if (g_finishActivityRequested.exchange(false, std::memory_order_acq_rel)) {
        if (g_jvm) {
            JNIEnv* env2 = nullptr;
            bool needDetach = false;
            jint rs = g_jvm->GetEnv((void**)&env2, JNI_VERSION_1_6);
            if (rs == JNI_EDETACHED) {
                if (g_jvm->AttachCurrentThread(&env2, nullptr) != JNI_OK) env2 = nullptr;
                else needDetach = true;
            }
            if (env2) {
                jclass cls = env2->FindClass("com/rayact/engine/RayactEngineKt");
                if (cls) {
                    jmethodID m = env2->GetStaticMethodID(cls, "finishActivityFromHost", "()V");
                    if (m) env2->CallStaticVoidMethod(cls, m);
                    else LOGE("RayactEngineKt.finishActivityFromHost not found");
                    env2->DeleteLocalRef(cls);
                } else {
                    LOGE("com/rayact/engine/RayactEngineKt class not found");
                }
                if (env2->ExceptionCheck()) {
                    env2->ExceptionDescribe();
                    env2->ExceptionClear();
                }
            }
            if (needDetach) g_jvm->DetachCurrentThread();
        }
    }

    // Snapshot the visible-screen list in z-order (bottom→top) so the
    // engine's per-screen state (g_root swap) is observed cleanly.
    std::vector<int> ordered;
    ordered.reserve(g_surfaces.size());
    engineForEachVisibleScreen([&](int id, const raym3::v2::NodePtr&) {
        if (g_surfaces.count(id)) ordered.push_back(id);
    });
    if (ordered.empty()) return;

    // Per-surface bind → render pass → swap. The engine does layout, render,
    // and input dispatch (only on the focused screen). Each pass binds the
    // right EGL window first, and swaps it after, so the on-screen result
    // is the composited stack (back-to-front).
    for (int id : ordered) {
        auto& s = g_surfaces[id];
        RcoreAndroidSurface_BindWindow(s.windowId);
        // Pass the bound window's REAL pixel size. (Previously this passed
        // s.windowId for both width and height — a 1x1 layout area, so every
        // node clipped to nothing and the frame drew zero vertices.)
        int w = s.window ? ANativeWindow_getWidth(s.window) : 0;
        int h = s.window ? ANativeWindow_getHeight(s.window) : 0;
        if (w <= 0 || h <= 0) { w = GetRenderWidth(); h = GetRenderHeight(); }
        rayact::engineRenderFrameAndroid(w, h);
        RcoreAndroidSurface_SwapWindow();
    }
}

// Touch event from the UI thread. action: 0=down 1=up 2=move (RCORE_AS_TOUCH_*).
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeTouch(JNIEnv*, jclass, jint action, jint id, jfloat x, jfloat y) {
    RcoreAndroidSurface_PushTouch(action, id, x, y);
    rayact::engineQueueTouch((int)action, (int)id, (float)x, (float)y);
}

// Hardware-back press forwarded from the Kotlin OnBackPressedCallback.
// The flag is read in nativeRenderFrame (or wherever we next drain the JS
// queue); JS consumes it via globalThis.__rayactDrainBackPress and returns
// true (handled) or false (no listener handled it → fall back to finishing
// the Activity).
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeOnBackPressed(JNIEnv*, jclass) {
    g_pendingBackPress.store(true, std::memory_order_release);
}

// JS called __rayactHostExitApp. Schedule the Activity finish.
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeExitApp(JNIEnv*, jclass) {
    g_exitAppRequested.store(true, std::memory_order_release);
    // Also trip the back-press flag so the render thread's drain loop wakes
    // up and processes both flags in one pass.
    g_pendingBackPress.store(true, std::memory_order_release);
}

// Replace g_screenStack with the supplied ids (z-order, bottom→top). JS
// reads navigator-driven state and trims the engine to exactly the focused
// + previous surfaces, so a 20-deep stack only renders 2 surfaces per
// frame. Idempotent; root screen (0) is always preserved at the bottom.
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeSetScreenStack(JNIEnv* env, jclass, jintArray ids) {
    if (!ids) return;
    std::lock_guard<std::mutex> lock(g_engineMutex);
    jsize n = env->GetArrayLength(ids);
    if (n < 0) n = 0;
    if (n > 1024) n = 1024;
    std::vector<int> v;
    v.reserve((size_t)n);
    jint* data = env->GetIntArrayElements(ids, nullptr);
    if (data) {
        for (jsize i = 0; i < n; ++i) v.push_back((int)data[i]);
        env->ReleaseIntArrayElements(ids, data, JNI_ABORT);
    }
    engineSetScreenStack(v);
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeSurfaceDestroyed(JNIEnv*, jclass) {
    // No-op: surfaces are managed explicitly via nativeCreateSurface /
    // nativeDestroySurface. This entry point is kept for legacy callers
    // (the single-surface view) that don't use the multi-surface API.
    LOGI("nativeSurfaceDestroyed: no-op (surfaces are managed by create/destroy)");
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeDestroy(JNIEnv*, jclass) {
    if (!g_surfaces.empty()) {
        // Release all surfaces in reverse order so the focus stack unwinds cleanly.
        std::vector<int> ids;
        ids.reserve(g_surfaces.size());
        for (auto& [id, s] : g_surfaces) ids.push_back(id);
        for (auto it = ids.rbegin(); it != ids.rend(); ++it) {
            Surface& s = g_surfaces[*it];
            RcoreAndroidSurface_DestroyWindow(s.windowId); // releases the ANativeWindow ref
            s.window = nullptr;
            engineDestroyScreen(*it);
        }
        g_surfaces.clear();
    }
    if (g_engineReady) { rayact::engineDestroy(); g_engineReady = false; }
    g_scriptExecuted = false;
    g_pendingScriptMode = -1;
    g_pendingScript.clear();
}

} // extern "C"
