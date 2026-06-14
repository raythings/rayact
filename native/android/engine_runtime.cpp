#include "engine_runtime.hpp"

#include "../core/engine.hpp"
#include "../desktop/raym3_bridge.hpp"
#include "../desktop/js_stdlib.hpp"
#include "engine_internal.hpp"

extern JSContext* g_bridge_ctx;

namespace rayact {

static EngineRuntime* g_activeRuntime = nullptr;

EngineRuntime* engineRuntimeActive() { return g_activeRuntime; }

void engineRuntimeSetActive(EngineRuntime* runtime) { g_activeRuntime = runtime; }

EngineRuntime::~EngineRuntime() {
    if (g_activeRuntime == this) deactivate();
    destroy();
}

bool EngineRuntime::create(const std::string& dataPath) {
    if (created_) return true;
    dataPath_ = dataPath;
    raym3Storage_ = raym3BridgeNewRuntimeStorage();
    jsStorage_ = std::make_unique<EngineRuntimeJsStorage>();
    if (!engineRuntimeBootstrap(this)) return false;
    activate();
    deactivate();
    created_ = true;
    return true;
}

void EngineRuntime::destroy() {
    if (!created_) return;
    // Tear down with this runtime ACTIVE: cleanupRaym3Bridge/cleanupCSSBridge
    // free the JSValues living in the process-global node maps. Deactivating
    // first exported those values into raym3Storage_ where teardown can't
    // reach them, so JS_FreeRuntime aborted on the leaked GC objects when a
    // ProjectActivity session was destroyed.
    activate();
    engineRuntimeTeardown(this);
    if (raym3Storage_) {
        raym3BridgeDeleteRuntimeStorage(raym3Storage_);
        raym3Storage_ = nullptr;
    }
    jsStorage_.reset();
    // Clear the active slot directly — the context is gone, so the normal
    // deactivate() export path must not run.
    g_rt = nullptr;
    g_ctx = nullptr;
    g_bridge_ctx = nullptr;
    if (g_activeRuntime == this) g_activeRuntime = nullptr;
    created_ = false;
}

void EngineRuntime::activate() {
    if (g_activeRuntime == this) return;
    if (g_activeRuntime) g_activeRuntime->deactivate();
    g_rt = rt_;
    g_ctx = ctx_;
    g_bridge_ctx = ctx_;
    if (raym3Storage_) raym3BridgeImportRuntimeStorage(*raym3Storage_);
    engineRuntimeRestoreJsGlobals(this);
    g_activeRuntime = this;
}

void EngineRuntime::deactivate() {
    if (g_activeRuntime != this) return;
    if (ctx_) cleanupJSStdlib(ctx_);
    if (raym3Storage_) raym3BridgeExportRuntimeStorage(*raym3Storage_);
    engineRuntimeSaveJsGlobals(this);
    g_rt = nullptr;
    g_ctx = nullptr;
    g_bridge_ctx = nullptr;
    g_activeRuntime = nullptr;
}

} // namespace rayact
