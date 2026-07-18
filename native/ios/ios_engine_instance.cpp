#include "ios_engine_instance.hpp"

#include "../core/engine.hpp"
#include <cstring>
#include "../desktop/raym3_bridge.hpp"
#include <raym3/fonts/FontManager.h>
#include <raym3/v2/EmojiFont.h>
#include <raym3/v2/IconRenderer.h>

extern "C" void CloseWindow(void);
#include <raylib.h>

extern std::mutex g_engineMutex;

namespace {

std::mutex g_instancesMutex;
std::map<int64_t, std::unique_ptr<IOSEngineInstance>> g_instances;
int64_t g_nextInstanceId = 1;
std::atomic<IOSEngineInstance*> g_currentInstance{nullptr};

std::mutex g_graphicsLeaseMutex;
int64_t g_graphicsLeaseHolder = 0;

} // namespace

IOSEngineInstance* iosEngineCurrent() {
    return g_currentInstance.load(std::memory_order_acquire);
}

void iosEngineSetCurrent(IOSEngineInstance* inst) {
    g_currentInstance.store(inst, std::memory_order_release);
}

IOSEngineInstance* iosEngineInstanceFromHandle(int64_t handle) {
    std::lock_guard<std::mutex> lock(g_instancesMutex);
    auto it = g_instances.find(handle);
    return it != g_instances.end() ? it->second.get() : nullptr;
}

void IOSEngineInstance::setCurrent() {
    IOSEngineInstance* current = iosEngineCurrent();
    if (current == this) {
        runtime.activate();
        return;
    }
    if (current) {
        iosEngineSaveInstanceState(current);
        current->runtime.deactivate();
    }
    runtime.activate();
    iosEngineLoadInstanceState(this);
    iosEngineSetCurrent(this);
}

void IOSEngineInstance::registerHost(const RayactIOSHostCallbacks* callbacks) {
    if (!callbacks) {
        hasHostCallbacks = false;
        hostCallbacks = {};
        return;
    }
    hostCallbacks = *callbacks;
    hasHostCallbacks = true;
}

void IOSEngineInstance::clearHost() {
    hasHostCallbacks = false;
    hostCallbacks = {};
}

int IOSEngineInstance::callHostInt(const char* method) const {
    if (!hasHostCallbacks) return 0;
    void* ctx = hostCallbacks.context;
    if (strcmp(method, "requestNewSurface") == 0 && hostCallbacks.requestNewSurface)
        return hostCallbacks.requestNewSurface(ctx);
    if (strcmp(method, "rootSurfaceId") == 0 && hostCallbacks.rootSurfaceId)
        return hostCallbacks.rootSurfaceId(ctx);
    if (strcmp(method, "topSurfaceId") == 0 && hostCallbacks.topSurfaceId)
        return hostCallbacks.topSurfaceId(ctx);
    return 0;
}

void IOSEngineInstance::callHostVoid(const char* method) const {
    if (!hasHostCallbacks) return;
    void* ctx = hostCallbacks.context;
    if (strcmp(method, "toggleDevMenu") == 0 && hostCallbacks.toggleDevMenu)
        hostCallbacks.toggleDevMenu(ctx);
    else if (strcmp(method, "requestRenderFrame") == 0 && hostCallbacks.requestRenderFrame)
        hostCallbacks.requestRenderFrame(ctx);
    else if (strcmp(method, "performHapticFeedback") == 0 && hostCallbacks.performHapticFeedback)
        hostCallbacks.performHapticFeedback(ctx);
    else if (strcmp(method, "hideSoftKeyboard") == 0 && hostCallbacks.hideSoftKeyboard)
        hostCallbacks.hideSoftKeyboard(ctx);
    else if (strcmp(method, "finishActivity") == 0 && hostCallbacks.finishActivity)
        hostCallbacks.finishActivity(ctx);
    else if (strcmp(method, "stopRenderScheduler") == 0 && hostCallbacks.stopRenderScheduler)
        hostCallbacks.stopRenderScheduler(ctx);
    else if (strcmp(method, "releaseTopSurface") == 0 && hostCallbacks.releaseTopSurface)
        hostCallbacks.releaseTopSurface(ctx);
}

std::string IOSEngineInstance::callHostString(const char* method) const {
    if (!hasHostCallbacks) return {};
    if (strcmp(method, "readClipboard") == 0 && hostCallbacks.readClipboard) {
        const char* s = hostCallbacks.readClipboard(hostCallbacks.context);
        return s ? std::string(s) : std::string();
    }
    return {};
}

void IOSEngineInstance::callHostReleaseSurface(int surfaceId) const {
    if (hasHostCallbacks && hostCallbacks.releaseSurface)
        hostCallbacks.releaseSurface(hostCallbacks.context, surfaceId);
}

void IOSEngineInstance::callHostOrderSurfaces(const int* ids, int count) const {
    if (hasHostCallbacks && hostCallbacks.orderSurfaces)
        hostCallbacks.orderSurfaces(hostCallbacks.context, ids, count);
}

void IOSEngineInstance::callHostIme(
    const char* method, int nodeId, const std::string& value,
    const std::string& inputType, bool autocorrect, bool secure,
    const std::string& imeAction, const std::string& autoCapitalize,
    bool contextMenuHidden) const {
    if (!hasHostCallbacks) return;
    void* ctx = hostCallbacks.context;
    if (strcmp(method, "showSoftKeyboard") == 0 && hostCallbacks.showSoftKeyboard)
        hostCallbacks.showSoftKeyboard(ctx, nodeId, value.c_str(), inputType.c_str(),
                                       autocorrect, secure, imeAction.c_str(),
                                       autoCapitalize.c_str(), contextMenuHidden);
    else if (strcmp(method, "switchIme") == 0 && hostCallbacks.switchIme)
        hostCallbacks.switchIme(ctx, nodeId, value.c_str(), inputType.c_str(),
                                autocorrect, secure, imeAction.c_str(),
                                autoCapitalize.c_str(), contextMenuHidden);
}

void IOSEngineInstance::callHostCopyToClipboard(const std::string& text) const {
    if (hasHostCallbacks && hostCallbacks.copyToClipboard)
        hostCallbacks.copyToClipboard(hostCallbacks.context, text.c_str());
}

void IOSEngineInstance::callHostUpdateImeState(
    int nodeId, int selectionStart, int selectionEnd,
    int composingStart, int composingEnd, const char* text) const {
    if (hasHostCallbacks && hostCallbacks.updateImeState)
        hostCallbacks.updateImeState(hostCallbacks.context, nodeId, selectionStart,
                                     selectionEnd, composingStart, composingEnd, text);
}

static std::atomic<bool> g_graphicsValid{false};

void iosEngineSetGraphicsValid(bool valid) {
    g_graphicsValid.store(valid, std::memory_order_release);
}

bool iosEngineGraphicsValid() {
    return g_graphicsValid.load(std::memory_order_acquire);
}

static void releaseGraphicsLocked(IOSEngineInstance* inst) {
    if (!inst || !inst->graphicsActive.load(std::memory_order_acquire)) return;
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (iosEngineCurrent() == inst) iosEngineSaveInstanceState(inst);
    inst->setCurrent();
    if (!inst->surfaces.empty()) {
        std::vector<int> ids;
        ids.reserve(inst->surfaces.size());
        for (auto& [id, s] : inst->surfaces) ids.push_back(id);
        for (auto it = ids.rbegin(); it != ids.rend(); ++it) {
            const bool isRoot = (*it == inst->rootScreenId);
            if (!isRoot) engineDestroyScreen(*it);
        }
        inst->surfaces.clear();
    }
    if (IsWindowReady()) CloseWindow();
    raym3::FontManager::ResetDeviceCache();
    raym3::v2::IconRendererResetDeviceCache();
    raym3::v2::EmojiFont::Instance().ResetTextureCache();
    inst->graphicsActive.store(false, std::memory_order_release);
    g_graphicsValid.store(false, std::memory_order_release);
    iosEngineLoadInstanceState(inst);
}

void iosEngineReleaseGraphics(int64_t handle) {
    std::lock_guard<std::mutex> leaseLock(g_graphicsLeaseMutex);
    IOSEngineInstance* inst = iosEngineInstanceFromHandle(handle);
    if (!inst) return;
    releaseGraphicsLocked(inst);
    if (g_graphicsLeaseHolder == handle) g_graphicsLeaseHolder = 0;
}

void iosEngineRequestGraphicsFrame() {
    std::lock_guard<std::mutex> leaseLock(g_graphicsLeaseMutex);
    if (g_graphicsLeaseHolder == 0) return;
    IOSEngineInstance* inst = iosEngineInstanceFromHandle(g_graphicsLeaseHolder);
    if (inst) inst->callHostVoid("requestRenderFrame");
}

bool iosEngineAcquireGraphics(int64_t handle) {
    std::lock_guard<std::mutex> leaseLock(g_graphicsLeaseMutex);
    if (g_graphicsLeaseHolder == handle) {
        IOSEngineInstance* inst = iosEngineInstanceFromHandle(handle);
        if (inst) inst->graphicsActive = true;
        return true;
    }
    if (g_graphicsLeaseHolder != 0) {
        IOSEngineInstance* prev = iosEngineInstanceFromHandle(g_graphicsLeaseHolder);
        if (prev) prev->callHostVoid("stopRenderScheduler");
        releaseGraphicsLocked(prev);
        g_graphicsLeaseHolder = 0;
    }
    IOSEngineInstance* inst = iosEngineInstanceFromHandle(handle);
    if (!inst) return false;
    {
        std::lock_guard<std::mutex> lock(g_engineMutex);
        inst->setCurrent();
    }
    inst->graphicsActive = true;
    g_graphicsLeaseHolder = handle;
    return true;
}

int64_t iosEngineInstanceCreate(const std::string& dataPath) {
    auto inst = std::make_unique<IOSEngineInstance>();
    inst->dataPath = dataPath;
    {
        std::lock_guard<std::mutex> lock(g_engineMutex);
        rayact::EngineRuntime* prev = rayact::engineRuntimeActive();
        if (!inst->runtime.create(dataPath)) return 0;
        if (prev) prev->activate();
    }
    inst->engineReady = true;
    std::lock_guard<std::mutex> lock(g_instancesMutex);
    inst->id = g_nextInstanceId++;
    int64_t handle = inst->id;
    g_instances[handle] = std::move(inst);
    return handle;
}

void iosEngineInstanceDestroy(int64_t handle) {
    {
        std::lock_guard<std::mutex> leaseLock(g_graphicsLeaseMutex);
        if (g_graphicsLeaseHolder == handle) {
            IOSEngineInstance* inst = iosEngineInstanceFromHandle(handle);
            releaseGraphicsLocked(inst);
            g_graphicsLeaseHolder = 0;
        }
    }
    std::unique_ptr<IOSEngineInstance> owned;
    IOSEngineInstance* resumeInstance = nullptr;
    {
        std::lock_guard<std::mutex> lock(g_instancesMutex);
        auto it = g_instances.find(handle);
        if (it == g_instances.end()) return;
        IOSEngineInstance* current = iosEngineCurrent();
        if (current && current != it->second.get()) resumeInstance = current;
        owned = std::move(it->second);
        g_instances.erase(it);
    }
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (owned) {
        owned->clearHost();
        owned->setCurrent();
        owned->runtime.destroy();
    }
    if (resumeInstance) {
        resumeInstance->setCurrent();
    } else if (iosEngineCurrent() == owned.get()) {
        iosEngineSetCurrent(nullptr);
    }
}
