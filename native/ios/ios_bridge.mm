#import <Foundation/Foundation.h>

#include "ios_bridge.hpp"

#include "ios_engine_instance.hpp"

#include "../core/rayact_module_abi.h"
#include "../core/engine.hpp"
#include "../desktop/async_storage.hpp"
#include "../desktop/dev_client_bridge.hpp"
#include "../desktop/js_stdlib.hpp"
#include "../desktop/kv_store.hpp"
#include "../desktop/module_bus.hpp"
#include "../desktop/plugin_loader.hpp"
#include "../desktop/raym3_bridge.hpp"
#include "../desktop/theme_bridge.hpp"

#include <raym3/fonts/FontManager.h>
#include <raym3/styles/Theme.h>
#include <raym3/v2/Density.h>
#include <raym3/v2/EmojiFont.h>
#include <raym3/v2/IconRenderer.h>
#include <raym3/v2/TextInput.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstring>
#include <map>
#include <mutex>
#include <string>
#include <vector>

extern "C" int rayact_module_register(const RayactHost* host);

extern "C" {
#include "quickjs.h"
void InitWindow(int width, int height, const char* title);
void CloseWindow(void);
int GetRenderWidth(void);
int GetRenderHeight(void);
bool IsWindowReady(void);
void SetTargetFPS(int fps);
void RcoreIosMetal_SetLayer(void* metalLayer, int widthPx, int heightPx, float scale);
void RcoreIosMetal_ResizeLayer(int widthPx, int heightPx, float scale);
}

#define LOGI(...) NSLog(__VA_ARGS__)
#define LOGE(...) NSLog(__VA_ARGS__)

std::mutex g_engineMutex;

namespace {

struct Surface {
    int windowId = 1;
    int screenId = 0;
    float density = 1.0f;
    int pendingWidth = 0;
    int pendingHeight = 0;
    bool resizePending = false;
    bool ownsContext = false;
};

bool g_engineReady = false;
bool g_scriptExecuted = false;
bool g_scriptReloadRequested = false;
float g_realDensity = 1.0f;
int g_pendingScriptMode = -1;
std::string g_pendingScript;
std::vector<uint8_t> g_pendingBytecode;
std::string g_dataPath;
std::map<int, Surface> g_surfaces;
int g_rootScreenId = 0;

std::atomic<bool> g_pendingModuleUpdate{false};
std::string g_pendingModulePath;
std::string g_pendingModuleSource;

std::atomic<bool> g_pendingBackPress{false};
std::atomic<bool> g_finishActivityRequested{false};
std::atomic<bool> g_exitAppRequested{false};
std::atomic<bool> g_pendingDevMenuToggle{false};

using PendingTextUpdate = IOSEngineInstance::PendingTextUpdate;
using PendingKeyboardInsets = IOSEngineInstance::PendingKeyboardInsets;
std::mutex g_textUpdateMutex;
std::map<int, PendingTextUpdate> g_pendingTextUpdates;
std::atomic<bool> g_pendingImeBlur{false};

std::mutex g_deviceInsetsMutex;
float g_lastDeviceSafeArea[4] = {0, 0, 0, 0};
PendingKeyboardInsets g_lastDeviceKeyboard;
std::mutex g_globalImeMutex;
std::string g_globalImeText;
std::atomic<int> g_imeNodeId{-1};

bool g_processBooted = false;

const char* (*g_iosDevCall)(const char*, const char*) = nullptr;
const char* (*g_iosDevFetch)(const char*) = nullptr;

static thread_local std::string g_clipboardReadBuffer;

void setRaym3Density(float realDensity, float layoutDensity) {
    raym3::v2::Density::SetPlatformDensity(realDensity);
    raym3::v2::Density::SetLayoutDensity(layoutDensity);
    raym3::FontManager::SetDpiScale(layoutDensity);
}

float layoutDensityForWidth(int surfaceWidth, float realDensity) {
    if (rayact::engineRelayoutOnSurfaceResizeEnabled()) return realDensity;
    return (surfaceWidth > 0) ? (float)surfaceWidth / 390.0f : realDensity;
}

bool executePendingScript(bool forceReload = false) {
    if (g_pendingScriptMode < 0) return g_scriptExecuted;
    if (g_scriptExecuted && !forceReload) return true;
    if (!rayact::engineContext()) return false;
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
    if (!ok) return false;
    g_scriptExecuted = true;
    g_scriptReloadRequested = false;
    return true;
}

static int callIntoHost_RequestNewSurface() {
    IOSEngineInstance* inst = iosEngineCurrent();
    return inst ? inst->callHostInt("requestNewSurface") : 0;
}

static int callIntoHost_TopSurfaceId() {
    IOSEngineInstance* inst = iosEngineCurrent();
    return inst ? inst->callHostInt("topSurfaceId") : 0;
}

static int callIntoHost_RootSurfaceId() {
    IOSEngineInstance* inst = iosEngineCurrent();
    return inst ? inst->callHostInt("rootSurfaceId") : 0;
}

static std::string callIntoHost_StringMethod(const char* methodName) {
    IOSEngineInstance* inst = iosEngineCurrent();
    return inst ? inst->callHostString(methodName) : std::string();
}

static void callIntoHost_VoidMethod(const char* methodName) {
    IOSEngineInstance* inst = iosEngineCurrent();
    if (!inst) return;
    inst->callHostVoid(methodName);
}

static void callIntoHost_ReleaseSurface(int surfaceId) {
    IOSEngineInstance* inst = iosEngineCurrent();
    if (inst) inst->callHostReleaseSurface(surfaceId);
}

static void callIntoHost_OrderSurfaces(const int* ids, int count) {
    IOSEngineInstance* inst = iosEngineCurrent();
    if (inst) inst->callHostOrderSurfaces(ids, count);
}

static void surfaceToIOS(const Surface& s, IOSEngineSurface& out) {
    out.windowId = s.windowId;
    out.screenId = s.screenId;
    out.density = s.density;
    out.pendingWidth = s.pendingWidth;
    out.pendingHeight = s.pendingHeight;
    out.resizePending = s.resizePending;
    out.ownsContext = s.ownsContext;
}

static void surfaceFromIOS(const IOSEngineSurface& s, Surface& out) {
    out.windowId = s.windowId;
    out.screenId = s.screenId;
    out.density = s.density;
    out.pendingWidth = s.pendingWidth;
    out.pendingHeight = s.pendingHeight;
    out.resizePending = s.resizePending;
    out.ownsContext = s.ownsContext;
}

struct InstanceScope {
    IOSEngineInstance* inst = nullptr;
    bool switched = false;
    explicit InstanceScope(int64_t handle) {
        inst = iosEngineInstanceFromHandle(handle);
        if (!inst) return;
        if (iosEngineCurrent() == inst) return;
        std::lock_guard<std::mutex> lock(g_engineMutex);
        inst->setCurrent();
        switched = true;
    }
    ~InstanceScope() {
        if (inst && switched) {
            std::lock_guard<std::mutex> lock(g_engineMutex);
            iosEngineSaveInstanceState(inst);
        }
    }
};

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

static void installTextInputHostHooksOnce() {
    static bool installed = false;
    if (installed) return;
    installed = true;
    raym3::v2::SetTextInputHostHooks({
        []() -> std::string { return callIntoHost_StringMethod("readClipboard"); },
        [](const std::string& text) {
            IOSEngineInstance* inst = iosEngineCurrent();
            if (inst) inst->callHostCopyToClipboard(text);
        },
        []() { callIntoHost_VoidMethod("performHapticFeedback"); }
    });
}

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
        if (JS_IsException(r)) JS_FreeValue(ctx, JS_GetException(ctx));
        JS_FreeValue(ctx, r);
    }
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, global);
}

} // namespace

void iosEngineLoadInstanceState(IOSEngineInstance* inst) {
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
        surfaceFromIOS(s, surf);
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
    g_imeNodeId.store(inst->imeNodeId.load());
}

void iosEngineSaveInstanceState(IOSEngineInstance* inst) {
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
        IOSEngineSurface is;
        surfaceToIOS(s, is);
        inst->surfaces[id] = is;
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
    inst->imeNodeId.store(g_imeNodeId.load());
}

extern "C" int rayactJniRequestNewSurface() { return callIntoHost_RequestNewSurface(); }
extern "C" void rayactJniReleaseSurface(int surfaceId) { callIntoHost_ReleaseSurface(surfaceId); }
extern "C" void rayactJniOrderSurfaces(const int* ids, int count) { callIntoHost_OrderSurfaces(ids, count); }
extern "C" int rayactJniGetRootSurfaceId() {
    IOSEngineInstance* inst = iosEngineCurrent();
    return inst ? inst->callHostInt("rootSurfaceId") : 0;
}
extern "C" void rayactJniReleaseTopSurface() { callIntoHost_VoidMethod("releaseTopSurface"); }
extern "C" void rayactJniExitApp() {
    g_exitAppRequested.store(true, std::memory_order_release);
    g_pendingBackPress.store(true, std::memory_order_release);
}
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

void AndroidKeyboard_ShowForNode(int nodeId, const std::string& inputType,
                                 bool autocorrect, bool secure,
                                 const std::string& imeAction) {
    const int prevNode = g_imeNodeId.load();
    g_imeNodeId.store(nodeId);
    if (nodeId == -2 && prevNode != -2) {
        std::lock_guard<std::mutex> lock(g_globalImeMutex);
        g_globalImeText.clear();
    }
    std::string value;
    {
        auto it = g_nodes.find(nodeId);
        if (it != g_nodes.end() && it->second->textInput.value)
            value = *it->second->textInput.value;
    }
    IOSEngineInstance* inst = iosEngineCurrent();
    if (!inst) return;
    const char* method = (prevNode >= 0 && prevNode != nodeId) ? "switchIme" : "showSoftKeyboard";
    inst->callHostIme(method, nodeId, value, inputType, autocorrect, secure, imeAction);
}

void AndroidKeyboard_Hide() {
    g_imeNodeId.store(-1);
    {
        std::lock_guard<std::mutex> lock(g_globalImeMutex);
        g_globalImeText.clear();
    }
    IOSEngineInstance* inst = iosEngineCurrent();
    if (inst) inst->callHostVoid("hideSoftKeyboard");
}

void AndroidKeyboard_UpdateSelection(int nodeId, int selectionStart, int selectionEnd,
                                     int composingStart, int composingEnd,
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
    IOSEngineInstance* inst = iosEngineCurrent();
    if (inst) {
        inst->callHostUpdateImeState(nodeId, u16SelectionStart, u16SelectionEnd,
                                    u16ComposingStart, u16ComposingEnd, fullTextIfChanged);
    }
}

extern "C" void RayactIOSSetDevCallbacks(
    const char* (*devCall)(const char*, const char*),
    const char* (*devFetch)(const char*)) {
    g_iosDevCall = devCall;
    g_iosDevFetch = devFetch;
}

extern "C" RayactIOSHandle RayactIOSSessionCreate(const char* dataPath) {
    std::string dp = dataPath ? dataPath : "";
    int64_t handle = iosEngineInstanceCreate(dp);
    if (handle == 0) return 0;
    IOSEngineInstance* inst = iosEngineInstanceFromHandle(handle);
    if (!inst) return 0;
    if (!g_processBooted) {
        if (!dp.empty()) chdir(dp.c_str());
        rayact::kvStoreInit(dp);
        rayact::registerBuiltinKvModule();
        rayact::loadPlugins("");
        rayact_module_register(rayact::busHost());
        installTextInputHostHooksOnce();
        g_processBooted = true;
    }
    g_dataPath = dp;
    g_engineReady = true;
    return handle;
}

extern "C" void RayactIOSSessionDestroy(RayactIOSHandle handle) {
    iosEngineInstanceDestroy(handle);
}

extern "C" void RayactIOSSessionRegisterHost(RayactIOSHandle handle, const RayactIOSHostCallbacks* callbacks) {
    IOSEngineInstance* inst = iosEngineInstanceFromHandle(handle);
    if (inst) inst->registerHost(callbacks);
}

extern "C" bool RayactIOSSessionAcquireGraphics(RayactIOSHandle handle) {
    return iosEngineAcquireGraphics(handle);
}

extern "C" void RayactIOSSessionReleaseGraphics(RayactIOSHandle handle) {
    InstanceScope scope(handle);
    iosEngineReleaseGraphics(handle);
}

extern "C" bool RayactIOSSessionLoadScript(RayactIOSHandle handle, int mode, const char* arg) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (!g_engineReady || !arg) return false;
    g_pendingScript = arg;
    g_pendingScriptMode = mode;
    if (g_scriptExecuted) g_scriptReloadRequested = true;
    callIntoHost_VoidMethod("requestRenderFrame");
    return true;
}

extern "C" void RayactIOSSessionToggleDevMenu(RayactIOSHandle handle) {
    InstanceScope scope(handle);
    g_pendingDevMenuToggle.store(true, std::memory_order_release);
    callIntoHost_VoidMethod("requestRenderFrame");
}

extern "C" bool RayactIOSSessionLoadBytecode(RayactIOSHandle handle, const uint8_t* bytes, int len) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (!g_engineReady || !bytes || len <= 0) return false;
    g_pendingBytecode.assign(bytes, bytes + len);
    g_pendingScriptMode = 2;
  callIntoHost_VoidMethod("requestRenderFrame");
    return true;
}

extern "C" bool RayactIOSSessionApplyModuleUpdate(RayactIOSHandle handle, const char* path, const char* source) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (!g_engineReady || !source) return false;
    g_pendingModulePath = path ? path : "";
    g_pendingModuleSource = source;
    if (g_pendingModuleSource.empty()) return false;
    g_pendingModuleUpdate.store(true, std::memory_order_release);
    callIntoHost_VoidMethod("requestRenderFrame");
    return true;
}

extern "C" int RayactIOSSessionCreateSurface(RayactIOSHandle handle, void* metalLayer, float density,
                                             int widthPx, int heightPx, float scale) {
    InstanceScope scope(handle);
    if (!g_engineReady || !metalLayer || widthPx <= 0 || heightPx <= 0) return 0;

    RcoreIosMetal_SetLayer(metalLayer, widthPx, heightPx, scale);

    std::lock_guard<std::mutex> lock(g_engineMutex);
    int existingRootId = g_rootScreenId > 0 ? g_rootScreenId : callIntoHost_RootSurfaceId();
    if (g_scriptExecuted && g_surfaces.empty() && existingRootId > 0) {
        float layoutDensity = layoutDensityForWidth(widthPx, density);
        g_realDensity = density;
        engineBindScreenRoot(existingRootId);
        setRaym3Density(density, layoutDensity);
        if (!IsWindowReady()) {
            SetTargetFPS(0);
            InitWindow(0, 0, "Rayact");
            if (!IsWindowReady()) return 0;
            raym3::FontManager::ResetDeviceCache();
            raym3::v2::IconRendererResetDeviceCache();
            raym3::v2::EmojiFont::Instance().ResetTextureCache();
            raym3::FontManager::Initialize();
            rayact::engineLoadConfig(g_dataPath.c_str());
            rayact::engineResyncMaterialIcons();
            rayact::engineFinishLoad();
        } else {
            RcoreIosMetal_ResizeLayer(widthPx, heightPx, scale);
            raym3::FontManager::InvalidateLiveDeviceCache();
            raym3::v2::IconRendererInvalidateLiveDeviceCache();
            raym3::v2::EmojiFont::Instance().ResetTextureCache();
            raym3::FontManager::Initialize();
            rayact::engineLoadConfig(g_dataPath.c_str());
            rayact::engineResyncMaterialIcons();
        }
        Surface s;
        s.screenId = existingRootId;
        s.density = density;
        s.pendingWidth = widthPx;
        s.pendingHeight = heightPx;
        s.ownsContext = true;
        g_surfaces[existingRootId] = s;
        engineSetScreenStack({existingRootId});
        iosEngineSetGraphicsValid(true);
        return existingRootId;
    }

    int screenId = engineCreateScreen();
    if (screenId <= 0) return 0;

    bool ownsContext = false;
    if (g_surfaces.empty()) {
        float layoutDensity = layoutDensityForWidth(widthPx, density);
        g_realDensity = density;
        engineBindScreenRoot(screenId);
        setRaym3Density(density, layoutDensity);
        if (!executePendingScript()) return 0;
        SetTargetFPS(0);
        InitWindow(0, 0, "Rayact");
        if (!IsWindowReady()) return 0;
        raym3::FontManager::Initialize();
        raym3::v2::IconRendererInvalidateLiveDeviceCache();
        rayact::engineLoadConfig(g_dataPath.c_str());
        rayact::engineFinishLoad();
        ownsContext = true;
        if (g_rootScreenId <= 0) g_rootScreenId = screenId;
    }

    Surface s;
    s.screenId = screenId;
    s.density = density;
    s.pendingWidth = widthPx;
    s.pendingHeight = heightPx;
    s.ownsContext = ownsContext;
    g_surfaces[screenId] = s;
    if (!engineHasScreenStack()) engineSetScreenStack({screenId});
    iosEngineSetGraphicsValid(true);
    return screenId;
}

extern "C" void RayactIOSSessionResizeSurface(RayactIOSHandle handle, int surfaceId, int width, int height, float density) {
    InstanceScope scope(handle);
    if (surfaceId <= 0 || width <= 0 || height <= 0) return;
    std::lock_guard<std::mutex> lock(g_engineMutex);
    auto it = g_surfaces.find(surfaceId);
    if (it == g_surfaces.end()) return;
    it->second.pendingWidth = width;
    it->second.pendingHeight = height;
    it->second.density = density;
    g_realDensity = density;
    it->second.resizePending = true;
    rayact::engineRequestSurfaceRelayout(surfaceId);
    RcoreIosMetal_ResizeLayer(width, height, density);
}

extern "C" bool RayactIOSSessionRelayoutOnSurfaceResizeEnabled(RayactIOSHandle handle) {
    InstanceScope scope(handle);
    return rayact::engineRelayoutOnSurfaceResizeEnabled();
}

extern "C" void RayactIOSSessionSetSafeAreaInsets(RayactIOSHandle handle, float top, float right, float bottom, float left) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    float layoutDensity = raym3::v2::Density::GetLayoutDensity();
    float scale = (layoutDensity > 0.0f && g_realDensity > 0.0f) ? g_realDensity / layoutDensity : 1.0f;
    setSafeAreaInsets(top * scale, right * scale, bottom * scale, left * scale);
    std::lock_guard<std::mutex> slock(g_deviceInsetsMutex);
    g_lastDeviceSafeArea[0] = top * scale;
    g_lastDeviceSafeArea[1] = right * scale;
    g_lastDeviceSafeArea[2] = bottom * scale;
    g_lastDeviceSafeArea[3] = left * scale;
}

extern "C" void RayactIOSSessionSetKeyboardInsets(RayactIOSHandle handle, float heightDp, bool visible, float durationMs) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_deviceInsetsMutex);
    g_lastDeviceKeyboard.heightDp = heightDp;
    g_lastDeviceKeyboard.visible = visible;
    g_lastDeviceKeyboard.durationMs = durationMs;
}

extern "C" void RayactIOSSessionKeyEvent(
    RayactIOSHandle handle, int type, const char* key, const char* code,
    const char* text, bool repeat, bool ctrl, bool alt, bool shift, bool meta) {
    InstanceScope scope(handle);
    rayact::engineQueueKeyEvent(type, key, code, text, repeat, ctrl, alt, shift, meta);
    if (auto* inst = iosEngineInstanceFromHandle(handle))
        inst->callHostVoid("requestRenderFrame");
}

extern "C" void RayactIOSSessionDestroySurface(RayactIOSHandle handle, int surfaceId) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    auto it = g_surfaces.find(surfaceId);
    if (it == g_surfaces.end()) return;
    const int hostRootId = callIntoHost_RootSurfaceId();
    const bool isRootSurface = (surfaceId == g_rootScreenId) || (hostRootId > 0 && surfaceId == hostRootId);
    const bool wasFocused = engineGetFocusedScreenId() == surfaceId;
    if (wasFocused && !isRootSurface) enginePopScreen();
    g_surfaces.erase(it);
    if (isRootSurface) {
        engineSetScreenStack({surfaceId});
    } else {
        engineDestroyScreen(surfaceId);
    }
}

extern "C" void RayactIOSSessionPushSurface(RayactIOSHandle handle, int surfaceId) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    enginePushScreen(surfaceId);
}

extern "C" int RayactIOSSessionPopSurface(RayactIOSHandle handle) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    int top = engineGetFocusedScreenId();
    if (!enginePopScreen()) return 0;
    return top;
}

extern "C" int RayactIOSSessionGetFocusedSurfaceId(RayactIOSHandle handle) {
    InstanceScope scope(handle);
    return engineGetFocusedScreenId();
}

extern "C" bool RayactIOSSessionRenderFrame(RayactIOSHandle handle, int64_t frameTimeNanos, int64_t deltaNanos) {
    (void)frameTimeNanos;
    (void)deltaNanos;
    std::lock_guard<std::mutex> lock(g_engineMutex);
    IOSEngineInstance* inst = iosEngineInstanceFromHandle(handle);
    if (!inst || !inst->graphicsActive.load(std::memory_order_acquire)) return false;
    if (iosEngineCurrent() != inst) inst->setCurrent();
    if (g_surfaces.empty()) return false;
    if (!iosEngineGraphicsValid()) return false;

    auto now = std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
    if (now - inst->lastRenderFrameNanos < 1000000) return false;
    inst->lastRenderFrameNanos = now;

    rayact::enginePrepareJSThread();
    if (g_scriptReloadRequested && g_pendingScriptMode >= 0) executePendingScript(true);
    if (g_pendingModuleUpdate.exchange(false, std::memory_order_acq_rel)) {
        if (!g_pendingModulePath.empty() && !g_pendingModuleSource.empty()) {
            rayact::engineApplyModuleUpdate(g_pendingModulePath, g_pendingModuleSource);
            g_pendingModulePath.clear();
            g_pendingModuleSource.clear();
        }
    }
    if (!rayact::engineContext()) return false;

    if (g_pendingDevMenuToggle.exchange(false, std::memory_order_acq_rel)) {
        JSContext* menuCtx = rayact::engineContext();
        bool handled = false;
        if (menuCtx) {
            JSValue global = JS_GetGlobalObject(menuCtx);
            JSValue fn = JS_GetPropertyStr(menuCtx, global, "__rayactToggleDevMenu");
            if (JS_IsFunction(menuCtx, fn)) {
                JSValue r = JS_Call(menuCtx, fn, global, 0, nullptr);
                if (JS_IsException(r)) JS_FreeValue(menuCtx, JS_GetException(menuCtx));
                JS_FreeValue(menuCtx, r);
                handled = true;
            }
            JS_FreeValue(menuCtx, fn);
            JS_FreeValue(menuCtx, global);
        }
        if (!handled) callIntoHost_VoidMethod("toggleDevMenu");
    }

    rayact::enginePumpJS();

    {
        std::map<int, PendingTextUpdate> updates;
        {
            std::lock_guard<std::mutex> tlock(g_textUpdateMutex);
            updates.swap(g_pendingTextUpdates);
        }
        for (auto& [nodeId, update] : updates) {
            rayactSetTextInputContent(nodeId, update.text.c_str(), update.selectionStart,
                                      update.selectionEnd, update.composingStart, update.composingEnd);
        }
    }
    if (g_pendingImeBlur.exchange(false, std::memory_order_acq_rel)) rayactBlurFocusedTextInput();

    {
        IOSEngineInstance* active = iosEngineCurrent();
        JSContext* ctx = active ? rayact::engineContext() : nullptr;
        if (ctx) {
            float dev[4];
            PendingKeyboardInsets kb;
            {
                std::lock_guard<std::mutex> dlock(g_deviceInsetsMutex);
                for (int i = 0; i < 4; ++i) dev[i] = g_lastDeviceSafeArea[i];
                kb = g_lastDeviceKeyboard;
            }
            const bool safeAreaChanged =
                active->publishedSafeArea[0] != dev[0] || active->publishedSafeArea[1] != dev[1] ||
                active->publishedSafeArea[2] != dev[2] || active->publishedSafeArea[3] != dev[3];
            const bool keyboardChanged =
                !active->publishedKeyboardValid ||
                active->publishedKeyboard.heightDp != kb.heightDp ||
                active->publishedKeyboard.visible != kb.visible ||
                active->publishedKeyboard.durationMs != kb.durationMs;
            if (safeAreaChanged || keyboardChanged) {
                JSValue global = JS_GetGlobalObject(ctx);
                if (safeAreaChanged) {
                    JSValue obj = JS_NewObject(ctx);
                    JS_SetPropertyStr(ctx, obj, "top", JS_NewFloat64(ctx, dev[0]));
                    JS_SetPropertyStr(ctx, obj, "right", JS_NewFloat64(ctx, dev[1]));
                    JS_SetPropertyStr(ctx, obj, "bottom", JS_NewFloat64(ctx, dev[2]));
                    JS_SetPropertyStr(ctx, obj, "left", JS_NewFloat64(ctx, dev[3]));
                    JS_SetPropertyStr(ctx, global, "__rayactSafeAreaInsets", obj);
                    for (int i = 0; i < 4; ++i) active->publishedSafeArea[i] = dev[i];
                }
                if (keyboardChanged) {
                    float layoutDensity = raym3::v2::Density::GetLayoutDensity();
                    float scale = (layoutDensity > 0.0f && g_realDensity > 0.0f)
                                  ? g_realDensity / layoutDensity : 1.0f;
                    JSValue obj = JS_NewObject(ctx);
                    JS_SetPropertyStr(ctx, obj, "visible", JS_NewBool(ctx, kb.visible));
                    JS_SetPropertyStr(ctx, obj, "height", JS_NewFloat64(ctx, kb.heightDp * scale));
                    JS_SetPropertyStr(ctx, obj, "duration", JS_NewFloat64(ctx, kb.durationMs));
                    JS_SetPropertyStr(ctx, global, "__rayactKeyboardInsets", obj);
                    active->publishedKeyboard = kb;
                    active->publishedKeyboardValid = true;
                }
                JSValue fn = JS_GetPropertyStr(ctx, global, "__rayactOnKeyboardInsetsChange");
                if (JS_IsFunction(ctx, fn)) {
                    JSValue r = JS_Call(ctx, fn, JS_UNDEFINED, 0, nullptr);
                    if (JS_IsException(r)) JS_FreeValue(ctx, JS_GetException(ctx));
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
            g_finishActivityRequested.store(true, std::memory_order_release);
        } else {
            JSContext* ctx = rayact::engineContext();
            if (ctx) {
                JSValue global = JS_GetGlobalObject(ctx);
                JSValue fn = JS_GetPropertyStr(ctx, global, "__rayactDrainBackPress");
                bool handled = false;
                if (JS_IsFunction(ctx, fn)) {
                    JSValue r = JS_Call(ctx, fn, JS_UNDEFINED, 0, nullptr);
                    if (JS_IsException(r)) JS_FreeValue(ctx, JS_GetException(ctx));
                    else handled = JS_ToBool(ctx, r) != 0;
                    JS_FreeValue(ctx, r);
                }
                JS_FreeValue(ctx, fn);
                JS_FreeValue(ctx, global);
                if (!handled) g_finishActivityRequested.store(true, std::memory_order_release);
            }
        }
    }

    if (g_finishActivityRequested.exchange(false, std::memory_order_acq_rel)) {
        callIntoHost_VoidMethod("finishActivity");
    }

    for (auto& [id, s] : g_surfaces) {
        if (!s.resizePending) continue;
        const int resizeW = s.pendingWidth;
        const int resizeH = s.pendingHeight;
        s.resizePending = false;
        if (resizeW > 0 && resizeH > 0) {
            const float layoutDensity = layoutDensityForWidth(resizeW, s.density);
            g_realDensity = s.density;
            setRaym3Density(s.density, layoutDensity);
            RcoreIosMetal_ResizeLayer(resizeW, resizeH, s.density);
            publishWindowDimensions(resizeW, resizeH);
        }
    }

    int w = 0, h = 0;
    for (auto& [id, s] : g_surfaces) {
        if (s.pendingWidth > 0 && s.pendingHeight > 0) {
            w = s.pendingWidth;
            h = s.pendingHeight;
            break;
        }
    }
    if (w <= 0 || h <= 0) {
        w = GetRenderWidth();
        h = GetRenderHeight();
    }
    if (w > 0 && h > 0) {
        if (engineHasScreenStack()) {
            for (auto& [id, s] : g_surfaces) {
                int sw = s.pendingWidth > 0 ? s.pendingWidth : w;
                int sh = s.pendingHeight > 0 ? s.pendingHeight : h;
                rayact::engineRenderFrameAndroid(id, sw, sh);
            }
        } else {
            rayact::engineRenderFrame(w, h);
        }
    }

    return rayact::engineNeedsAnotherFrame() ? true : false;
}

extern "C" float RayactIOSSessionNextJSTimerDelayMs(RayactIOSHandle handle) {
    std::lock_guard<std::mutex> lock(g_engineMutex);
    IOSEngineInstance* inst = iosEngineInstanceFromHandle(handle);
    if (!inst) return -1.0f;
    if (iosEngineCurrent() != inst) inst->setCurrent();
    if (!rayact::engineContext()) return -1.0f;
    return (float)nextJSTimerDelayMs();
}

extern "C" void RayactIOSSessionTouch(RayactIOSHandle handle, int action, int id, float x, float y) {
    InstanceScope scope(handle);
    rayact::engineQueueTouch(action, id, x, y);
    callIntoHost_VoidMethod("requestRenderFrame");
}

extern "C" void RayactIOSSessionOnBackPressed(RayactIOSHandle handle) {
    InstanceScope scope(handle);
    g_pendingBackPress.store(true, std::memory_order_release);
    callIntoHost_VoidMethod("requestRenderFrame");
}

// The Swift host calls this when the device light/dark appearance changes
// (traitCollectionDidChange). iOS does not get the macOS distributed
// notification that raym3's SystemAppearance watcher relies on, so the host
// pushes the change: re-resolve the System color scheme (which reads the
// current UITraitCollection) and notify JS so styles refresh.
extern "C" void RayactIOSSessionRefreshAppearance(RayactIOSHandle handle) {
    InstanceScope scope(handle);
    std::lock_guard<std::mutex> lock(g_engineMutex);
    JSContext* ctx = rayact::engineContext();
    if (!ctx) return;
    raym3::Theme::ApplyEffectiveColorScheme();
    notifyColorSchemeChange(ctx, raym3::Theme::IsDarkMode());
    callIntoHost_VoidMethod("requestRenderFrame");
}

extern "C" void RayactIOSSessionSetTextInputContent(
    RayactIOSHandle handle, int nodeId, const char* text, int selectionStart,
    int selectionEnd, int composingStart, int composingEnd) {
    InstanceScope scope(handle);
    if (!text) return;
    std::string str(text);
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
    std::lock_guard<std::mutex> lock(g_textUpdateMutex);
    int byteSelectionStart = utf16OffsetToUtf8Byte(str, selectionStart);
    int byteSelectionEnd = utf16OffsetToUtf8Byte(str, selectionEnd);
    int byteComposingStart = utf16OffsetToUtf8Byte(str, composingStart);
    int byteComposingEnd = utf16OffsetToUtf8Byte(str, composingEnd);
    g_pendingTextUpdates[nodeId] = {std::move(str), byteSelectionStart, byteSelectionEnd,
                                    byteComposingStart, byteComposingEnd};
}

extern "C" void RayactIOSSessionBlurTextInput(RayactIOSHandle handle) {
    InstanceScope scope(handle);
    g_pendingImeBlur.store(true, std::memory_order_release);
}

extern "C" void RayactIOSSessionImeHiddenBySystem(RayactIOSHandle handle) {
    InstanceScope scope(handle);
    g_imeNodeId.store(-1, std::memory_order_release);
}

namespace rayact {

std::string iosDevCall(const char* method, const char* dataJson) {
    if (!g_iosDevCall) return "null";
    const char* result = g_iosDevCall(method ? method : "", dataJson);
    return result ? std::string(result) : std::string("null");
}

std::string iosDevFetch(const char* url) {
    if (!g_iosDevFetch || !url) return "";
    const char* result = g_iosDevFetch(url);
    return result ? std::string(result) : std::string();
}

} // namespace rayact
