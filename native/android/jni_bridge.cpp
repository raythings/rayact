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
//   - The first nativeCreateSurface() brings up the graphics context (legacy
//     SetWindow + InitWindow path). The root surface owns the app's React tree.
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
#include <unistd.h>   // chdir

#include "../core/engine.hpp"
#include "../core/config_loader.hpp"
#include "../desktop/raym3_bridge.hpp"
#include <raym3/fonts/FontManager.h>
#include <raym3/v2/Density.h>
#include <raym3/v2/EmojiFont.h>

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
// Real Android display density (DisplayMetrics.density). Stored so safe-area
// insets arriving as real-dp can be rescaled to layout-dp.
static float g_realDensity = 1.0f;
int g_pendingScriptMode = -1;          // 0 = source string, 1 = dev-server URL
std::string g_pendingScript;
std::string g_dataPath;                // Activity internalDataPath; used by config loader
std::map<int, Surface> g_surfaces;     // surfaceId -> Surface
int g_rootScreenId = 0;                // Stable process root screen; survives Activity/Surface recreation.

// QuickJS + raym3 are single-threaded; the process-level render scheduler calls
// nativeRenderFrame from one render thread, and host/lifecycle calls may arrive
// from the main thread. All engine work that runs outside the request-new-
// surface parked window takes this lock.
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

void setRaym3AndroidDensity(float realDensity, float layoutDensity) {
    raym3::v2::Density::SetPlatformDensity(realDensity);
    raym3::v2::Density::SetLayoutDensity(layoutDensity);
    raym3::FontManager::SetDpiScale(layoutDensity);
}

float androidLayoutDensityForSurface(ANativeWindow* window, float realDensity) {
    int surfaceWidth = window ? ANativeWindow_getWidth(window) : 0;
    // Current Rayact policy: normalize layout width to 390dp so component dp
    // dimensions remain stable across phones while rasterization uses the
    // resulting surface px/dp ratio. Keep this explicit until a per-app
    // density policy is introduced.
    return (surfaceWidth > 0) ? (float)surfaceWidth / 390.0f : realDensity;
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
static jint callIntoHost_IntMethod(const char* methodName) {
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
    jint result = 0;
    // Top-level Kotlin functions in package com.rayact.engine are compiled
    // into class com.rayact.engine.RayactEngineKt with static methods.
    jclass cls = env->FindClass("com/rayact/engine/RayactEngineKt");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, methodName, "()I");
        if (m) result = env->CallStaticIntMethod(cls, m);
        else LOGE("RayactEngineKt.%s not found", methodName);
        env->DeleteLocalRef(cls);
    } else {
        LOGE("com/rayact/engine/RayactEngineKt class not found");
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

static jint callIntoHost_RequestNewSurface() {
    return callIntoHost_IntMethod("requestNewSurfaceFromHost");
}

static jint callIntoHost_TopSurfaceId() {
    return callIntoHost_IntMethod("topSurfaceIdFromHost");
}

static jint callIntoHost_RootSurfaceId() {
    return callIntoHost_IntMethod("rootSurfaceIdFromHost");
}

static bool attachEnv(JNIEnv** outEnv, bool* outNeedDetach) {
    if (!g_jvm || !outEnv || !outNeedDetach) return false;
    *outEnv = nullptr;
    *outNeedDetach = false;
    jint rs = g_jvm->GetEnv((void**)outEnv, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(outEnv, nullptr) != JNI_OK) return false;
        *outNeedDetach = true;
        return true;
    }
    return rs == JNI_OK;
}

static void callIntoHost_ReleaseSurface(int surfaceId) {
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->FindClass("com/rayact/engine/RayactEngineKt");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "releaseSurfaceFromHost", "(I)V");
        if (m) env->CallStaticVoidMethod(cls, m, (jint)surfaceId);
        else LOGE("RayactEngineKt.releaseSurfaceFromHost not found");
        env->DeleteLocalRef(cls);
    } else {
        LOGE("com/rayact/engine/RayactEngineKt class not found");
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
}

static void callIntoHost_OrderSurfaces(const int* ids, int count) {
    if (!ids || count <= 0) return;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jintArray arr = env->NewIntArray((jsize)count);
    if (arr) {
        env->SetIntArrayRegion(arr, 0, (jsize)count, reinterpret_cast<const jint*>(ids));
        jclass cls = env->FindClass("com/rayact/engine/RayactEngineKt");
        if (cls) {
            jmethodID m = env->GetStaticMethodID(cls, "orderSurfacesFromHost", "([I)V");
            if (m) env->CallStaticVoidMethod(cls, m, arr);
            else LOGE("RayactEngineKt.orderSurfacesFromHost not found");
            env->DeleteLocalRef(cls);
        } else {
            LOGE("com/rayact/engine/RayactEngineKt class not found");
        }
        env->DeleteLocalRef(arr);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
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
    callIntoHost_ReleaseSurface(surfaceId);
}
extern "C" void rayactJniOrderSurfaces(const int* ids, int count) {
    callIntoHost_OrderSurfaces(ids, count);
}

// Pending text updates from Android IME (main thread) drained on render thread.
struct PendingTextUpdate {
    std::string text;
    int cursor = -1;
};
static std::mutex g_textUpdateMutex;
static std::map<int, PendingTextUpdate> g_pendingTextUpdates;
// IME DONE/Enter requested a blur of the focused field (drained on render thread).
static std::atomic<bool> g_pendingImeBlur{false};

// Only show keyboard if not already showing for this node.
static std::atomic<int> g_imeNodeId{-1};

void AndroidKeyboard_ShowForNode(int nodeId) {
    const int prevNode = g_imeNodeId.load();
    g_imeNodeId.store(nodeId);
    // Called from render thread which already holds g_engineMutex — no re-lock.
    std::string value;
    {
        auto it = g_nodes.find(nodeId);
        if (it != g_nodes.end() && it->second->textInput.value)
            value = *it->second->textInput.value;
    }
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->FindClass("com/rayact/engine/RayactEngineKt");
    if (cls) {
        // Field-to-field: switch in-place (keyboard stays visible).
        // Cold focus or re-open after system IME dismiss: show.
        const char* method = (prevNode >= 0 && prevNode != nodeId)
                                 ? "switchImeFromHost"
                                 : "showSoftKeyboardFromHost";
        const char* sig = "(ILjava/lang/String;)V";
        jmethodID m = env->GetStaticMethodID(cls, method, sig);
        if (m) {
            jstring jVal = env->NewStringUTF(value.c_str());
            env->CallStaticVoidMethod(cls, m, (jint)nodeId, jVal);
            env->DeleteLocalRef(jVal);
        } else {
            LOGE("RayactEngineKt.%s not found", method);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
}

void AndroidKeyboard_Hide() {
    g_imeNodeId.store(-1);
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->FindClass("com/rayact/engine/RayactEngineKt");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "hideSoftKeyboardFromHost", "()V");
        if (m) env->CallStaticVoidMethod(cls, m);
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
}

extern "C" JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeSetTextInputContent(JNIEnv* env, jclass, jint nodeId, jstring text, jint cursor) {
    const char* s = env->GetStringUTFChars(text, nullptr);
    if (!s) return;
    std::string str(s);
    env->ReleaseStringUTFChars(text, s);
    // QuickJS is render-thread-only. Queue the update; drain on render thread.
    std::lock_guard<std::mutex> lock(g_textUpdateMutex);
    g_pendingTextUpdates[(int)nodeId] = {std::move(str), (int)cursor};
}

extern "C" JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeBlurTextInput(JNIEnv*, jclass) {
    g_pendingImeBlur.store(true, std::memory_order_release);
}

extern "C" JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeImeHiddenBySystem(JNIEnv*, jclass) {
    g_imeNodeId.store(-1, std::memory_order_release);
}

// Render thread → Kotlin: keep the IME InputConnection selection in sync with
// native caret moves (tap-to-caret on a focused field).
void AndroidKeyboard_UpdateSelection(int nodeId, int cursor) {
    if (g_imeNodeId.load() != nodeId) return;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->FindClass("com/rayact/engine/RayactEngineKt");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "updateImeSelectionFromHost", "(II)V");
        if (m) env->CallStaticVoidMethod(cls, m, (jint)nodeId, (jint)cursor);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
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

// ── Android OS emoji rasterizer ───────────────────────────────────────────
// Uses android.graphics.Paint + Bitmap to render a UTF-8 emoji cluster at
// `px` size into an RGBA8 heap buffer. Called from the render thread; attaches
// the JNI env as needed.
namespace {
unsigned char *AndroidRasterizeEmoji(const char *utf8, int px, int *outW, int *outH) {
    if (!utf8 || px <= 0 || !g_jvm) return nullptr;

    JNIEnv *env = nullptr;
    bool needDetach = false;
    jint rs = g_jvm->GetEnv((void **)&env, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) return nullptr;
        needDetach = true;
    } else if (rs != JNI_OK) {
        return nullptr;
    }

    unsigned char *result = nullptr;

    // android.graphics.Bitmap
    jclass bitmapClass   = env->FindClass("android/graphics/Bitmap");
    jclass configClass   = env->FindClass("android/graphics/Bitmap$Config");
    jclass paintClass    = env->FindClass("android/graphics/Paint");
    jclass canvasClass   = env->FindClass("android/graphics/Canvas");

    if (!bitmapClass || !configClass || !paintClass || !canvasClass) goto done;

    {
        // Bitmap.Config.ARGB_8888
        jfieldID argb8888Field = env->GetStaticFieldID(configClass, "ARGB_8888",
                                                        "Landroid/graphics/Bitmap$Config;");
        jobject argb8888 = env->GetStaticObjectField(configClass, argb8888Field);

        // Bitmap.createBitmap(px, px, ARGB_8888)
        jmethodID createBitmap = env->GetStaticMethodID(bitmapClass, "createBitmap",
            "(IILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;");
        jobject bitmap = env->CallStaticObjectMethod(bitmapClass, createBitmap,
                                                     (jint)px, (jint)px, argb8888);
        if (!bitmap) goto done;

        // Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG); paint.setTextSize(px * 0.88f)
        jmethodID paintInit = env->GetMethodID(paintClass, "<init>", "(I)V");
        jobject paint = env->NewObject(paintClass, paintInit, (jint)1 /*ANTI_ALIAS_FLAG*/);
        if (!paint) goto done;

        jmethodID setTextSize = env->GetMethodID(paintClass, "setTextSize", "(F)V");
        env->CallVoidMethod(paint, setTextSize, (jfloat)(px * 0.88f));

        // Canvas canvas = new Canvas(bitmap)
        jmethodID canvasInit = env->GetMethodID(canvasClass, "<init>",
                                                 "(Landroid/graphics/Bitmap;)V");
        jobject canvas = env->NewObject(canvasClass, canvasInit, bitmap);
        if (!canvas) goto done;

        // canvas.drawText(utf8, px/2 - measured/2, baseline, paint)
        jstring jtext = env->NewStringUTF(utf8);
        if (!jtext) goto done;

        jmethodID measureText = env->GetMethodID(paintClass, "measureText",
                                                  "(Ljava/lang/String;)F");
        jfloat textW = env->CallFloatMethod(paint, measureText, jtext);

        // Estimate baseline from ascent: roughly 80% of px from top.
        jfloat x = ((jfloat)px - textW) * 0.5f;
        jfloat y = (jfloat)px * 0.82f;

        jmethodID drawText = env->GetMethodID(canvasClass, "drawText",
            "(Ljava/lang/String;FFLandroid/graphics/Paint;)V");
        env->CallVoidMethod(canvas, drawText, jtext, x, y, paint);
        env->DeleteLocalRef(jtext);

        // bitmap.copyPixelsToBuffer — use int[] getPixels for simplicity
        jintArray pixels = env->NewIntArray(px * px);
        if (!pixels) goto done;
        jmethodID getPixels = env->GetMethodID(bitmapClass, "getPixels",
            "([IIIIIII)V");
        env->CallVoidMethod(bitmap, getPixels, pixels, (jint)0, (jint)px,
                             (jint)0, (jint)0, (jint)px, (jint)px);

        jint *data = env->GetIntArrayElements(pixels, nullptr);
        if (!data) goto done;

        // ARGB_8888 → RGBA8 straight alpha
        std::size_t bytes = (std::size_t)(px * px * 4);
        result = (unsigned char *)std::malloc(bytes);
        if (result) {
            for (int i = 0; i < px * px; ++i) {
                jint argb = data[i];
                unsigned char a = (unsigned char)((argb >> 24) & 0xFF);
                unsigned char r = (unsigned char)((argb >> 16) & 0xFF);
                unsigned char g2 = (unsigned char)((argb >> 8) & 0xFF);
                unsigned char b = (unsigned char)(argb & 0xFF);
                // unpremultiply
                if (a > 0 && a < 255) {
                    r = (unsigned char)std::min(255, (int)r * 255 / a);
                    g2 = (unsigned char)std::min(255, (int)g2 * 255 / a);
                    b = (unsigned char)std::min(255, (int)b * 255 / a);
                }
                result[i * 4 + 0] = r;
                result[i * 4 + 1] = g2;
                result[i * 4 + 2] = b;
                result[i * 4 + 3] = a;
            }
            *outW = px;
            *outH = px;
        }
        env->ReleaseIntArrayElements(pixels, data, JNI_ABORT);
        env->DeleteLocalRef(pixels);
    }

done:
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}
} // namespace

extern "C" {

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* /*reserved*/) {
    g_jvm = vm;
    // Wire OS emoji rasterizer immediately — uses g_jvm which is now set.
    raym3::v2::EmojiFont::Instance().SetRasterizer(AndroidRasterizeEmoji);
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
        // Set CWD to the app's files directory so relative resource paths
        // (icon fonts, material_icons.js) resolve without filesystem rewiring.
        chdir(dp.c_str());
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

    {
        std::lock_guard<std::mutex> lock(g_engineMutex);
        int existingRootId = g_rootScreenId > 0 ? g_rootScreenId : callIntoHost_RootSurfaceId();
        if (g_scriptExecuted && g_surfaces.empty() && existingRootId > 0) {
            float layoutDensity = androidLayoutDensityForSurface(win, density);
            g_realDensity = density;
            engineBindScreenRoot(existingRootId);
            RcoreAndroidSurface_SetWindow(win);
            RcoreAndroidSurface_SetDensity(layoutDensity);
            SetTargetFPS(0);
            InitWindow(0, 0, "Rayact");
            if (!IsWindowReady()) {
                LOGE("nativeCreateSurface: resume InitWindow failed");
                ANativeWindow_release(win);
                return 0;
            }
            raym3::FontManager::ResetDeviceCache();
            setRaym3AndroidDensity(density, layoutDensity);
            raym3::FontManager::Initialize();
            rayact::engineLoadConfig(g_dataPath.c_str());
            rayact::engineFinishLoad();
            int windowId = RcoreAndroidSurface_GetCurrentId();
            if (windowId <= 0) windowId = 1;
            Surface s;
            s.window = win;
            s.windowId = windowId;
            s.screenId = existingRootId;
            s.density = density;
            s.ownsContext = true;
            g_surfaces[existingRootId] = s;
            engineSetScreenStack({existingRootId});
            LOGI("nativeCreateSurface: resumed root surfaceId=%d windowId=%d",
                 existingRootId, windowId);
            return (jint)existingRootId;
        }
    }

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
        float layoutDensity = androidLayoutDensityForSurface(win, density);
        g_realDensity = density;
        engineBindScreenRoot(screenId);
        RcoreAndroidSurface_SetWindow(win);
        RcoreAndroidSurface_SetDensity(layoutDensity);
        if (!executePendingScript()) {
            LOGE("nativeCreateSurface: script load failed");
            ANativeWindow_release(win);
            return 0;
        }
        SetTargetFPS(0);
        InitWindow(0, 0, "Rayact");
        if (!IsWindowReady()) { LOGE("nativeCreateSurface: InitWindow failed"); ANativeWindow_release(win); return 0; }
        setRaym3AndroidDensity(density, layoutDensity);
        raym3::FontManager::Initialize();
        rayact::engineLoadConfig(g_dataPath.c_str());
        rayact::engineFinishLoad();
        windowId = RcoreAndroidSurface_GetCurrentId();
        if (windowId <= 0) windowId = 1; // raylib legacy path: first surface id is 1
        ownsContext = true;
        if (g_rootScreenId <= 0) g_rootScreenId = screenId;
    } else {
        float layoutDensity = androidLayoutDensityForSurface(win, density);
        RcoreAndroidSurface_SetDensity(layoutDensity);
        setRaym3AndroidDensity(density, layoutDensity);
        windowId = RcoreAndroidSurface_CreateWindow(win);
        if (windowId <= 0) { LOGE("nativeCreateSurface: CreateWindow failed"); ANativeWindow_release(win); return 0; }
    }

    Surface s;
    s.window = win;
    s.windowId = windowId;
    s.screenId = screenId;
    s.density = density;  // real density stored for reference
    s.ownsContext = ownsContext;
    g_surfaces[screenId] = s;
    LOGI("nativeCreateSurface: surfaceId=%d windowId=%d (total=%zu)",
         screenId, windowId, g_surfaces.size());
    return (jint)screenId;
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeSetSafeAreaInsets(
    JNIEnv*, jclass, jfloat top, jfloat right, jfloat bottom, jfloat left) {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    // Insets arrive in real Android dp (px / DisplayMetrics.density).
    // Rescale to layout-dp (px / layoutDensity) so Yoga allocates the correct space.
    float layoutDensity = raym3::v2::Density::GetLayoutDensity();
    float scale = (layoutDensity > 0.0f && g_realDensity > 0.0f)
                  ? g_realDensity / layoutDensity : 1.0f;
    setSafeAreaInsets(top * scale, right * scale, bottom * scale, left * scale);
}

// Destroy an EGL surface + engine screen. Idempotent.
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngine_nativeDestroySurface(JNIEnv*, jclass, jint surfaceId) {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    auto it = g_surfaces.find(surfaceId);
    if (it == g_surfaces.end()) return;
    Surface& s = it->second;
    const int hostRootId = callIntoHost_RootSurfaceId();
    const bool isRootSurface =
        (surfaceId == g_rootScreenId) || (hostRootId > 0 && surfaceId == hostRootId);

    // If this surface is the top of the focus stack, pop it first so the
    // focused screen no longer references a destroyed tree.
    const bool wasFocused = engineGetFocusedScreenId() == surfaceId;
    if (wasFocused && !isRootSurface) {
        enginePopScreen();
    }

    // RcoreAndroidSurface_DestroyWindow already releases the ANativeWindow ref
    // (the platform borrows the caller's fromSurface ref but releases it on
    // destroy). Releasing again here under-counts the Surface's native object →
    // Android frees it while the Java Surface still points at it → SIGSEGV in
    // Surface.isValid during the SurfaceView teardown. Just drop our pointer.
    RcoreAndroidSurface_DestroyWindow(s.windowId);
    s.window = nullptr;
    g_surfaces.erase(it);
    if (isRootSurface) {
        // Android can destroy and later recreate a SurfaceView's native window
        // while the Activity is merely backgrounded. The process-level JS
        // engine and root React tree stay alive, so keep the engine screen and
        // only detach the transient ANativeWindow. nativeCreateSurface will
        // bind the next window back to this same screen id on resume.
        engineSetScreenStack({surfaceId});
    } else {
        engineDestroyScreen(surfaceId);
    }
    if (wasFocused && !isRootSurface) {
        int top = callIntoHost_TopSurfaceId();
        std::vector<int> ids;
        if (top > 0 && g_surfaces.count(top)) ids.push_back(top);
        engineSetScreenStack(ids);
    }
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

JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngine_nativeRenderFrame(JNIEnv*, jclass,
                                                      jlong frameTimeNanos,
                                                      jlong deltaNanos) {
    (void)frameTimeNanos;
    (void)deltaNanos;
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (g_surfaces.empty()) return JNI_FALSE;

    int64_t now = RcoreAndroidSurface_NowNanos();
    if (now - g_lastRenderFrameNanos < 1000000) return JNI_FALSE;
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
    // Drain IME text updates posted by the main thread.
    {
        std::map<int, PendingTextUpdate> updates;
        {
            std::lock_guard<std::mutex> tlock(g_textUpdateMutex);
            updates.swap(g_pendingTextUpdates);
        }
        for (auto& [nodeId, update] : updates) {
            rayactSetTextInputContent(nodeId, update.text.c_str(), update.cursor);
        }
    }

    if (g_pendingImeBlur.exchange(false, std::memory_order_acq_rel)) {
        rayactBlurFocusedTextInput();
    }

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
    // engine's per-screen state (g_root swap) is observed cleanly. The top
    // SurfaceView can be focused before React has committed its sub-root, so
    // lower surfaces still need to keep their last valid visual frame during
    // the enter transition. Input is still gated to the focused screen.
    std::vector<int> ordered;
    ordered.reserve(g_surfaces.size());
    engineForEachVisibleScreen([&](int id, const raym3::v2::NodePtr&) {
        if (g_surfaces.count(id)) ordered.push_back(id);
    });
    if (ordered.empty()) return JNI_FALSE;

    // Per-surface bind → render pass → swap. Each SurfaceView owns one Android
    // native window and one engine screen; Android composites the windows in
    // ViewGroup z-order. Render only the matching screen into the bound window
    // and consume queued touch only on the focused surface.
    for (int id : ordered) {
        auto& s = g_surfaces[id];
        RcoreAndroidSurface_BindWindow(s.windowId);
        // Pass the bound window's REAL pixel size. (Previously this passed
        // s.windowId for both width and height — a 1x1 layout area, so every
        // node clipped to nothing and the frame drew zero vertices.)
        int w = s.window ? ANativeWindow_getWidth(s.window) : 0;
        int h = s.window ? ANativeWindow_getHeight(s.window) : 0;
        if (w <= 0 || h <= 0) { w = GetRenderWidth(); h = GetRenderHeight(); }
        rayact::engineRenderFrameAndroid(id, w, h);
        RcoreAndroidSurface_SwapWindow();
    }
    return rayact::engineNeedsAnotherFrame() ? JNI_TRUE : JNI_FALSE;
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
    g_rootScreenId = 0;
}

} // extern "C"
