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
#include <atomic>
#include <map>
#include <mutex>
#include <set>
#include <functional>
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
#include "../desktop/js_stdlib.hpp"
#include "android_engine_instance.hpp"
#include "engine_runtime.hpp"
#include <raym3/fonts/FontManager.h>
#include <raym3/v2/Density.h>
#include <raym3/v2/IconRenderer.h>
#include <raym3/v2/EmojiFont.h>
#include <raym3/v2/TextInput.h>

extern "C" {
#include "rcore_android_surface.h"   // RcoreAndroidSurface_* host hooks (from raylib-backends)
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
static std::atomic<int> g_imeNodeId{-1};

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
                                 const std::string& imeAction) {
    const int prevNode = g_imeNodeId.load();
    g_imeNodeId.store(nodeId);
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
    inst->callHostIme(method, nodeId, value, inputType, autocorrect, secure, imeAction);
}

void AndroidKeyboard_Hide() {
    g_imeNodeId.store(-1);
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
    // Prefer the bundled CBDT emoji font on Android. Some devices' Paint-based
    // fallback path rasterizes missing-glyph boxes for otherwise standard emoji,
    // while the bundled font is already shipped with the runtime assets.
    installAndroidTextInputHostHooksOnce();
    return JNI_VERSION_1_6;
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

static void externalViewRectChanged(int nodeId, const char* kind,
                                    float x, float y, float w, float h) {
    // Convert layout-dp → raster px here, where the engine's density policy
    // lives; the Kotlin host then works in surface px (touch coords match).
    const float px = (float)raym3::v2::Density::RasterPixels(x);
    const float py = (float)raym3::v2::Density::RasterPixels(y);
    const float pw = (float)raym3::v2::Density::RasterPixels(w);
    const float ph = (float)raym3::v2::Density::RasterPixels(h);
    callPlatformViewsKt("platformViewRectFromHost", "(ILjava/lang/String;FFFF)V",
        [&](JNIEnv* env, jclass cls, jmethodID m) {
            jstring jk = env->NewStringUTF(kind ? kind : "");
            env->CallStaticVoidMethod(cls, m, (jint)nodeId, jk, px, py, pw, ph);
            env->DeleteLocalRef(jk);
        });
}

static void externalViewInput(int nodeId, int action, float lx, float ly) {
    callPlatformViewsKt("platformViewInputFromHost", "(IIFF)V",
        [&](JNIEnv* env, jclass cls, jmethodID m) {
            env->CallStaticVoidMethod(cls, m, (jint)nodeId, (jint)action, lx, ly);
        });
}

static void externalViewProp(int nodeId, const char* key, const char* value) {
    callPlatformViewsKt("platformViewPropFromHost",
                        "(ILjava/lang/String;Ljava/lang/String;)V",
        [&](JNIEnv* env, jclass cls, jmethodID m) {
            jstring jkey = env->NewStringUTF(key ? key : "");
            jstring jval = env->NewStringUTF(value ? value : "");
            env->CallStaticVoidMethod(cls, m, (jint)nodeId, jkey, jval);
            env->DeleteLocalRef(jkey);
            env->DeleteLocalRef(jval);
        });
}

static void externalViewDispose(int nodeId);

// Pending producer frames (main thread → JS-pump drain). One slot per node:
// a newer frame replaces an undrained older one.
static std::mutex g_pvFrameMutex;
static std::map<int, AHardwareBuffer*> g_pvPendingFrames;
// Pending text-change events from EditText TextWatchers.
static std::mutex g_pvTextMutex;
static std::map<int, std::string> g_pvPendingText;

// Per-node import cache: ImageReader recycles a small buffer pool, so each
// AHardwareBuffer imports once and frames just swap which texture is bound.
struct PvTexEntry { unsigned int texId; int width; int height; };
static std::map<int, std::map<AHardwareBuffer*, PvTexEntry>> g_pvTexCache;

static void externalViewDispose(int nodeId) {
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
        g_pvPendingText.erase(nodeId);
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

    std::map<int, std::string> texts;
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
    {
        if (!g_processBooted) {
            rayactSetExternalViewHostCallbacks(externalViewRectChanged, externalViewInput,
                                               externalViewProp, externalViewDispose);
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

JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeToggleDevMenu(JNIEnv*, jclass, jlong handle) {
    InstanceScope scope(handle);
    g_pendingDevMenuToggle.store(true, std::memory_order_release);
    callIntoHost_VoidMethod("requestRenderFrameFromHost");
}

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
        if (g_scriptExecuted && g_surfaces.empty() && existingRootId > 0) {
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
        layoutDensity = androidLayoutDensityForSurface(win, density);
        RcoreAndroidSurface_SetDensity(layoutDensity);
        SetTargetFPS(0);
        InitWindow(0, 0, "Rayact");
        if (!IsWindowReady()) { LOGE("nativeCreateSurface: InitWindow failed"); ANativeWindow_release(win); return 0; }
        setRaym3AndroidDensity(density, layoutDensity);
        raym3::FontManager::Initialize();
        raym3::v2::IconRendererInvalidateLiveDeviceCache();
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
    (void)deltaNanos;
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
    if (g_scriptReloadRequested && g_pendingScriptMode >= 0) {
        executePendingScript(true);
    }
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
            rayactSetTextInputContent(nodeId, update.text.c_str(), update.selectionStart,
                                      update.selectionEnd, update.composingStart,
                                      update.composingEnd);
        }
    }

    if (g_pendingImeBlur.exchange(false, std::memory_order_acq_rel)) {
        rayactBlurFocusedTextInput();
    }

    // External-view producer frames (AHB import + texture swap) and EditText
    // text-change events.
    drainExternalViewEvents();

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
    g_pvPendingText[nodeId] = jstr(env, text);
}

// Touch event from the UI thread. action: 0=down 1=up 2=move (RCORE_AS_TOUCH_*).
JNIEXPORT void JNICALL
Java_com_rayact_engine_RayactEngineSession_nativeTouch(JNIEnv*, jclass, jlong handle, jint action, jint id, jfloat x, jfloat y) {
    InstanceScope scope(handle);
    RcoreAndroidSurface_PushTouch(action, id, x, y);
    rayact::engineQueueTouch((int)action, (int)id, (float)x, (float)y);
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

std::string androidDevFetch(const char* url) {
    if (!g_jvm || !url) return "";
    JNIEnv* env = nullptr;
    bool needDetach = false;
    jint rs = g_jvm->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) return "";
        needDetach = true;
    } else if (rs != JNI_OK) {
        return "";
    }
    std::string result;
    jclass cls = env->FindClass("com/rayact/devclient/DevServerLoader");
    if (cls) {
        jmethodID m = env->GetStaticMethodID(cls, "devFetchFromNative",
            "(Ljava/lang/String;)Ljava/lang/String;");
        if (m) {
            jstring jUrl = env->NewStringUTF(url);
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

} // namespace rayact
