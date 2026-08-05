// Rayact Android JNI bridge.
//
// Connects the process-level Rayact engine (native/core/engine.hpp) to N
// Android SurfaceViews via the raylib-backends PLATFORM_ANDROID_SURFACE backend
// (raylib-backends Android surface platform glue). The Kotlin host owns
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
#include <algorithm>
#include <atomic>
#include <map>
#include <mutex>
#include <set>
#include <functional>
#include <sstream>
#include <string>
#include <vector>
#include <unistd.h>   // chdir
#include <cstring>

#include <dlfcn.h>

#include "../core/engine.hpp"
#include "../core/config_loader.hpp"
#include "../desktop/kv_store.hpp"
#include "../desktop/async_storage.hpp"
#include "../desktop/module_bus.hpp"
#include "../desktop/plugin_loader.hpp"
#include "../desktop/raym3_bridge.hpp"
#include "../desktop/dev_client_bridge.hpp"
#include "../desktop/devtools.hpp"
#include "../desktop/js_stdlib.hpp"
#include "../shared/mobile_network_polyfill.h"
#include "android_engine_instance.hpp"
#include "../desktop/accessibility_bridge.hpp"
#include "engine_runtime.hpp"
#include <raym3/fonts/FontManager.h>
#include <raym3/raym3.h>
#include <raym3/styles/Stylesheet.h>
#include <raym3/v2/Density.h>
#include <raym3/v2/IconRenderer.h>
#include <raym3/v2/EmojiFont.h>
#include <raym3/v2/TextInput.h>

extern "C" {
#include "rcore_android_surface.h"   // RcoreAndroidSurface_* host hooks (from raylib-backends)
bool rlvkRegisterSurface(uint64_t surfaceId, void* nativeWindow, int width, int height);
void rlvkResizeRegisteredSurface(uint64_t surfaceId, int width, int height);
bool rlvkSelectSurface(uint64_t surfaceId);
void rlvkUnregisterSurface(uint64_t surfaceId);
}

// raylib functions we call directly to bring up / drive a surface.
extern "C" {
void  InitWindow(int width, int height, const char *title);
void  CloseWindow(void);
int   GetRenderWidth(void);
int   GetRenderHeight(void);
bool  IsWindowReady(void);
void  SetTargetFPS(int fps);
void  SetConfigFlags(unsigned int flags);
}

void rayactAndroidSetSystemDarkMode(bool isDark);

// Matches raylib.h ConfigFlags — this TU doesn't include raylib.h.
#ifndef FLAG_MSAA_4X_HINT
#define FLAG_MSAA_4X_HINT 0x00000020
#endif

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  "RayactJNI", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "RayactJNI", __VA_ARGS__)

JavaVM* g_jvm = nullptr;

// Per-surface state. surfaceId is also the engine screenId.
struct Surface {
    ANativeWindow* window = nullptr;   // owned; released in destroy
    int windowId = 0;                  // raylib EGL surface id (== surfaceId after CreateWindow)
    int screenId = 0;                  // engine screen id
    float density = 1.0f;
    int pendingWidth = 0;
    int pendingHeight = 0;
    bool resizePending = false;
    bool ownsContext = false;          // true only for the boot surface (the one that called InitWindow)
};

bool g_engineReady = false;
bool g_scriptExecuted = false;
bool g_scriptReloadRequested = false;
// Real Android display density (DisplayMetrics.density). Stored so safe-area
// insets arriving as real-dp can be rescaled to layout-dp.
static float g_realDensity = 1.0f;
int g_pendingScriptMode = -1;          // 0 = source string, 1 = dev-server URL, 2 = bytecode
std::string g_pendingScript;
std::vector<uint8_t> g_pendingBytecode;
static std::atomic<bool> g_pendingModuleUpdate{false};
static std::string g_pendingModulePath;
static std::string g_pendingModuleSource;
std::string g_dataPath;                // Activity internalDataPath; used by config loader
std::map<int, Surface> g_surfaces;     // surfaceId -> Surface
int g_rootScreenId = 0;                // Stable process root screen; survives Activity/Surface recreation.

// QuickJS + raym3 are single-threaded; the process-level render scheduler calls
// nativeRenderFrame from one render thread, and host/lifecycle calls may arrive
// from the main thread. All engine work that runs outside the request-new-
// surface parked window takes this lock.
std::mutex g_engineMutex;

// Hardware-back marshaling.
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
std::atomic<bool> g_pendingDevMenuToggle{false};

using PendingTextUpdate = AndroidEngineInstance::PendingTextUpdate;
using PendingKeyboardInsets = AndroidEngineInstance::PendingKeyboardInsets;
static std::mutex g_textUpdateMutex;
static std::map<int, PendingTextUpdate> g_pendingTextUpdates;
static std::atomic<bool> g_pendingImeBlur{false};
static std::atomic<bool> g_pendingImeSubmit{false};

// Insets are a WINDOW property, not per-JS-instance state, so they live as a
// single process-global "device truth". Each engine context self-syncs from it
// every frame (see the publish block in nativeRenderFrame) by comparing against
// its own AndroidEngineInstance::publishedSafeArea/publishedKeyboard. This
// replaces the old swap-a-snapshot-per-instance + shared-dirty-edge design,
// which let whichever context pumped first consume the edge and starve the
// other context's globalThis (the dev-app launcher↔project safe-area break).
static std::mutex g_deviceInsetsMutex;
static float g_lastDeviceSafeArea[4] = {0, 0, 0, 0};
static PendingKeyboardInsets g_lastDeviceKeyboard;
static std::mutex g_globalImeMutex;
static std::string g_globalImeText;
static std::atomic<int> g_imeNodeId{-1};
static std::mutex g_linkingMutex;
static std::vector<std::string> g_pendingLinkingUrls;

std::string jstr(JNIEnv* env, jstring s) {
    if (!s) return {};
    const char* c = env->GetStringUTFChars(s, nullptr);
    std::string out(c ? c : "");
    if (c) env->ReleaseStringUTFChars(s, c);
    return out;
}

static int utf8NextByte(const std::string& text, int pos) {
    if (pos < 0) return 0;
    if (pos >= (int)text.size()) return (int)text.size();
    unsigned char c = (unsigned char)text[(size_t)pos];
    int len = 1;
    if ((c & 0x80) == 0) len = 1;
    else if ((c & 0xE0) == 0xC0) len = 2;
    else if ((c & 0xF0) == 0xE0) len = 3;
    else if ((c & 0xF8) == 0xF0) len = 4;
    return std::min((int)text.size(), pos + len);
}

static uint32_t utf8CodepointAt(const std::string& text, int pos) {
    if (pos < 0 || pos >= (int)text.size()) return 0;
    unsigned char c = (unsigned char)text[(size_t)pos];
    if ((c & 0x80) == 0) return c;
    if ((c & 0xE0) == 0xC0 && pos + 1 < (int)text.size())
        return ((uint32_t)(c & 0x1F) << 6) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 1] & 0x3F));
    if ((c & 0xF0) == 0xE0 && pos + 2 < (int)text.size())
        return ((uint32_t)(c & 0x0F) << 12) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 1] & 0x3F) << 6) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 2] & 0x3F));
    if ((c & 0xF8) == 0xF0 && pos + 3 < (int)text.size())
        return ((uint32_t)(c & 0x07) << 18) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 1] & 0x3F) << 12) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 2] & 0x3F) << 6) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 3] & 0x3F));
    return c;
}

static void installAndroidMobileNetworkBindings(JSContext* ctx);
static void pumpAndroidMobileNetwork(JSContext* ctx);

static int utf16OffsetToUtf8Byte(const std::string& text, int utf16Offset) {
    if (utf16Offset < 0) return -1;
    int u16 = 0;
    int byte = 0;
    while (byte < (int)text.size() && u16 < utf16Offset) {
        uint32_t cp = utf8CodepointAt(text, byte);
        int next = utf8NextByte(text, byte);
        int units = cp > 0xFFFF ? 2 : 1;
        if (u16 + units > utf16Offset) break;
        u16 += units;
        byte = next;
    }
    return byte;
}

static int utf8ByteToUtf16Offset(const std::string& text, int byteOffset) {
    if (byteOffset < 0) return -1;
    byteOffset = std::clamp(byteOffset, 0, (int)text.size());
    int u16 = 0;
    for (int byte = 0; byte < byteOffset; byte = utf8NextByte(text, byte)) {
        uint32_t cp = utf8CodepointAt(text, byte);
        u16 += cp > 0xFFFF ? 2 : 1;
    }
    return u16;
}

void setRaym3AndroidDensity(float realDensity, float layoutDensity) {
    raym3::v2::Density::SetPlatformDensity(realDensity);
    raym3::v2::Density::SetLayoutDensity(layoutDensity);
    raym3::FontManager::SetDpiScale(layoutDensity);
}

float androidLayoutDensityForWidth(int surfaceWidth, float realDensity) {
    if (rayact::engineRelayoutOnSurfaceResizeEnabled())
        return realDensity;
    // Current Rayact policy: normalize layout width to 390dp so component dp
    // dimensions remain stable across phones while rasterization uses the
    // resulting surface px/dp ratio. Keep this explicit until a per-app
    // density policy is introduced.
    return (surfaceWidth > 0) ? (float)surfaceWidth / 390.0f : realDensity;
}

float androidLayoutDensityForSurface(ANativeWindow* window, float realDensity) {
    int surfaceWidth = window ? ANativeWindow_getWidth(window) : 0;
    return androidLayoutDensityForWidth(surfaceWidth, realDensity);
}

bool executePendingScript(bool forceReload = false) {
    if (g_pendingScriptMode < 0) return g_scriptExecuted;
    if (g_scriptExecuted && !forceReload) return true;
    if (!rayact::engineContext()) {
        LOGE("executePendingScript(mode=%d) skipped: no JS context", g_pendingScriptMode);
        return false;
    }
    rayact::enginePrepareJSThread();
    installAndroidMobileNetworkBindings(rayact::engineContext());
    bool ok = false;
    if (g_pendingScriptMode == 1) {
        ok = rayact::engineLoadDevServer(g_pendingScript);
    } else if (g_pendingScriptMode == 2) {
        ok = rayact::engineLoadBytecode(g_pendingBytecode.data(), g_pendingBytecode.size(), "app.qjsbc");
        g_pendingBytecode.clear();
    } else {
        ok = rayact::engineLoadSource(g_pendingScript, "app.js");
    }
    if (!ok) {
        LOGE("executePendingScript(mode=%d) failed", g_pendingScriptMode);
        return false;
    }
    g_scriptExecuted = true;
    g_scriptReloadRequested = false;
    LOGI("JS loaded on render thread: nodes=%zu root=%s",
        g_nodes.size(), g_root ? "yes" : "no");
    return true;
}

// Asks the host (Kotlin RayactEngine.requestNewSurfaceFromHost) to create a
// new EGL surface + engine screen, returning the new surfaceId. Called from
// the render thread when JS invokes __rayactHostRequestNewSurface. Blocks
// until the host finishes (the host does the UI work on the main thread).
static jint callIntoHost_IntMethod(const char* methodName) {
    AndroidEngineInstance* inst = androidEngineCurrent();
    if (!inst) return 0;
    if (strcmp(methodName, "requestNewSurfaceFromHost") == 0)
        return inst->callHostInt("requestNewSurface");
    if (strcmp(methodName, "rootSurfaceIdFromHost") == 0)
        return inst->callHostInt("rootSurfaceId");
    if (strcmp(methodName, "topSurfaceIdFromHost") == 0)
        return inst->callHostInt("topSurfaceId");
    return 0;
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

static std::string callIntoHost_StringMethod(const char* methodName) {
    AndroidEngineInstance* inst = androidEngineCurrent();
    if (!inst) return {};
    if (strcmp(methodName, "readClipboardFromHost") == 0)
        return inst->callHostString("readClipboard");
    return {};
}

static void callIntoHost_VoidMethod(const char* methodName) {
    AndroidEngineInstance* inst = androidEngineCurrent();
    if (!inst) return;
    if (strcmp(methodName, "toggleDevMenuFromHost") == 0) {
        inst->callHostVoid("toggleDevMenu");
    } else if (strcmp(methodName, "requestRenderFrameFromHost") == 0) {
        inst->callHostVoid("requestRenderFrame");
    } else if (strcmp(methodName, "performHapticFeedbackFromHost") == 0) {
        inst->callHostVoid("performHapticFeedback");
    } else if (strcmp(methodName, "hideSoftKeyboardFromHost") == 0) {
        inst->callHostVoid("hideSoftKeyboard");
    } else if (strcmp(methodName, "finishActivityFromHost") == 0) {
        inst->callHostVoid("finishActivity");
    }
}

namespace rayact {
void androidRequestRenderFrame() {
    androidEngineRequestGraphicsFrame();
}
} // namespace rayact

static void installAndroidTextInputHostHooksOnce() {
    static bool installed = false;
    if (installed) return;
    installed = true;
    raym3::v2::SetTextInputHostHooks({
        []() -> std::string { return callIntoHost_StringMethod("readClipboardFromHost"); },
        [](const std::string& text) {
            AndroidEngineInstance* inst = androidEngineCurrent();
            if (inst) inst->callHostCopyToClipboard(text);
        },
        []() { callIntoHost_VoidMethod("performHapticFeedbackFromHost"); }
    });
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

static std::string androidMobileFetchText(const char* url) {
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return {};
    std::string result;
    jclass cls = env->FindClass("com/rayact/engine/RayactMobileNetwork");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "fetchTextFromNative",
                                             "(Ljava/lang/String;)Ljava/lang/String;");
        if (m) {
            jstring jUrl = env->NewStringUTF(url ? url : "");
            jstring jResult = (jstring)env->CallStaticObjectMethod(cls, m, jUrl);
            if (jResult) {
                result = jstr(env, jResult);
                env->DeleteLocalRef(jResult);
            }
            env->DeleteLocalRef(jUrl);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

static std::vector<uint8_t> androidMobileFetchBytes(const char* url) {
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return {};
    std::vector<uint8_t> result;
    jclass cls = env->FindClass("com/rayact/engine/RayactMobileNetwork");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "fetchBytesFromNative",
                                             "(Ljava/lang/String;)[B");
        if (m) {
            jstring jUrl = env->NewStringUTF(url ? url : "");
            jbyteArray jResult = (jbyteArray)env->CallStaticObjectMethod(cls, m, jUrl);
            if (jResult) {
                jsize len = env->GetArrayLength(jResult);
                if (len > 0) {
                    result.resize((size_t)len);
                    env->GetByteArrayRegion(jResult, 0, len,
                                            reinterpret_cast<jbyte*>(result.data()));
                }
                env->DeleteLocalRef(jResult);
            }
            env->DeleteLocalRef(jUrl);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

static void androidMobileFetchStart(jlong owner, int requestId, const char* url,
                                    const char* method, const char* headersJson,
                                    const char* body) {
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->FindClass("com/rayact/engine/RayactMobileNetwork");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(
            cls, "fetchStart",
            "(JILjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V");
        if (m) {
            jstring jUrl = env->NewStringUTF(url ? url : "");
            jstring jMethod = env->NewStringUTF(method ? method : "GET");
            jstring jHeaders = env->NewStringUTF(headersJson ? headersJson : "{}");
            // A null body is distinct from an empty one: OkHttp rejects a body
            // on GET/HEAD, so it must stay absent rather than become "".
            jstring jBody = body ? env->NewStringUTF(body) : nullptr;
            env->CallStaticVoidMethod(cls, m, owner, (jint)requestId, jUrl, jMethod, jHeaders, jBody);
            if (jBody) env->DeleteLocalRef(jBody);
            env->DeleteLocalRef(jHeaders);
            env->DeleteLocalRef(jMethod);
            env->DeleteLocalRef(jUrl);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
}

static void androidMobileFetchAbort(jlong owner, int requestId) {
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->FindClass("com/rayact/engine/RayactMobileNetwork");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "fetchAbort", "(JI)V");
        if (m) env->CallStaticVoidMethod(cls, m, owner, (jint)requestId);
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
}

static int androidMobileWsOpen(jlong owner, const char* url) {
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return 0;
    int result = 0;
    jclass cls = env->FindClass("com/rayact/engine/RayactMobileNetwork");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "wsOpen", "(JLjava/lang/String;)I");
        if (m) {
            jstring jUrl = env->NewStringUTF(url ? url : "");
            result = (int)env->CallStaticIntMethod(cls, m, owner, jUrl);
            env->DeleteLocalRef(jUrl);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

static bool androidMobileWsSend(jlong owner, int id, const char* data) {
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return false;
    bool result = false;
    jclass cls = env->FindClass("com/rayact/engine/RayactMobileNetwork");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "wsSend", "(JILjava/lang/String;)Z");
        if (m) {
            jstring jData = env->NewStringUTF(data ? data : "");
            result = env->CallStaticBooleanMethod(cls, m, owner, (jint)id, jData) == JNI_TRUE;
            env->DeleteLocalRef(jData);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

static bool androidMobileWsClose(jlong owner, int id, int code, const char* reason) {
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return false;
    bool result = false;
    jclass cls = env->FindClass("com/rayact/engine/RayactMobileNetwork");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "wsClose", "(JIILjava/lang/String;)Z");
        if (m) {
            jstring jReason = env->NewStringUTF(reason ? reason : "");
            result = env->CallStaticBooleanMethod(cls, m, owner, (jint)id, (jint)code, jReason) == JNI_TRUE;
            env->DeleteLocalRef(jReason);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

static std::string androidMobileWsPollEvents(jlong owner) {
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return "[]";
    std::string result = "[]";
    jclass cls = env->FindClass("com/rayact/engine/RayactMobileNetwork");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "wsPollEvents", "(J)Ljava/lang/String;");
        if (m) {
            jstring jResult = (jstring)env->CallStaticObjectMethod(cls, m, owner);
            if (jResult) {
                result = jstr(env, jResult);
                env->DeleteLocalRef(jResult);
            }
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

static JSValue JS_mobileFetchText(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_NewString(ctx, "");
    const char* url = JS_ToCString(ctx, argv[0]);
    std::string body = androidMobileFetchText(url);
    if (url) JS_FreeCString(ctx, url);
    return JS_NewStringLen(ctx, body.data(), body.size());
}

static JSValue JS_mobileFetchBytes(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_NewArrayBufferCopy(ctx, nullptr, 0);
    const char* url = JS_ToCString(ctx, argv[0]);
    std::vector<uint8_t> bytes = androidMobileFetchBytes(url);
    if (url) JS_FreeCString(ctx, url);
    if (bytes.empty()) return JS_NewArrayBufferCopy(ctx, nullptr, 0);
    return JS_NewArrayBufferCopy(ctx, bytes.data(), bytes.size());
}

static JSValue JS_mobileFetchStart(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_UNDEFINED;
    int32_t id = 0;
    JS_ToInt32(ctx, &id, argv[0]);
    const char* url = JS_ToCString(ctx, argv[1]);
    const char* method = argc > 2 ? JS_ToCString(ctx, argv[2]) : nullptr;
    const char* headers = argc > 3 ? JS_ToCString(ctx, argv[3]) : nullptr;
    // Undefined/null body stays null so the request is sent without one.
    const char* body = (argc > 4 && !JS_IsUndefined(argv[4]) && !JS_IsNull(argv[4]))
                           ? JS_ToCString(ctx, argv[4])
                           : nullptr;
    AndroidEngineInstance* owner = androidEngineCurrent();
    androidMobileFetchStart(owner ? owner->id : 0, (int)id, url, method, headers, body);
    if (body) JS_FreeCString(ctx, body);
    if (headers) JS_FreeCString(ctx, headers);
    if (method) JS_FreeCString(ctx, method);
    if (url) JS_FreeCString(ctx, url);
    return JS_UNDEFINED;
}

static JSValue JS_mobileFetchAbort(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    int32_t id = 0;
    JS_ToInt32(ctx, &id, argv[0]);
    AndroidEngineInstance* owner = androidEngineCurrent();
    androidMobileFetchAbort(owner ? owner->id : 0, (int)id);
    return JS_UNDEFINED;
}

static JSValue JS_devtoolsActive(JSContext* ctx, JSValue, int, JSValueConst*) {
    return JS_NewBool(ctx, rayact::devtoolsActiveForContext(ctx));
}

static JSValue JS_devtoolsNetwork(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_UNDEFINED;
    const char* method = JS_ToCString(ctx, argv[0]);
    const char* params = JS_ToCString(ctx, argv[1]);
    rayact::devtoolsEmitNetwork(ctx, method, params);
    if (method) JS_FreeCString(ctx, method);
    if (params) JS_FreeCString(ctx, params);
    return JS_UNDEFINED;
}

static JSValue JS_devtoolsStoreNetworkBody(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_UNDEFINED;
    const char* requestId = JS_ToCString(ctx, argv[0]);
    size_t size = 0;
    uint8_t* bytes = JS_GetArrayBuffer(ctx, &size, argv[1]);
    if (requestId && bytes) {
        rayact::devtoolsStoreNetworkBody(ctx, requestId, reinterpret_cast<const char*>(bytes), size, true);
    } else if (requestId) {
        const char* body = JS_ToCStringLen(ctx, &size, argv[1]);
        if (body) {
            rayact::devtoolsStoreNetworkBody(ctx, requestId, body, size, false);
            JS_FreeCString(ctx, body);
        }
    }
    if (requestId) JS_FreeCString(ctx, requestId);
    return JS_UNDEFINED;
}

static JSValue JS_mobileWsOpen(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_NewInt32(ctx, 0);
    const char* url = JS_ToCString(ctx, argv[0]);
    AndroidEngineInstance* owner = androidEngineCurrent();
    int id = androidMobileWsOpen(owner ? owner->id : 0, url);
    if (url) JS_FreeCString(ctx, url);
    return JS_NewInt32(ctx, id);
}

static JSValue JS_mobileWsSend(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    int32_t id = 0;
    JS_ToInt32(ctx, &id, argc > 0 ? argv[0] : JS_UNDEFINED);
    const char* data = argc > 1 ? JS_ToCString(ctx, argv[1]) : nullptr;
    AndroidEngineInstance* owner = androidEngineCurrent();
    bool ok = androidMobileWsSend(owner ? owner->id : 0, (int)id, data);
    if (data) JS_FreeCString(ctx, data);
    return JS_NewBool(ctx, ok);
}

static JSValue JS_mobileWsClose(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    int32_t id = 0;
    int32_t code = 1000;
    JS_ToInt32(ctx, &id, argc > 0 ? argv[0] : JS_UNDEFINED);
    if (argc > 1 && !JS_IsUndefined(argv[1])) JS_ToInt32(ctx, &code, argv[1]);
    const char* reason = argc > 2 ? JS_ToCString(ctx, argv[2]) : nullptr;
    AndroidEngineInstance* owner = androidEngineCurrent();
    bool ok = androidMobileWsClose(owner ? owner->id : 0, (int)id, (int)code, reason);
    if (reason) JS_FreeCString(ctx, reason);
    return JS_NewBool(ctx, ok);
}

static JSValue JS_mobileWsPollEvents(JSContext* ctx, JSValue, int, JSValueConst*) {
    AndroidEngineInstance* owner = androidEngineCurrent();
    std::string events = androidMobileWsPollEvents(owner ? owner->id : 0);
    return JS_NewStringLen(ctx, events.data(), events.size());
}


static void installAndroidMobileNetworkBindings(JSContext* ctx) {
    if (!ctx) return;
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "__rayactNativeFetchText",
                      JS_NewCFunction(ctx, JS_mobileFetchText, "__rayactNativeFetchText", 1));
    JS_SetPropertyStr(ctx, global, "__rayactNativeFetchBytes",
                      JS_NewCFunction(ctx, JS_mobileFetchBytes, "__rayactNativeFetchBytes", 1));
    JS_SetPropertyStr(ctx, global, "__rayactNativeFetchStart",
                      JS_NewCFunction(ctx, JS_mobileFetchStart, "__rayactNativeFetchStart", 5));
    JS_SetPropertyStr(ctx, global, "__rayactNativeFetchAbort",
                      JS_NewCFunction(ctx, JS_mobileFetchAbort, "__rayactNativeFetchAbort", 1));
    JS_SetPropertyStr(ctx, global, "__rayactDevtoolsActive",
                      JS_NewCFunction(ctx, JS_devtoolsActive, "__rayactDevtoolsActive", 0));
    JS_SetPropertyStr(ctx, global, "__rayactDevtoolsNetwork",
                      JS_NewCFunction(ctx, JS_devtoolsNetwork, "__rayactDevtoolsNetwork", 2));
    JS_SetPropertyStr(ctx, global, "__rayactDevtoolsStoreNetworkBody",
                      JS_NewCFunction(ctx, JS_devtoolsStoreNetworkBody, "__rayactDevtoolsStoreNetworkBody", 2));
    JS_SetPropertyStr(ctx, global, "__rayactNativeWsOpen",
                      JS_NewCFunction(ctx, JS_mobileWsOpen, "__rayactNativeWsOpen", 1));
    JS_SetPropertyStr(ctx, global, "__rayactNativeWsSend",
                      JS_NewCFunction(ctx, JS_mobileWsSend, "__rayactNativeWsSend", 2));
    JS_SetPropertyStr(ctx, global, "__rayactNativeWsClose",
                      JS_NewCFunction(ctx, JS_mobileWsClose, "__rayactNativeWsClose", 3));
    JS_SetPropertyStr(ctx, global, "__rayactNativeWsPollEvents",
                      JS_NewCFunction(ctx, JS_mobileWsPollEvents, "__rayactNativeWsPollEvents", 0));
    JS_FreeValue(ctx, global);
    JSValue r = JS_Eval(ctx, rayact::kMobileNetworkPolyfill, strlen(rayact::kMobileNetworkPolyfill),
                        "android-mobile-network.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(r)) {
        JSValue exc = JS_GetException(ctx);
        const char* s = JS_ToCString(ctx, exc);
        LOGE("Android mobile network polyfill failed: %s", s ? s : "?");
        if (s) JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, exc);
    }
    JS_FreeValue(ctx, r);
}

static void pumpAndroidMobileNetwork(JSContext* ctx) {
    if (!ctx) return;
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue fn = JS_GetPropertyStr(ctx, global, "__rayactNativeNetworkDrain");
    if (JS_IsFunction(ctx, fn)) {
        JSValue r = JS_Call(ctx, fn, JS_UNDEFINED, 0, nullptr);
        if (JS_IsException(r)) {
            JSValue exc = JS_GetException(ctx);
            const char* s = JS_ToCString(ctx, exc);
            LOGE("Android mobile network drain failed: %s", s ? s : "?");
            if (s) JS_FreeCString(ctx, s);
            JS_FreeValue(ctx, exc);
        }
        JS_FreeValue(ctx, r);
    }
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, global);
}

static void callIntoHost_ReleaseSurface(int surfaceId) {
    AndroidEngineInstance* inst = androidEngineCurrent();
    if (inst) inst->callHostReleaseSurface(surfaceId);
}

static void callIntoHost_OrderSurfaces(const int* ids, int count) {
    AndroidEngineInstance* inst = androidEngineCurrent();
    if (inst) inst->callHostOrderSurfaces(ids, count);
}

static void surfaceToAndroid(const Surface& s, AndroidEngineSurface& out) {
    out.window = s.window;
    out.windowId = s.windowId;
    out.screenId = s.screenId;
    out.density = s.density;
    out.pendingWidth = s.pendingWidth;
    out.pendingHeight = s.pendingHeight;
    out.resizePending = s.resizePending;
    out.ownsContext = s.ownsContext;
}

static void surfaceFromAndroid(const AndroidEngineSurface& s, Surface& out) {
    out.window = s.window;
    out.windowId = s.windowId;
    out.screenId = s.screenId;
    out.density = s.density;
    out.pendingWidth = s.pendingWidth;
    out.pendingHeight = s.pendingHeight;
    out.resizePending = s.resizePending;
    out.ownsContext = s.ownsContext;
}

void androidEngineLoadInstanceState(AndroidEngineInstance* inst) {
    if (!inst) return;
    g_engineReady = inst->engineReady;
    g_scriptExecuted = inst->scriptExecuted;
    g_scriptReloadRequested = inst->scriptReloadRequested;
    g_realDensity = inst->realDensity;
    g_pendingScriptMode = inst->pendingScriptMode;
    g_pendingScript = inst->pendingScript;
    g_pendingBytecode = inst->pendingBytecode;
    g_dataPath = inst->dataPath;
    g_rootScreenId = inst->rootScreenId;
    g_surfaces.clear();
    for (auto& [id, s] : inst->surfaces) {
        Surface surf;
        surfaceFromAndroid(s, surf);
        g_surfaces[id] = surf;
    }
    g_pendingBackPress.store(inst->pendingBackPress.load());
    g_finishActivityRequested.store(inst->finishActivityRequested.load());
    g_exitAppRequested.store(inst->exitAppRequested.load());
    g_pendingDevMenuToggle.store(inst->pendingDevMenuToggle.load());
    {
        std::lock_guard<std::mutex> lock(inst->textUpdateMutex);
        g_pendingTextUpdates.clear();
        for (auto& [k, v] : inst->pendingTextUpdates) g_pendingTextUpdates[k] = v;
    }
    g_pendingImeBlur.store(inst->pendingImeBlur.load());
    // Insets are NOT swapped: they are process-global device truth and each
    // instance self-syncs from it in the publish block. Nothing to load here.
    g_imeNodeId.store(inst->imeNodeId.load());
}

void androidEngineSaveInstanceState(AndroidEngineInstance* inst) {
    if (!inst) return;
    inst->engineReady = g_engineReady;
    inst->scriptExecuted = g_scriptExecuted;
    inst->scriptReloadRequested = g_scriptReloadRequested;
    inst->realDensity = g_realDensity;
    inst->pendingScriptMode = g_pendingScriptMode;
    inst->pendingScript = g_pendingScript;
    inst->pendingBytecode = g_pendingBytecode;
    inst->dataPath = g_dataPath;
    inst->rootScreenId = g_rootScreenId;
    inst->surfaces.clear();
    for (auto& [id, s] : g_surfaces) {
        AndroidEngineSurface as;
        surfaceToAndroid(s, as);
        inst->surfaces[id] = as;
    }
    inst->pendingBackPress.store(g_pendingBackPress.load());
    inst->finishActivityRequested.store(g_finishActivityRequested.load());
    inst->exitAppRequested.store(g_exitAppRequested.load());
    inst->pendingDevMenuToggle.store(g_pendingDevMenuToggle.load());
    {
        std::lock_guard<std::mutex> lock(inst->textUpdateMutex);
        inst->pendingTextUpdates = g_pendingTextUpdates;
    }
    inst->pendingImeBlur.store(g_pendingImeBlur.load());
    // Insets are process-global device truth — not saved per instance.
    inst->imeNodeId.store(g_imeNodeId.load());
}

struct InstanceScope {
    AndroidEngineInstance* inst = nullptr;
    bool switched = false;
    explicit InstanceScope(jlong handle) {
        inst = androidEngineInstanceFromHandle(handle);
        if (!inst) return;
        // Fast path: instance already current. The process globals are the
        // authoritative state, so there is nothing to swap — and swapping
        // here (unlocked, often on the UI thread, e.g. per touch event) used
        // to rebuild g_surfaces while a render frame iterated it.
        if (androidEngineCurrent() == inst) return;
        // Cross-instance switch: must not interleave with an in-flight frame.
        std::lock_guard<std::mutex> lock(g_engineMutex);
        inst->setCurrent();
        switched = true;
    }
    ~InstanceScope() {
        if (inst && switched) {
            std::lock_guard<std::mutex> lock(g_engineMutex);
            androidEngineSaveInstanceState(inst);
        }
    }
};

static bool g_processBooted = false;

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

void AndroidKeyboard_ShowForNode(int nodeId, const std::string& inputType,
                                 bool autocorrect, bool secure,
                                 const std::string& imeAction,
                                 const std::string& autoCapitalize,
                                 bool contextMenuHidden) {
    const int prevNode = g_imeNodeId.load();
    g_imeNodeId.store(nodeId);
    if (nodeId == -2 && prevNode != -2) {
        std::lock_guard<std::mutex> lock(g_globalImeMutex);
        g_globalImeText.clear();
    }
    // Called from render thread which already holds g_engineMutex — no re-lock.
    std::string value;
    {
        auto it = g_nodes.find(nodeId);
        if (it != g_nodes.end() && it->second->textInput.value)
            value = *it->second->textInput.value;
    }
    AndroidEngineInstance* inst = androidEngineCurrent();
    if (!inst) return;
    const char* method = (prevNode >= 0 && prevNode != nodeId) ? "switchIme" : "showSoftKeyboard";
    inst->callHostIme(method, nodeId, value, inputType, autocorrect, secure, imeAction,
                      autoCapitalize, contextMenuHidden);
}

void AndroidKeyboard_Hide() {
    g_imeNodeId.store(-1);
    {
        std::lock_guard<std::mutex> lock(g_globalImeMutex);
        g_globalImeText.clear();
    }
    AndroidEngineInstance* inst = androidEngineCurrent();
    if (inst) inst->callHostVoid("hideSoftKeyboard");
}

extern "C" JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeSetTextInputContent(
    JNIEnv* env, jclass, jlong handle, jint nodeId, jstring text, jint selectionStart,
    jint selectionEnd, jint composingStart, jint composingEnd) {
    InstanceScope scope(handle);
    const char* s = env->GetStringUTFChars(text, nullptr);
    if (!s) return;
    std::string str(s);
    env->ReleaseStringUTFChars(text, s);
    if (nodeId == -2) {
        if (composingStart >= 0 && composingEnd >= composingStart) return;
        std::lock_guard<std::mutex> globalLock(g_globalImeMutex);
        size_t prefix = 0;
        while (prefix < g_globalImeText.size() && prefix < str.size() &&
               g_globalImeText[prefix] == str[prefix]) {
            ++prefix;
        }
        for (size_t i = prefix; i < g_globalImeText.size(); ++i) {
            if ((static_cast<unsigned char>(g_globalImeText[i]) & 0xc0) != 0x80)
                rayact::engineQueueKeyEvent(0, "Backspace", "Backspace", nullptr,
                                            false, false, false, false, false);
        }
        if (str.size() > prefix) {
            const std::string added = str.substr(prefix);
            rayact::engineQueueKeyEvent(2, nullptr, nullptr, added.c_str(),
                                        false, false, false, false, false);
        }
        g_globalImeText = str;
        return;
    }
    // QuickJS is render-thread-only. Queue the update; drain on render thread.
    std::lock_guard<std::mutex> lock(g_textUpdateMutex);
    int byteSelectionStart = utf16OffsetToUtf8Byte(str, (int)selectionStart);
    int byteSelectionEnd = utf16OffsetToUtf8Byte(str, (int)selectionEnd);
    int byteComposingStart = utf16OffsetToUtf8Byte(str, (int)composingStart);
    int byteComposingEnd = utf16OffsetToUtf8Byte(str, (int)composingEnd);
    g_pendingTextUpdates[(int)nodeId] = {
        std::move(str), byteSelectionStart, byteSelectionEnd,
        byteComposingStart, byteComposingEnd};
}

extern "C" JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeBlurTextInput(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    g_pendingImeBlur.store(true, std::memory_order_release);
}

extern "C" JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeSubmitTextInput(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    g_pendingImeSubmit.store(true, std::memory_order_release);
}

extern "C" JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeImeHiddenBySystem(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    g_imeNodeId.store(-1, std::memory_order_release);
}

// Render thread → Kotlin: keep the IME InputConnection in sync with native
// editing-state changes.
void AndroidKeyboard_UpdateSelection(int nodeId, int selectionStart,
                                     int selectionEnd, int composingStart,
                                     int composingEnd,
                                     const char* fullTextIfChanged) {
    if (g_imeNodeId.load() != nodeId) return;
    std::string textForOffsets;
    if (fullTextIfChanged) {
        textForOffsets = fullTextIfChanged;
    } else {
        auto it = g_nodes.find(nodeId);
        if (it != g_nodes.end() && it->second->textInput.value)
            textForOffsets = *it->second->textInput.value;
    }
    int u16SelectionStart = utf8ByteToUtf16Offset(textForOffsets, selectionStart);
    int u16SelectionEnd = utf8ByteToUtf16Offset(textForOffsets, selectionEnd);
    int u16ComposingStart = utf8ByteToUtf16Offset(textForOffsets, composingStart);
    int u16ComposingEnd = utf8ByteToUtf16Offset(textForOffsets, composingEnd);
    AndroidEngineInstance* inst = androidEngineCurrent();
    if (inst) {
        inst->callHostUpdateImeState(nodeId, u16SelectionStart, u16SelectionEnd,
                                     u16ComposingStart, u16ComposingEnd, fullTextIfChanged);
    }
}
extern "C" int rayactJniGetRootSurfaceId() {
    AndroidEngineInstance* inst = androidEngineCurrent();
    return inst ? inst->callHostInt("rootSurfaceId") : 0;
}
extern "C" void rayactJniReleaseTopSurface() {
    AndroidEngineInstance* inst = androidEngineCurrent();
    if (inst) inst->callHostVoid("releaseTopSurface");
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

    // Every jobject below is a LOCAL ref. This is called from the render
    // thread's native loop, not from a Java frame, so local refs are never
    // reclaimed on return and would accumulate until the 512-entry table
    // overflows (~85 unique emoji). A local frame bounds them per call.
    if (env->PushLocalFrame(32) != JNI_OK) {
        if (needDetach) g_jvm->DetachCurrentThread();
        return nullptr;
    }

    {
        // Only boot-classloader classes are used, so FindClass works from any
        // attached thread without needing the app's classloader.
        jclass bitmapClass = env->FindClass("android/graphics/Bitmap");
        jclass configClass = env->FindClass("android/graphics/Bitmap$Config");
        jclass paintClass  = env->FindClass("android/graphics/Paint");
        jclass canvasClass = env->FindClass("android/graphics/Canvas");
        jclass rectClass   = env->FindClass("android/graphics/Rect");
        if (!bitmapClass || !configClass || !paintClass || !canvasClass || !rectClass)
            goto done;

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

        jstring jtext = env->NewStringUTF(utf8);
        if (!jtext) goto done;
        const jint jtextLen = env->GetStringLength(jtext);

        // Center on the glyph's tight bounds, the same way the CoreText path
        // does. The previous fixed `baseline = px * 0.82` cut off clusters whose
        // ink sits outside that guess (flags, keycaps) and left others off-centre.
        jobject rect = env->NewObject(rectClass, env->GetMethodID(rectClass, "<init>", "()V"));
        if (!rect) goto done;
        env->CallVoidMethod(paint,
            env->GetMethodID(paintClass, "getTextBounds", "(Ljava/lang/String;IILandroid/graphics/Rect;)V"),
            jtext, (jint)0, jtextLen, rect);
        const jint bl = env->GetIntField(rect, env->GetFieldID(rectClass, "left", "I"));
        const jint bt = env->GetIntField(rect, env->GetFieldID(rectClass, "top", "I"));
        const jint br = env->GetIntField(rect, env->GetFieldID(rectClass, "right", "I"));
        const jint bb = env->GetIntField(rect, env->GetFieldID(rectClass, "bottom", "I"));
        const jint inkW = br - bl;
        const jint inkH = bb - bt;
        if (inkW <= 0 || inkH <= 0) goto done; // nothing to draw

        // Rect is relative to the drawing origin (baseline-left), with `top`
        // negative above the baseline, so these offsets place the ink box in the
        // middle of the square.
        const jfloat x = ((jfloat)px - (jfloat)inkW) * 0.5f - (jfloat)bl;
        const jfloat y = ((jfloat)px - (jfloat)inkH) * 0.5f - (jfloat)bt;

        jmethodID drawText = env->GetMethodID(canvasClass, "drawText",
            "(Ljava/lang/String;FFLandroid/graphics/Paint;)V");
        env->CallVoidMethod(canvas, drawText, jtext, x, y, paint);

        // Bitmap rows are top-origin and upright, matching the CBDT/PNG path
        // that GetCluster feeds to LoadTextureFromImage — no vertical flip.
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
        }
    }

done:
    // A pending Java exception makes the next JNI call from this thread abort
    // the process, so clear it here rather than letting it escape into the
    // render loop.
    if (env->ExceptionCheck()) {
        env->ExceptionClear();
        if (result) { std::free(result); result = nullptr; }
    }
    env->PopLocalFrame(nullptr);
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}
} // namespace

extern "C" {

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* /*reserved*/) {
    g_jvm = vm;
    // Rasterize emoji with the device's own emoji font (Paint/Canvas) instead of
    // bundling a 10.6 MB CBDT NotoColorEmoji — the same trade CoreText makes on
    // Apple and DirectWrite/D2D on Windows. Picks up whatever the OS ships
    // (COLRv1 on 13+). EmojiFont probes this backend before committing; on probe
    // failure there is no automatic CBDT fallback (apps can still loadEmoji()).
    raym3::v2::EmojiFont::Instance().SetRasterizer(AndroidRasterizeEmoji);
    installAndroidTextInputHostHooksOnce();
    // Let native subsystems (CDP inbound, later net) wake an idle render loop
    // from any thread. androidRequestRenderFrame targets the graphics-lease
    // holder (active instance) and is thread-safe.
    rayact::engineSetFrameWaker([]() { rayact::androidRequestRenderFrame(); });
    return JNI_VERSION_1_6;
}

// RayactMobileNetwork.nativeWakeRenderFrame() — the OkHttp callback thread calls
// this after enqueuing a WebSocket/fetch event so an idle app schedules a frame
// to deliver it promptly (e.g. CDP commands over the /rayact/debugger uplink).
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactMobileNetwork_nativeWakeRenderFrame(JNIEnv*, jclass, jlong owner) {
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(owner);
    if (inst) inst->callHostVoid("requestRenderFrame");
}

// ─── external (platform) views: host side ────────────────────────────────────
// Bridge callbacks run on the render thread (under g_engineMutex); they
// forward to Kotlin static up-calls (com.rayact.engine.RayactPlatformViewsKt)
// which post to the main thread. Frames come back via
// nativePushExternalViewFrame (main thread) and are drained in the JS pump.

#include <android/hardware_buffer.h>
#include <android/hardware_buffer_jni.h>
extern "C" unsigned int rlvkLoadTextureFromHardwareBuffer(AHardwareBuffer* buffer);
extern "C" void rlUnloadTexture(unsigned int id);

// Generic Kotlin static up-call (attaches the calling thread if needed).
static void callPlatformViewsKt(const char* method, const char* sig,
                                const std::function<void(JNIEnv*, jclass, jmethodID)>& invoke) {
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
    jclass cls = env->FindClass("com/rayact/engine/RayactPlatformViewsKt");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, method, sig);
        if (m) invoke(env, cls, m);
        else LOGE("RayactPlatformViewsKt.%s%s not found", method, sig);
        env->DeleteLocalRef(cls);
    } else {
        env->ExceptionClear();
        LOGE("RayactPlatformViewsKt class not found");
    }
    if (needDetach) g_jvm->DetachCurrentThread();
}

class AndroidExternalViewEmbedder final
    : public raym3::v2::ExternalViewEmbedder {
public:
    void BeginFrame(uint64_t surfaceId, Rectangle bounds,
                    float density) override {
        selectedOverlayId_ = 0;
        targetChanged_ = false;
        callPlatformViewsKt("platformViewsBeginFrameFromHost", "(IFFF)V",
            [&](JNIEnv* env, jclass cls, jmethodID method) {
                env->CallStaticVoidMethod(
                    cls, method, (jint)surfaceId,
                    bounds.width, bounds.height, density);
            });
    }

    bool CompositeExternalView(
        const raym3::v2::ExternalViewComposition& composition) override {
        std::ostringstream json;
        json << "{\"bounds\":{\"x\":"
             << raym3::v2::Density::RasterPixels(composition.bounds.x)
             << ",\"y\":"
             << raym3::v2::Density::RasterPixels(composition.bounds.y)
             << ",\"width\":"
             << raym3::v2::Density::RasterPixels(composition.bounds.width)
             << ",\"height\":"
             << raym3::v2::Density::RasterPixels(composition.bounds.height)
             << "},\"preservesFrameworkUnderlay\":"
             << (composition.preservesFrameworkUnderlay ? "true" : "false")
             << ",\"hitTestBehavior\":\"";
        switch (composition.hitTestBehavior) {
        case raym3::v2::ExternalViewHitTestBehavior::Transparent:
            json << "transparent"; break;
        case raym3::v2::ExternalViewHitTestBehavior::Translucent:
            json << "translucent"; break;
        default:
            json << "opaque"; break;
        }
        json << "\",\"mutators\":[";
        for (size_t index = 0; index < composition.mutators.size(); ++index) {
            if (index) json << ',';
            const auto& mutator = composition.mutators[index];
            json << '{';
            switch (mutator.kind) {
            case raym3::v2::ExternalViewMutatorKind::Transform:
                json << "\"kind\":\"transform\",\"matrix\":[";
                for (size_t m = 0; m < mutator.transform.size(); ++m) {
                    if (m) json << ',';
                    json << mutator.transform[m];
                }
                json << ']';
                break;
            case raym3::v2::ExternalViewMutatorKind::ClipRect:
            case raym3::v2::ExternalViewMutatorKind::ClipRoundedRect:
                json << "\"kind\":\""
                     << (mutator.kind ==
                                 raym3::v2::ExternalViewMutatorKind::ClipRect
                             ? "clipRect" : "clipRoundedRect")
                     << "\",\"rect\":{\"x\":"
                     << raym3::v2::Density::RasterPixels(mutator.rect.x)
                     << ",\"y\":"
                     << raym3::v2::Density::RasterPixels(mutator.rect.y)
                     << ",\"width\":"
                     << raym3::v2::Density::RasterPixels(mutator.rect.width)
                     << ",\"height\":"
                     << raym3::v2::Density::RasterPixels(mutator.rect.height)
                     << "},\"radius\":"
                     << raym3::v2::Density::RasterPixels(mutator.radius);
                break;
            case raym3::v2::ExternalViewMutatorKind::Opacity:
                json << "\"kind\":\"opacity\",\"opacity\":"
                     << mutator.opacity;
                break;
            }
            json << '}';
        }
        json << "],\"requiresOverlay\":"
             << (composition.requiresOverlay ? "true" : "false")
             << ",\"occludingRegions\":[";
        for (size_t i = 0; i < composition.occludingRegions.size(); ++i) {
            if (i) json << ',';
            const auto& occlusion = composition.occludingRegions[i];
            const Rectangle& r = occlusion.rect;
            json << "{\"x\":" << raym3::v2::Density::RasterPixels(r.x)
                 << ",\"y\":" << raym3::v2::Density::RasterPixels(r.y)
                 << ",\"width\":" << raym3::v2::Density::RasterPixels(r.width)
                 << ",\"height\":" << raym3::v2::Density::RasterPixels(r.height)
                 << ",\"radius\":"
                 << raym3::v2::Density::RasterPixels(occlusion.radius) << '}';
        }
        json << "]}";
        const std::string payload = json.str();
        jlong overlaySurfaceId = 0;
        callPlatformViewsKt(
            "platformViewCompositeFromHost",
            "(IILjava/lang/String;)J",
            [&](JNIEnv* env, jclass cls, jmethodID method) {
                jstring value = env->NewStringUTF(payload.c_str());
                overlaySurfaceId = env->CallStaticLongMethod(
                    cls, method, (jint)raym3::v2::Ctx().surfaceId,
                    (jint)composition.externalViewId, value);
                env->DeleteLocalRef(value);
            });
        if (overlaySurfaceId <= 0) return false;
        const uint64_t overlayId = static_cast<uint64_t>(overlaySurfaceId);
        targetChanged_ = selectedOverlayId_ != overlayId;
        if (!rlvkSelectSurface(overlayId)) return false;
        selectedOverlayId_ = overlayId;

        // One physical HCPP overlay represents all logical slices. At each
        // later native-view boundary, erase previously painted framework
        // content inside that view's final rectangle; subsequent framework
        // content then paints above it. This is the incremental equivalent of
        // Flutter's difference stencil for final platform-view bounds.
        if (!composition.preservesFrameworkUnderlay) {
            Rectangle clearBounds = {
                composition.bounds.x, composition.bounds.y,
                composition.bounds.width, composition.bounds.height
            };
            raym3::PushScissor(clearBounds);
            ClearBackground(BLANK);
            raym3::PopScissor();
        }
        return true;
    }

    bool RequiresClipReplay() const override { return targetChanged_; }

    void EndFrame(uint64_t surfaceId) override {
        callPlatformViewsKt("platformViewsEndFrameFromHost", "(I)V",
            [&](JNIEnv* env, jclass cls, jmethodID method) {
                env->CallStaticVoidMethod(cls, method, (jint)surfaceId);
            });
    }

    void OnGestureDecision(int externalViewId, bool accepted) override {
        callPlatformViewsKt("platformViewGestureDecisionFromHost", "(IIZ)V",
            [&](JNIEnv* env, jclass cls, jmethodID method) {
                env->CallStaticVoidMethod(
                    cls, method, (jint)raym3::v2::Ctx().surfaceId,
                    (jint)externalViewId, (jboolean)accepted);
            });
    }

private:
    uint64_t selectedOverlayId_ = 0;
    bool targetChanged_ = false;
};

static void externalViewRectChanged(int surfaceId, int nodeId, const char* kind,
                                    float x, float y, float w, float h) {
    // Convert layout-dp → raster px here, where the engine's density policy
    // lives; the Kotlin host then works in surface px (touch coords match).
    const float px = (float)raym3::v2::Density::RasterPixels(x);
    const float py = (float)raym3::v2::Density::RasterPixels(y);
    const float pw = (float)raym3::v2::Density::RasterPixels(w);
    const float ph = (float)raym3::v2::Density::RasterPixels(h);
    callPlatformViewsKt("platformViewRectFromHost", "(IILjava/lang/String;FFFF)V",
        [&](JNIEnv* env, jclass cls, jmethodID m) {
            jstring jk = env->NewStringUTF(kind ? kind : "");
            env->CallStaticVoidMethod(cls, m, (jint)surfaceId, (jint)nodeId,
                                      jk, px, py, pw, ph);
            env->DeleteLocalRef(jk);
        });
}

static void externalViewCreate(int surfaceId, int nodeId, const char* kind, const char* propsJson) {
    callPlatformViewsKt("platformViewCreateFromHost",
                        "(IILjava/lang/String;Ljava/lang/String;)V",
        [&](JNIEnv* env, jclass cls, jmethodID m) {
            jstring jk = env->NewStringUTF(kind ? kind : "");
            jstring jp = env->NewStringUTF(propsJson ? propsJson : "{}");
            env->CallStaticVoidMethod(cls, m, (jint)surfaceId,
                                      (jint)nodeId, jk, jp);
            env->DeleteLocalRef(jk);
            env->DeleteLocalRef(jp);
        });
}

static void externalViewInput(int surfaceId, int nodeId, int action, float lx, float ly) {
    (void)surfaceId;
    callPlatformViewsKt("platformViewInputFromHost", "(IIFF)V",
        [&](JNIEnv* env, jclass cls, jmethodID m) {
            env->CallStaticVoidMethod(cls, m, (jint)nodeId, (jint)action, lx, ly);
        });
}

static void externalViewProps(int surfaceId, int nodeId, const char* propsJson) {
    (void)surfaceId;
    callPlatformViewsKt("platformViewPropsFromHost",
                        "(ILjava/lang/String;)V",
        [&](JNIEnv* env, jclass cls, jmethodID m) {
            jstring jp = env->NewStringUTF(propsJson ? propsJson : "{}");
            env->CallStaticVoidMethod(cls, m, (jint)nodeId, jp);
            env->DeleteLocalRef(jp);
        });
}

static void externalViewDispose(int surfaceId, int nodeId);

// Pending producer frames (main thread → JS-pump drain). One slot per node:
// a newer frame replaces an undrained older one.
static std::mutex g_pvFrameMutex;
static std::map<int, AHardwareBuffer*> g_pvPendingFrames;
// Pending editor event envelopes from EditText listeners. An ordered QUEUE,
// not a latest-wins slot: one TextWatcher pass emits change + selection +
// contentSize back-to-back, and a slot would clobber the change envelope
// before the pump drains ("typed but the label never floated").
static std::mutex g_pvTextMutex;
static std::vector<std::pair<int, std::string>> g_pvPendingText;

// Per-node import cache: ImageReader recycles a small buffer pool, so each
// AHardwareBuffer imports once and frames just swap which texture is bound.
struct PvTexEntry { unsigned int texId; int width; int height; };
static std::map<int, std::map<AHardwareBuffer*, PvTexEntry>> g_pvTexCache;

static void externalViewDispose(int surfaceId, int nodeId) {
    (void)surfaceId;
    {
        std::lock_guard<std::mutex> lk(g_pvFrameMutex);
        auto it = g_pvPendingFrames.find(nodeId);
        if (it != g_pvPendingFrames.end()) {
            if (it->second) AHardwareBuffer_release(it->second);
            g_pvPendingFrames.erase(it);
        }
    }
    {
        std::lock_guard<std::mutex> lk(g_pvTextMutex);
        g_pvPendingText.erase(
            std::remove_if(g_pvPendingText.begin(), g_pvPendingText.end(),
                           [&](const auto& e) { return e.first == nodeId; }),
            g_pvPendingText.end());
    }
    auto cit = g_pvTexCache.find(nodeId);
    if (cit != g_pvTexCache.end()) {
        for (auto& [ahb, entry] : cit->second) rlUnloadTexture(entry.texId);
        g_pvTexCache.erase(cit);
    }
    callPlatformViewsKt("platformViewDisposeFromHost", "(I)V",
        [&](JNIEnv* env, jclass cls, jmethodID m) {
            env->CallStaticVoidMethod(cls, m, (jint)nodeId);
        });
}

// Drain producer frames + text events. Called from the render-thread pump
// section under g_engineMutex (graphics + JS safe).
static void drainExternalViewEvents() {
    std::map<int, AHardwareBuffer*> frames;
    {
        std::lock_guard<std::mutex> lk(g_pvFrameMutex);
        frames.swap(g_pvPendingFrames);
    }
    for (auto& [nodeId, ahb] : frames) {
        if (!ahb) continue;
        auto& cache = g_pvTexCache[nodeId];
        auto it = cache.find(ahb);
        if (it == cache.end()) {
            const unsigned int texId = rlvkLoadTextureFromHardwareBuffer(ahb);
            if (texId == 0) { AHardwareBuffer_release(ahb); continue; }
            AHardwareBuffer_Desc d = {};
            AHardwareBuffer_describe(ahb, &d);
            it = cache.emplace(ahb, PvTexEntry{texId, (int)d.width, (int)d.height}).first;
            LOGI("externalView: imported frame buffer for node %d (tex=%u %ux%u, cache=%zu)",
                 nodeId, texId, d.width, d.height, cache.size());
            // Resize churn: cap the per-node cache (stale sizes evict oldest).
            if (cache.size() > 6) {
                auto evict = cache.begin();
                if (evict->first == ahb) ++evict;
                if (evict != cache.end()) {
                    rlUnloadTexture(evict->second.texId);
                    cache.erase(evict);
                }
            }
        }
        Texture2D tex = {};
        tex.id = it->second.texId;
        tex.width = it->second.width;
        tex.height = it->second.height;
        tex.mipmaps = 1;
        tex.format = PIXELFORMAT_UNCOMPRESSED_R8G8B8A8;
        rayactSetExternalViewTexture(nodeId, tex);
        AHardwareBuffer_release(ahb); // pending-slot ref; cache import holds its own
    }

    std::vector<std::pair<int, std::string>> texts;
    {
        std::lock_guard<std::mutex> lk(g_pvTextMutex);
        texts.swap(g_pvPendingText);
    }
    for (auto& [nodeId, text] : texts)
        rayactExternalViewEmitText(nodeId, text.c_str());
}

// Create a per-Activity engine session. Returns opaque handle (>0) or 0 on failure.
JNIEXPORT jlong JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeCreate(JNIEnv* env, jclass, jstring dataPath) {
    std::string dp = jstr(env, dataPath);
    jlong handle = androidEngineInstanceCreate(dp);
    if (handle == 0) return 0;
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    if (!inst) return 0;
    if (!inst->externalViewEmbedder)
        inst->externalViewEmbedder =
            std::make_unique<AndroidExternalViewEmbedder>();
    {
        if (!g_processBooted) {
            rayactSetExternalViewHostCallbacks(
                externalViewCreate, externalViewRectChanged, externalViewInput,
                externalViewProps, externalViewDispose);
            if (!dp.empty()) {
                RcoreAndroidSurface_SetDataPath(strdup(dp.c_str()));
                chdir(dp.c_str());
            }
            rayact::busSetJavaVM(g_jvm);
            rayact::kvStoreInit(dp);
            rayact::registerBuiltinKvModule();
            std::string libDir;
            Dl_info info;
            if (dladdr((void*)&Java_com_rayact_engine_RayactEngineSession_nativeCreate, &info) &&
                info.dli_fname) {
                std::string p = info.dli_fname;
                auto slash = p.rfind('/');
                if (slash != std::string::npos) libDir = p.substr(0, slash);
            }
            rayact::loadPlugins(libDir);
            g_processBooted = true;
        }
        g_dataPath = dp;
        g_engineReady = true;
    }
    LOGI("Rayact engine session created handle=%lld", (long long)handle);
    return handle;
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeRegisterHost(
    JNIEnv* env, jclass, jlong handle, jobject callbacks) {
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    if (inst) inst->registerHost(env, callbacks);
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeSetSystemAppearance(
    JNIEnv*, jclass, jlong handle, jboolean isDark) {
    if (!androidEngineInstanceFromHandle(handle)) return;
    rayactAndroidSetSystemDarkMode(isDark == JNI_TRUE);
}

JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeAcquireGraphics(JNIEnv*, jclass, jlong handle) {
    return androidEngineAcquireGraphics(handle) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeReleaseGraphics(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    androidEngineReleaseGraphics(handle);
}

// Reverse-call entry point for the JS-side __rayactHostRequestNewSurface.
// Allocates a new EGL surface + engine screen via the host (NavigationHost)
// and returns the new surfaceId, or 0 on failure.
JNIEXPORT jint JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeRequestNewSurface(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    return callIntoHost_RequestNewSurface();
}

// Queue application JS for load on the render thread (QuickJS is not thread-safe).
JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeLoadScript(JNIEnv* env, jclass, jlong handle, jint mode, jstring arg) {
    InstanceScope scope(handle);
    {
        // The render thread reads g_pendingScript inside executePendingScript
        // (under g_engineMutex); writing the std::string unlocked races it.
        std::lock_guard<std::mutex> lock(g_engineMutex);
        if (!g_engineReady) return JNI_FALSE;
        g_pendingScript = jstr(env, arg);
        g_pendingScriptMode = mode;
        if (g_scriptExecuted) g_scriptReloadRequested = true;
    }
    callIntoHost_VoidMethod("requestRenderFrameFromHost");
    return JNI_TRUE;
}

#if !RAYACT_RELEASE_HOST
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeToggleDevMenu(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    g_pendingDevMenuToggle.store(true, std::memory_order_release);
    callIntoHost_VoidMethod("requestRenderFrameFromHost");
}
#endif

JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeLoadBytecode(JNIEnv* env, jclass, jlong handle, jbyteArray bytes) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (!g_engineReady || !bytes) return JNI_FALSE;
    jsize len = env->GetArrayLength(bytes);
    g_pendingBytecode.resize((size_t)len);
    env->GetByteArrayRegion(bytes, 0, len, reinterpret_cast<jbyte*>(g_pendingBytecode.data()));
    g_pendingScriptMode = 2;
    return JNI_TRUE;
}

// Evaluate a queued application before Android attaches its SurfaceView. Dev
// bootstraps synchronously resolve their module graph through rayactDevFetch;
// doing that from nativeCreateSurface() blocks the Android main thread and can
// trigger an ANR on an ordinary Wi-Fi delay. Reserve the root engine screen here
// so host nodes are still associated with the surface that will be attached
// later, then perform all startup I/O on the caller's loader thread.
JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngineSession_nativePrepareScript(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    if (!g_engineReady) return JNI_FALSE;
    if (g_rootScreenId <= 0) {
        const int screenId = engineCreateScreen();
        if (screenId <= 0) {
            LOGE("nativePrepareScript: engineCreateScreen failed");
            return JNI_FALSE;
        }
        g_rootScreenId = screenId;
        engineBindScreenRoot(screenId);
    } else {
        engineBindScreenRoot(g_rootScreenId);
    }
    return executePendingScript() ? JNI_TRUE : JNI_FALSE;
}

#if !RAYACT_RELEASE_HOST
JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeApplyModuleUpdate(
    JNIEnv* env, jclass, jlong handle, jstring jPath, jstring jSource) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (!g_engineReady) return JNI_FALSE;
    g_pendingModulePath = jstr(env, jPath);
    g_pendingModuleSource = jstr(env, jSource);
    if (g_pendingModuleSource.empty()) return JNI_FALSE;
    g_pendingModuleUpdate.store(true, std::memory_order_release);
    callIntoHost_VoidMethod("requestRenderFrameFromHost");
    return JNI_TRUE;
}
#endif

// Create a new EGL surface + engine screen. Returns the surfaceId (== screenId)
// on success, or 0 on failure. The first call (no surfaces yet) brings up the
// EGL context via the legacy InitWindow path. Subsequent calls allocate extra
// surfaces via RcoreAndroidSurface_CreateWindow.
JNIEXPORT jint JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeCreateSurface(JNIEnv* env, jclass, jlong handle, jobject surface, jfloat density) {
    InstanceScope scope(handle);
    if (!g_engineReady) { LOGE("nativeCreateSurface: engine not ready"); return 0; }
    ANativeWindow* win = ANativeWindow_fromSurface(env, surface);
    if (!win) { LOGE("nativeCreateSurface: ANativeWindow_fromSurface returned null"); return 0; }

    {
        std::lock_guard<std::mutex> lock(g_engineMutex);
        int existingRootId = g_rootScreenId > 0 ? g_rootScreenId : callIntoHost_RootSurfaceId();
        if (g_scriptExecuted && g_surfaces.empty() && existingRootId > 0 && IsWindowReady()) {
            float layoutDensity = androidLayoutDensityForSurface(win, density);
            g_realDensity = density;
            engineBindScreenRoot(existingRootId);
            RcoreAndroidSurface_SetDensity(layoutDensity);
            setRaym3AndroidDensity(density, layoutDensity);

            // Fast path (RLVK): rebind the new window and recreate only the
            // VkSurface + swapchain. The Vulkan device survives, but font/icon
            // atlases can present stale/invalid contents on the first resumed
            // frame, so rebuild those GPU-backed caches deterministically.
            int windowId = RcoreAndroidSurface_ResumeWindow(win);
            if (windowId <= 0) {
                // Fallback: full graphics re-init (GLES path, or swapchain
                // recreation failure). This orphans device textures, so every
                // GPU-side cache must be dropped and rebuilt.
                LOGI("nativeCreateSurface: resume fast path unavailable, re-initializing");
                RcoreAndroidSurface_SetWindow(win);
                SetTargetFPS(0);
                SetConfigFlags(FLAG_MSAA_4X_HINT); // 4x MSAA on the swapchain pass (standard raylib opt-in)
                InitWindow(0, 0, "Rayact");
                if (!IsWindowReady()) {
                    LOGE("nativeCreateSurface: resume InitWindow failed");
                    ANativeWindow_release(win);
                    return 0;
                }
                raym3::FontManager::ResetDeviceCache();
                raym3::v2::IconRendererResetDeviceCache();
                raym3::v2::EmojiFont::Instance().ResetTextureCache();
                raym3::FontManager::Initialize();
                rayact::engineLoadConfig(g_dataPath.c_str());
                rayact::engineFinishLoad();
                windowId = RcoreAndroidSurface_GetCurrentId();
                if (windowId <= 0) windowId = 1;
            } else {
                raym3::FontManager::InvalidateLiveDeviceCache();
                raym3::v2::IconRendererInvalidateLiveDeviceCache();
                raym3::v2::EmojiFont::Instance().ResetTextureCache();
                raym3::FontManager::Initialize();
                rayact::engineLoadConfig(g_dataPath.c_str());
                rayact::engineResyncMaterialIcons();
            }
            Surface s;
            s.window = win;
            s.windowId = windowId;
            s.screenId = existingRootId;
            s.density = density;
            s.ownsContext = true;
            g_surfaces[existingRootId] = s;
            engineSetScreenStack({existingRootId});
            androidEngineSetGraphicsValid(true);
            LOGI("nativeCreateSurface: resumed root surfaceId=%d windowId=%d",
                 existingRootId, windowId);
            return (jint)existingRootId;
        }
    }

    // nativePrepareScript() may already have reserved and populated the root
    // screen on the loader thread. Reuse it for the first actual window.
    int screenId = (g_surfaces.empty() && g_rootScreenId > 0)
        ? g_rootScreenId
        : engineCreateScreen();
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
        layoutDensity = androidLayoutDensityForSurface(win, density);
        RcoreAndroidSurface_SetDensity(layoutDensity);
        SetTargetFPS(0);
        SetConfigFlags(FLAG_MSAA_4X_HINT); // 4x MSAA on the swapchain pass (standard raylib opt-in)
        InitWindow(0, 0, "Rayact");
        if (!IsWindowReady()) { LOGE("nativeCreateSurface: InitWindow failed"); ANativeWindow_release(win); return 0; }
        setRaym3AndroidDensity(density, layoutDensity);
        // Prior releaseGraphics may leave FontManager initialized_ with empty
        // caches; Reset+Initialize rebakes atlases against this GPU device.
        raym3::FontManager::ResetDeviceCache();
        raym3::v2::IconRendererResetDeviceCache();
        raym3::v2::EmojiFont::Instance().ResetTextureCache();
        raym3::FontManager::Initialize();
        rayact::engineLoadConfig(g_dataPath.c_str());
        rayact::engineResyncMaterialIcons();
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
    // Device + global raym3 caches are live again for every instance.
    androidEngineSetGraphicsValid(true);
    LOGI("nativeCreateSurface: surfaceId=%d windowId=%d (total=%zu)",
         screenId, windowId, g_surfaces.size());
    return (jint)screenId;
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeResizeSurface(
    JNIEnv*, jclass, jlong handle, jint surfaceId, jint width, jint height, jfloat density) {
    InstanceScope scope(handle);
    if (surfaceId <= 0 || width <= 0 || height <= 0) return;
    std::lock_guard<std::mutex> lock(g_engineMutex);
    auto it = g_surfaces.find(surfaceId);
    if (it == g_surfaces.end()) return;

    // Always record the resize: the swapchain and root layout must follow the
    // surface size so orientation changes reflow without app opt-in.
    g_realDensity = density;
    it->second.density = density;
    it->second.pendingWidth = (int)width;
    it->second.pendingHeight = (int)height;
    it->second.resizePending = true;
    LOGI("nativeResizeSurface: surface=%d %dx%d density=%.2f", surfaceId,
         (int)width, (int)height, density);
    rayact::engineRequestSurfaceRelayout(surfaceId);
}

JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeRelayoutOnSurfaceResizeEnabled(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    return rayact::engineRelayoutOnSurfaceResizeEnabled() ? JNI_TRUE : JNI_FALSE;
}

#if !RAYACT_RELEASE_HOST
// Chrome DevTools (CDP) attach for one engine instance. The dev-app calls
// this only for the PROJECT session, never the launcher, so chrome://inspect
// always lands on the loaded project.
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeEnableDevtools(
    JNIEnv* env, jclass, jlong handle, jstring title) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    JSContext* ctx = rayact::engineContext();
    if (!ctx) {
        LOGE("nativeEnableDevtools: no JS context yet");
        return;
    }
    std::string titleStr = "Rayact";
    if (title) {
        const char* s = env->GetStringUTFChars(title, nullptr);
        if (s) { titleStr = s; env->ReleaseStringUTFChars(title, s); }
    }
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    rayact::devtoolsEnableForContext(ctx, titleStr.c_str(), [](void* opaque, const char* message) {
        auto* target = static_cast<AndroidEngineInstance*>(opaque);
        if (target && message) target->callHostStringArg("sendDevtoolsMessage", message);
    }, inst);
    LOGI("nativeEnableDevtools: native transport attached title=%s", titleStr.c_str());
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeDevtoolsMessage(
    JNIEnv* env, jclass, jlong handle, jstring message) {
    InstanceScope scope(handle);
    const char* raw = message ? env->GetStringUTFChars(message, nullptr) : nullptr;
    JSContext* ctx = rayact::engineContext();
    if (ctx && raw) rayact::devtoolsInboundForContext(ctx, raw);
    if (message && raw) env->ReleaseStringUTFChars(message, raw);
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeDisableDevtools(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    JSContext* ctx = rayact::engineContext();
    if (ctx) rayact::devtoolsDetachContext(ctx);
}
#endif

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeSetSafeAreaInsets(
    JNIEnv*, jclass, jlong handle, jfloat top, jfloat right, jfloat bottom, jfloat left) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    // Insets arrive in real Android dp (px / DisplayMetrics.density).
    // Rescale to layout-dp (px / layoutDensity) so Yoga allocates the correct space.
    float layoutDensity = raym3::v2::Density::GetLayoutDensity();
    float scale = (layoutDensity > 0.0f && g_realDensity > 0.0f)
                  ? g_realDensity / layoutDensity : 1.0f;
    setSafeAreaInsets(top * scale, right * scale, bottom * scale, left * scale);
    {
        std::lock_guard<std::mutex> slock(g_deviceInsetsMutex);
        g_lastDeviceSafeArea[0] = top * scale;
        g_lastDeviceSafeArea[1] = right * scale;
        g_lastDeviceSafeArea[2] = bottom * scale;
        g_lastDeviceSafeArea[3] = left * scale;
    }
    // No dirty flag: each engine context self-syncs from g_lastDeviceSafeArea in
    // the publish block, so every live context picks the change up next frame.
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeSetKeyboardInsets(
    JNIEnv*, jclass, jlong handle, jfloat heightDp, jboolean visible, jfloat durationMs) {
    InstanceScope scope(handle);
    {
        std::lock_guard<std::mutex> lock(g_deviceInsetsMutex);
        g_lastDeviceKeyboard.heightDp = heightDp;
        g_lastDeviceKeyboard.visible = visible == JNI_TRUE;
        g_lastDeviceKeyboard.durationMs = durationMs;
    }
    // No dirty flag — see nativeSetSafeAreaInsets; contexts self-sync.
}

extern "C" JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativePushURL(
    JNIEnv* env, jclass, jstring url) {
    const std::string value = jstr(env, url);
    if (value.empty()) return;
    {
        std::lock_guard<std::mutex> lock(g_linkingMutex);
        g_pendingLinkingUrls.push_back(value);
    }
    androidEngineRequestGraphicsFrame();
}

// Destroy an EGL surface + engine screen. Idempotent.
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeDestroySurface(JNIEnv*, jclass, jlong handle, jint surfaceId) {
    InstanceScope scope(handle);
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
Java_com_rayact_engine_RayactEngineSession_nativePushSurface(JNIEnv*, jclass, jlong handle, jint surfaceId) {
    InstanceScope scope(handle);
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
Java_com_rayact_engine_RayactEngineSession_nativePopSurface(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    int top = engineGetFocusedScreenId();
    if (!enginePopScreen()) return 0;
    return (jint)top;
}

// Returns the currently focused surfaceId.
JNIEXPORT jint JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeGetFocusedSurfaceId(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    return (jint)engineGetFocusedScreenId();
}

// One frame: pump JS + render every visible screen. Called per Choreographer
// vsync on the render thread. Multiple surfaces each drive a render thread;
// we debounce by frame id so the engine only renders once per vsync.
// Publish the new window size (layout dp) to JS and fire the change callback.
// Same pattern as the insets globals: runs on the render thread under
// g_engineMutex, so plain JS calls are safe.
static void publishWindowDimensions(int widthPx, int heightPx) {
    JSContext* ctx = rayact::engineContext();
    if (!ctx) return;
    const float w = raym3::v2::Density::PxToDp((float)widthPx);
    const float h = raym3::v2::Density::PxToDp((float)heightPx);
    // Feed live viewport to the CSS engine (width/height/orientation @media) and
    // re-resolve className styles so responsive rules apply on rotation/resize
    // even for nodes that don't re-render in JS.
    raym3::Stylesheet::Global().SetViewport(w, h);
    refreshClassNameStyles(ctx);
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
            LOGE("__rayactOnDimensionsChange threw: %s", s ? s : "?");
            if (s) JS_FreeCString(ctx, s);
            JS_FreeValue(ctx, exc);
        }
        JS_FreeValue(ctx, r);
    }
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, global);
}

JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeRenderFrame(JNIEnv*, jclass, jlong handle,
                                                      jlong frameTimeNanos,
                                                      jlong deltaNanos) {
    (void)frameTimeNanos;
    std::lock_guard<std::mutex> lock(g_engineMutex);
    // Resolve + switch the instance under the SAME lock the frame renders
    // with, and gate on the graphics lease: a frame already queued on a
    // render thread that just lost the lease (Activity transition) must not
    // touch the torn-down Vulkan device.
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    if (!inst || !inst->graphicsActive.load(std::memory_order_acquire)) return JNI_FALSE;
    if (androidEngineCurrent() != inst) inst->setCurrent();
    if (g_surfaces.empty()) return JNI_FALSE;
    // graphicsActive is per-instance, but releaseGraphicsLocked tears down the
    // PROCESS-GLOBAL raym3 caches (FontManager/IconRenderer) + the device shared
    // by all instances. On the launcher↔project handoff a frame can be queued
    // with graphicsActive=true and IsWindowReady()=true (fast-resume keeps the
    // window) while those globals are reset, dereferencing null GPU state
    // (SIGSEGV in raym3::v2::Render). Gate on the global validity flag, cleared on
    // any release and re-set only when nativeCreateSurface rebuilds the caches.
    if (!androidEngineGraphicsValid()) return JNI_FALSE;

    int64_t now = RcoreAndroidSurface_NowNanos();
    if (now - inst->lastRenderFrameNanos < 1000000) return JNI_FALSE;
    inst->lastRenderFrameNanos = now;

    // The initial JS_Eval + React scheduling runs on the UI thread (surfaceCreated),
    // but this pump runs on the render thread. QuickJS captures the JS stack base
    // via JS_UpdateStackTop; if it was last set on the UI thread, the render
    // thread's unrelated stack pointer reads as a massive depth and QuickJS
    // throws "Maximum call stack size exceeded" on the first deep recursion
    // (React's mount), silently aborting it. Re-capture the stack base on THIS
    // thread before running any JS.
    rayact::enginePrepareJSThread();
    rayact::engineSetHostFrameTiming((double)deltaNanos / 1000000.0, 60.0);
    if (g_scriptReloadRequested && g_pendingScriptMode >= 0) {
        executePendingScript(true);
    }
#if !RAYACT_RELEASE_HOST
    if (g_pendingModuleUpdate.exchange(false, std::memory_order_acq_rel)) {
        if (!g_pendingModulePath.empty() && !g_pendingModuleSource.empty()) {
            rayact::engineApplyModuleUpdate(g_pendingModulePath, g_pendingModuleSource);
            g_pendingModulePath.clear();
            g_pendingModuleSource.clear();
        }
    }
    if (!rayact::engineContext()) return JNI_FALSE;
    if (g_pendingDevMenuToggle.exchange(false, std::memory_order_acq_rel)) {
        JSContext* menuCtx = rayact::engineContext();
        bool handled = false;
        if (menuCtx) {
            JSValue global = JS_GetGlobalObject(menuCtx);
            JSValue fn = JS_GetPropertyStr(menuCtx, global, "__rayactToggleDevMenu");
            if (JS_IsFunction(menuCtx, fn)) {
                JSValue r = JS_Call(menuCtx, fn, global, 0, nullptr);
                if (JS_IsException(r)) {
                    JSValue e = JS_GetException(menuCtx);
                    JS_FreeValue(menuCtx, e);
                }
                JS_FreeValue(menuCtx, r);
                handled = true;
            }
            JS_FreeValue(menuCtx, fn);
            JS_FreeValue(menuCtx, global);
        }
        if (!handled) callIntoHost_VoidMethod("toggleDevMenuFromHost");
    }
#endif
    rayact::enginePumpJS();
    pumpAndroidMobileNetwork(rayact::engineContext());

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
            rayactSetTextInputContent(nodeId, update.text.c_str(), update.selectionStart,
                                      update.selectionEnd, update.composingStart,
                                      update.composingEnd);
        }
    }

    if (g_pendingImeBlur.exchange(false, std::memory_order_acq_rel)) {
        rayactBlurFocusedTextInput();
    }
    if (g_pendingImeSubmit.exchange(false, std::memory_order_acq_rel)) {
        rayactSubmitFocusedTextInput();
    }

    // External-view producer frames (AHB import + texture swap) and EditText
    // text-change events.
    drainExternalViewEvents();

    {
        std::vector<std::string> urls;
        {
            std::lock_guard<std::mutex> lock(g_linkingMutex);
            urls.swap(g_pendingLinkingUrls);
        }
        JSContext* ctx = rayact::engineContext();
        if (ctx && !urls.empty()) {
            JSValue global = JS_GetGlobalObject(ctx);
            JSValue initial = JS_GetPropertyStr(ctx, global, "__rayactLinkingInitialURL");
            if (JS_IsUndefined(initial) || JS_IsNull(initial)) {
                JS_SetPropertyStr(ctx, global, "__rayactLinkingInitialURL",
                                  JS_NewString(ctx, urls.front().c_str()));
            }
            JS_FreeValue(ctx, initial);
            JSValue listener = JS_GetPropertyStr(ctx, global, "__rayactOnURL");
            const bool hasListener = JS_IsFunction(ctx, listener);
            JSValue queue = JS_GetPropertyStr(ctx, global, "__rayactPendingURLs");
            if (!JS_IsArray(queue)) {
                JS_FreeValue(ctx, queue);
                queue = JS_NewArray(ctx);
                JS_SetPropertyStr(ctx, global, "__rayactPendingURLs", JS_DupValue(ctx, queue));
            }
            for (const std::string& url : urls) {
                if (!hasListener) {
                    JSValue push = JS_GetPropertyStr(ctx, queue, "push");
                    JSValue value = JS_NewString(ctx, url.c_str());
                    JSValue pushed = JS_Call(ctx, push, queue, 1, &value);
                    JS_FreeValue(ctx, pushed);
                    JS_FreeValue(ctx, value);
                    JS_FreeValue(ctx, push);
                } else {
                    JSValue arg = JS_NewString(ctx, url.c_str());
                    JSValue result = JS_Call(ctx, listener, JS_UNDEFINED, 1, &arg);
                    JS_FreeValue(ctx, result);
                    JS_FreeValue(ctx, arg);
                }
            }
            JS_FreeValue(ctx, listener);
            JS_FreeValue(ctx, queue);
            JS_FreeValue(ctx, global);
        }
    }

    // Publish safe-area / keyboard insets to the CURRENT context's globalThis,
    // self-syncing from process-global device truth. Every frame we compare the
    // device values against what THIS instance last published and only rewrite
    // on change. No shared dirty edge → a freshly-activated project context can
    // never be starved by the launcher consuming the edge first (the dev-app
    // safe-area break). Runs on the render (JS) thread under g_engineMutex.
    {
        AndroidEngineInstance* inst = androidEngineCurrent();
        JSContext* ctx = inst ? rayact::engineContext() : nullptr;
        if (ctx) {
            float dev[4];
            PendingKeyboardInsets kb;
            {
                std::lock_guard<std::mutex> dlock(g_deviceInsetsMutex);
                for (int i = 0; i < 4; ++i) dev[i] = g_lastDeviceSafeArea[i];
                kb = g_lastDeviceKeyboard;
            }
            const bool safeAreaChanged =
                inst->publishedSafeArea[0] != dev[0] || inst->publishedSafeArea[1] != dev[1] ||
                inst->publishedSafeArea[2] != dev[2] || inst->publishedSafeArea[3] != dev[3];
            const bool keyboardChanged =
                !inst->publishedKeyboardValid ||
                inst->publishedKeyboard.heightDp != kb.heightDp ||
                inst->publishedKeyboard.visible != kb.visible ||
                inst->publishedKeyboard.durationMs != kb.durationMs;

            if (safeAreaChanged || keyboardChanged) {
                JSValue global = JS_GetGlobalObject(ctx);
                if (safeAreaChanged) {
                    JSValue obj = JS_NewObject(ctx);
                    JS_SetPropertyStr(ctx, obj, "top", JS_NewFloat64(ctx, dev[0]));
                    JS_SetPropertyStr(ctx, obj, "right", JS_NewFloat64(ctx, dev[1]));
                    JS_SetPropertyStr(ctx, obj, "bottom", JS_NewFloat64(ctx, dev[2]));
                    JS_SetPropertyStr(ctx, obj, "left", JS_NewFloat64(ctx, dev[3]));
                    JS_SetPropertyStr(ctx, global, "__rayactSafeAreaInsets", obj);
                    for (int i = 0; i < 4; ++i) inst->publishedSafeArea[i] = dev[i];
                }
                if (keyboardChanged) {
                    // Rescale real-dp height to layout-dp (same as safe area).
                    float layoutDensity = raym3::v2::Density::GetLayoutDensity();
                    float scale = (layoutDensity > 0.0f && g_realDensity > 0.0f)
                                  ? g_realDensity / layoutDensity : 1.0f;
                    JSValue obj = JS_NewObject(ctx);
                    JS_SetPropertyStr(ctx, obj, "visible", JS_NewBool(ctx, kb.visible));
                    JS_SetPropertyStr(ctx, obj, "height",
                                      JS_NewFloat64(ctx, kb.heightDp * scale));
                    JS_SetPropertyStr(ctx, obj, "duration",
                                      JS_NewFloat64(ctx, kb.durationMs));
                    JS_SetPropertyStr(ctx, global, "__rayactKeyboardInsets", obj);
                    inst->publishedKeyboard = kb;
                    inst->publishedKeyboardValid = true;
                }
                JSValue fn = JS_GetPropertyStr(ctx, global, "__rayactOnKeyboardInsetsChange");
            if (JS_IsFunction(ctx, fn)) {
                JSValue r = JS_Call(ctx, fn, JS_UNDEFINED, 0, nullptr);
                if (JS_IsException(r)) {
                    JSValue exc = JS_GetException(ctx);
                    const char* s = JS_ToCString(ctx, exc);
                    LOGE("__rayactOnKeyboardInsetsChange threw: %s", s ? s : "?");
                    if (s) JS_FreeCString(ctx, s);
                    JS_FreeValue(ctx, exc);
                }
                JS_FreeValue(ctx, r);
            }
            JS_FreeValue(ctx, fn);
            JS_FreeValue(ctx, global);
            }
        }
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
        callIntoHost_VoidMethod("finishActivityFromHost");
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
    for (const auto& [surfaceId, surface] : g_surfaces) {
        auto& context = engineGetScreenRenderContext(surfaceId);
        context.surfaceId = static_cast<uint64_t>(surfaceId);
        context.platformDensity = std::max(0.1f, surface.density);
        const int surfaceWidth =
            surface.pendingWidth > 0
                ? surface.pendingWidth
                : (surface.window
                       ? ANativeWindow_getWidth(surface.window)
                       : 0);
        context.layoutDensity =
            androidLayoutDensityForWidth(surfaceWidth, surface.density);
        context.externalViewEmbedder = inst->externalViewEmbedder.get();
    }

    // Per-surface bind → render pass → swap. Each SurfaceView owns one Android
    // native window and one engine screen; Android composites the windows in
    // ViewGroup z-order. Render only the matching screen into the bound window
    // and consume queued touch only on the focused surface.
    for (int id : ordered) {
        auto& s = g_surfaces[id];
        RcoreAndroidSurface_BindWindow(s.windowId);
        bool resized = false;
        if (s.resizePending) {
            const int resizeW = s.pendingWidth;
            const int resizeH = s.pendingHeight;
            s.resizePending = false;
            if (resizeW > 0 && resizeH > 0) {
                const float layoutDensity = androidLayoutDensityForWidth(resizeW, s.density);
                RcoreAndroidSurface_SetDensity(layoutDensity);
                if (!RcoreAndroidSurface_ResizeWindow(s.windowId, resizeW, resizeH)) {
                    LOGE("RcoreAndroidSurface_ResizeWindow(%d, %d, %d) failed",
                         s.windowId, resizeW, resizeH);
                }
                setRaym3AndroidDensity(s.density, layoutDensity);
                LOGI("renderFrame: consumed resize surface=%d %dx%d layoutDensity=%.2f",
                     id, resizeW, resizeH, layoutDensity);
                resized = true;
            }
        }
        if (resized) publishWindowDimensions(s.pendingWidth, s.pendingHeight);
        // Pass the bound window's REAL pixel size. (Previously this passed
        // s.windowId for both width and height — a 1x1 layout area, so every
        // node clipped to nothing and the frame drew zero vertices.)
        int w = s.pendingWidth > 0 ? s.pendingWidth : (s.window ? ANativeWindow_getWidth(s.window) : 0);
        int h = s.pendingHeight > 0 ? s.pendingHeight : (s.window ? ANativeWindow_getHeight(s.window) : 0);
        if (w <= 0 || h <= 0) { w = GetRenderWidth(); h = GetRenderHeight(); }
        rayact::engineRenderFrameAndroid(id, w, h);
        RcoreAndroidSurface_SwapWindow();
    }
    // Pending queued touch events are a frame source: the platform drains at
    // most one DOWN/UP edge per frame, so a buffered gesture needs follow-up
    // frames even after the last touch event (and its requestFrame) arrived.
    return (rayact::engineNeedsAnotherFrame() || RcoreAndroidSurface_HasPendingTouch())
               ? JNI_TRUE : JNI_FALSE;
}

// Milliseconds until the earliest pending JS timer fires (-1 = none). The
// Kotlin render thread uses this to schedule a delayed wakeup frame when the
// continuous loop stops — timers only tick inside the per-frame JS pump, so
// without this a future setTimeout/setInterval would never fire while idle.
JNIEXPORT jfloat JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeNextJSTimerDelayMs(JNIEnv*, jclass, jlong handle) {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    if (!inst) return -1.0f;
    if (androidEngineCurrent() != inst) inst->setCurrent();
    if (!rayact::engineContext()) return -1.0f;
    return (jfloat)nextJSTimerDelayMs();
}

// External-view producer frame (main thread). Acquires a reference on the
// AHardwareBuffer; the JS-pump drain imports/binds it and releases this ref.
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativePushExternalViewFrame(
    JNIEnv* env, jclass, jlong handle, jint nodeId, jobject hardwareBuffer) {
    InstanceScope scope(handle);
    AHardwareBuffer* ahb = AHardwareBuffer_fromHardwareBuffer(env, hardwareBuffer);
    if (!ahb) return;
    AHardwareBuffer_acquire(ahb);
    std::lock_guard<std::mutex> lk(g_pvFrameMutex);
    auto it = g_pvPendingFrames.find(nodeId);
    if (it != g_pvPendingFrames.end() && it->second) AHardwareBuffer_release(it->second);
    g_pvPendingFrames[nodeId] = ahb;
}

// Producer-surface content insets (px) — main thread, engine-locked.
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeSetExternalViewInsets(
    JNIEnv*, jclass, jlong handle, jint nodeId, jfloat l, jfloat t, jfloat r, jfloat b) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    rayactSetExternalViewTextureInsets(nodeId, l, t, r, b);
}

// EditText TextWatcher → JS onChangeText (drained in the pump).
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeExternalViewTextChanged(
    JNIEnv* env, jclass, jlong handle, jint nodeId, jstring text) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lk(g_pvTextMutex);
    g_pvPendingText.emplace_back(nodeId, jstr(env, text));
}

// Touch event from the UI thread. action: 0=down 1=up 2=move (RCORE_AS_TOUCH_*).
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeTouch(JNIEnv*, jclass, jlong handle, jint action, jint id, jfloat x, jfloat y) {
    InstanceScope scope(handle);
    RcoreAndroidSurface_PushTouch(action, id, x, y);
    rayact::engineQueueTouch((int)action, (int)id, (float)x, (float)y);
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeKeyEvent(
    JNIEnv* env, jclass, jlong handle, jint action, jstring keyValue,
    jstring codeValue, jstring textValue, jboolean repeat, jboolean ctrl,
    jboolean alt, jboolean shift, jboolean meta) {
    InstanceScope scope(handle);
    const char* key = keyValue ? env->GetStringUTFChars(keyValue, nullptr) : nullptr;
    const char* code = codeValue ? env->GetStringUTFChars(codeValue, nullptr) : nullptr;
    const char* text = textValue ? env->GetStringUTFChars(textValue, nullptr) : nullptr;
    rayact::engineQueueKeyEvent((int)action, key, code, text,
        repeat == JNI_TRUE, ctrl == JNI_TRUE, alt == JNI_TRUE,
        shift == JNI_TRUE, meta == JNI_TRUE);
    if (key) env->ReleaseStringUTFChars(keyValue, key);
    if (code) env->ReleaseStringUTFChars(codeValue, code);
    if (text) env->ReleaseStringUTFChars(textValue, text);
}

// Hardware-back press forwarded from the Kotlin OnBackPressedCallback.
// The flag is read in nativeRenderFrame (or wherever we next drain the JS
// queue); JS consumes it via globalThis.__rayactDrainBackPress and returns
// true (handled) or false (no listener handled it → fall back to finishing
// the Activity).
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeOnBackPressed(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    g_pendingBackPress.store(true, std::memory_order_release);
}

// Vulkan (rlvk) GPU frame timing + device name for the dev-tools Performance
// panel. Defined in rlvk.h (compiled into rcore_overlay.c, C linkage);
// declared extern here rather than including the whole rlvk/GLFW header into
// this C++ translation unit.
extern "C" double rlvkGetGpuFrameTimeMs(void);
extern "C" const char* rlvkGetGpuDeviceName(void);

JNIEXPORT jdouble JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeGetGpuFrameTimeMs(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    return (jdouble)rlvkGetGpuFrameTimeMs();
}

JNIEXPORT jstring JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeGetGpuDeviceName(JNIEnv* env, jclass, jlong handle) {
    InstanceScope scope(handle);
    return env->NewStringUTF(rlvkGetGpuDeviceName());
}

JNIEXPORT jstring JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeGetAccessibilitySnapshot(JNIEnv* env, jclass, jlong handle) {
    InstanceScope scope(handle);
    const std::string snapshot = rayact::accessibilityBridge().snapshotJson();
    return env->NewStringUTF(snapshot.c_str());
}

JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngineSession_nativePerformAccessibilityAction(
    JNIEnv*, jclass, jlong handle, jint nodeId) {
    InstanceScope scope(handle);
    return rayact::accessibilityBridge().activate(static_cast<uint32_t>(nodeId)) ? JNI_TRUE : JNI_FALSE;
}

// JS called __rayactHostExitApp. Schedule the Activity finish.
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeExitApp(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
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
Java_com_rayact_engine_RayactEngineSession_nativeSetScreenStack(JNIEnv* env, jclass, jlong handle, jintArray ids) {
    InstanceScope scope(handle);
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
Java_com_rayact_engine_RayactEngineSession_nativeSurfaceDestroyed(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    // No-op: surfaces are managed explicitly via nativeCreateSurface /
    // nativeDestroySurface. This entry point is kept for legacy callers
    // (the single-surface view) that don't use the multi-surface API.
    LOGI("nativeSurfaceDestroyed: no-op (surfaces are managed by create/destroy)");
}

JNIEXPORT jboolean JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeRegisterOverlaySurface(
    JNIEnv* env, jclass, jlong handle, jlong surfaceId, jobject surface,
    jint width, jint height) {
    if (!surface || surfaceId <= 0) return JNI_FALSE;
    std::lock_guard<std::mutex> lock(g_engineMutex);
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    if (!inst || !androidEngineGraphicsValid()) return JNI_FALSE;
    if (androidEngineCurrent() != inst) inst->setCurrent();
    ANativeWindow* window = ANativeWindow_fromSurface(env, surface);
    if (!window) return JNI_FALSE;
    const bool result = rlvkRegisterSurface(
        static_cast<uint64_t>(surfaceId), window, width, height);
    ANativeWindow_release(window);
    return result ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeResizeOverlaySurface(
    JNIEnv*, jclass, jlong handle, jlong surfaceId, jint width, jint height) {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    if (!inst || androidEngineCurrent() != inst) return;
    rlvkResizeRegisteredSurface(
        static_cast<uint64_t>(surfaceId), width, height);
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeUnregisterOverlaySurface(
    JNIEnv*, jclass, jlong handle, jlong surfaceId) {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    if (!inst || androidEngineCurrent() != inst) return;
    rlvkUnregisterSurface(static_cast<uint64_t>(surfaceId));
}

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeDestroy(JNIEnv* env, jclass, jlong handle) {
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    if (inst) {
        bool needDetach = false;
        JNIEnv* jenv = nullptr;
        if (attachEnv(&jenv, &needDetach)) {
            inst->releaseHost(jenv);
            if (needDetach) g_jvm->DetachCurrentThread();
        }
    }
    androidEngineInstanceDestroy(handle);
}

} // extern "C"

namespace rayact {

std::vector<uint8_t> androidFetchBytes(const char* url) {
    return androidMobileFetchBytes(url);
}

std::string androidPlatformCall(const char* module, const char* method, const char* payloadJson) {
    if (!g_jvm) return "{\"ok\":false,\"error\":\"Android runtime is unavailable\"}";
    JNIEnv* env = nullptr;
    bool needDetach = false;
    jint rs = g_jvm->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK)
            return "{\"ok\":false,\"error\":\"Could not attach Android runtime thread\"}";
        needDetach = true;
    } else if (rs != JNI_OK) {
        return "{\"ok\":false,\"error\":\"Could not access Android runtime\"}";
    }
    std::string result = "{\"ok\":false,\"error\":\"Platform registry is unavailable\"}";
    jclass cls = env->FindClass("com/rayact/engine/RayactPlatformRegistry");
    if (cls) {
        jmethodID call = env->GetStaticMethodID(
            cls,
            "platformCallFromNative",
            "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;");
        if (call) {
            jstring jModule = env->NewStringUTF(module ? module : "");
            jstring jMethod = env->NewStringUTF(method ? method : "");
            jstring jPayload = env->NewStringUTF(payloadJson ? payloadJson : "null");
            jstring jResult = (jstring)env->CallStaticObjectMethod(cls, call, jModule, jMethod, jPayload);
            if (jResult) {
                result = jstr(env, jResult);
                env->DeleteLocalRef(jResult);
            }
            env->DeleteLocalRef(jModule);
            env->DeleteLocalRef(jMethod);
            env->DeleteLocalRef(jPayload);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
        result = "{\"ok\":false,\"error\":\"Android platform module call failed\"}";
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

#if !RAYACT_RELEASE_HOST
std::string androidDevCall(const char* method, const char* dataJson) {
    if (!g_jvm) return "null";
    JNIEnv* env = nullptr;
    bool needDetach = false;
    jint rs = g_jvm->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) return "null";
        needDetach = true;
    } else if (rs != JNI_OK) {
        return "null";
    }
    std::string result = "null";
    jclass cls = env->FindClass("com/rayact/devclient/DevClientBridgeKt");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "devCallFromNative",
            "(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;");
        if (m) {
            jstring jMethod = env->NewStringUTF(method ? method : "");
            jstring jData = dataJson ? env->NewStringUTF(dataJson) : nullptr;
            jstring jResult = (jstring)env->CallStaticObjectMethod(cls, m, jMethod, jData);
            if (jResult) {
                result = jstr(env, jResult);
                env->DeleteLocalRef(jResult);
            }
            env->DeleteLocalRef(jMethod);
            if (jData) env->DeleteLocalRef(jData);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

// Error sentinel handed back to the JS module runtime. Mirrors
// DevServerLoader.DEV_FETCH_ERROR_PREFIX: leading "Error:" so ModuleHmrRuntime
// refuses to eval it as module source and shows it instead.
static const char* kDevFetchErrorPrefix = "Error: [rayact:devfetch]";

std::string androidDevFetch(const char* url) {
    if (!g_jvm || !url) return std::string(kDevFetchErrorPrefix) + " no JVM attached";
    JNIEnv* env = nullptr;
    bool needDetach = false;
    jint rs = g_jvm->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK)
            return std::string(kDevFetchErrorPrefix) + " could not attach the fetch thread to the JVM";
        needDetach = true;
    } else if (rs != JNI_OK) {
        return std::string(kDevFetchErrorPrefix) + " no JNI environment for this thread";
    }
    std::string result;
    std::string failure;
    jclass cls = env->FindClass("com/rayact/devclient/DevServerLoader");
    if (!cls) {
        // Clear before any further JNI call: a pending exception makes every
        // subsequent JNI call undefined behaviour, and CheckJNI aborts the
        // process outright rather than returning an error.
        if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
        failure = "DevServerLoader class not found";
    } else {
        jmethodID m = env->GetStaticMethodID(cls, "devFetchFromNative",
            "(Ljava/lang/String;)Ljava/lang/String;");
        if (!m) {
            if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
            failure = "DevServerLoader.devFetchFromNative missing";
        } else {
            jstring jUrl = env->NewStringUTF(url);
            jstring jResult = (jstring)env->CallStaticObjectMethod(cls, m, jUrl);
            // Check *immediately* after the call, before DeleteLocalRef.
            if (env->ExceptionCheck()) {
                env->ExceptionDescribe();
                env->ExceptionClear();
                failure = "dev fetch threw in Java";
            } else if (jResult) {
                result = jstr(env, jResult);
            } else {
                failure = "dev fetch returned no data";
            }
            if (jResult) env->DeleteLocalRef(jResult);
            if (jUrl) env->DeleteLocalRef(jUrl);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    if (!failure.empty()) {
        return std::string(kDevFetchErrorPrefix) + " " + failure + " (" + url + ")";
    }
    if (result.empty()) {
        // An empty body is never a valid module: evaluating it registers
        // nothing, the importer receives null, and the failure surfaces much
        // later as an unrelated TypeError.
        return std::string(kDevFetchErrorPrefix) + " empty response from " + url;
    }
    return result;
}

std::vector<uint8_t> androidDevFetchBytes(const char* url) {
    if (!g_jvm || !url) return {};
    JNIEnv* env = nullptr;
    bool needDetach = false;
    jint rs = g_jvm->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) return {};
        needDetach = true;
    } else if (rs != JNI_OK) {
        return {};
    }
    std::vector<uint8_t> result;
    jclass cls = env->FindClass("com/rayact/devclient/DevServerLoader");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "devFetchBytesFromNative",
            "(Ljava/lang/String;)[B");
        if (m) {
            jstring jUrl = env->NewStringUTF(url);
            jbyteArray jResult = (jbyteArray)env->CallStaticObjectMethod(cls, m, jUrl);
            if (jResult) {
                jsize len = env->GetArrayLength(jResult);
                if (len > 0) {
                    result.resize((size_t)len);
                    env->GetByteArrayRegion(jResult, 0, len,
                                            reinterpret_cast<jbyte*>(result.data()));
                }
                env->DeleteLocalRef(jResult);
            }
            env->DeleteLocalRef(jUrl);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}
#endif

} // namespace rayact
