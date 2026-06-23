#pragma once

// Rayact engine: the platform-agnostic core (QuickJS runtime + raym3 render).
//
// The engine is intentionally NOT owned by any window/Activity. Desktop's
// main() and the Android JNI layer are both thin embedders that create the
// engine, load JS, then drive per-frame work via enginePumpJS()/
// engineRenderFrame(). This is the "process-level engine service" the Android
// port (LynxJS / react-navigation native-stack model) depends on.
//
// Implementation lives in main.cpp (compiled for both the desktop binary and
// the Android shared library — the desktop entry point main() is guarded by
// #ifndef RAYACT_ANDROID).

#include <string>

extern "C" {
#include "quickjs.h"
}

namespace rayact {

// Create the QuickJS runtime + context and register all native functions.
// Returns false on failure. Idempotent guard: safe to call once per process.
bool engineCreate();

// The engine's JS context (null until engineCreate() succeeds).
JSContext* engineContext();

// Load the application JS. Exactly one of these is used per run.
bool engineLoadDevServer(const std::string& devServerUrl);
bool engineApplyModuleUpdate(const std::string& path, const std::string& source);
bool engineLoadFile(const std::string& path);          // sets release asset base dir
bool engineLoadSource(const std::string& source, const std::string& name);
bool engineLoadBytecode(const uint8_t* data, size_t len, const char* label = "app.qjsbc");
// Mount a .rayactpack container (extract to scratch, set asset base) and boot
// from its app.qjsbc/app.js. Mobile hosts copy the pack from app assets into a
// writable dir and call this; desktop engineLoadFile dispatches here for .rayactpack.
bool engineLoadPackFile(const std::string& packPath);

// Load the optional app config (app.json / app.config.js / app.config.ts).
// Idempotent. Safe to call once after engineCreate() and before
// engineFinishLoad(). Path is the assets root (e.g. the Activity's
// internalDataPath on Android). Defaults to black if no config found.
bool engineLoadConfig(const char* assetsPath);
const struct AppConfig& engineAppConfig();

// Drain QuickJS jobs/microtasks after initial eval (React mounts via microtasks).
void engineFlushStartupJobs();

// QuickJS captures stack limits at runtime creation; call from the thread that
// runs JS before the first eval/pump (Android: render thread, not UI thread).
void enginePrepareJSThread();

// After JS init has run and a window/surface exists: rasterize the icon sprite
// sheet (needs GL) and run a GC pass. Also brings up raym3 + system appearance.
void engineFinishLoad();

// Per-tick work, split so a host can drive them from its own loop:
//   - enginePumpJS(): drain QJS jobs/timers/rAF, workers, net, dev-server poll,
//     and invoke the JS frame-update callback.
//   - engineRenderFrame(w,h): draw the current surface's raym3 tree (or the
//     legacy immediate-mode shapes) into the bound GL surface at size w x h.
//   - engineRenderFrameAndroid(screenId,w,h): Android multi-surface render for
//     the already-bound EGL window that corresponds to screenId. The caller
//     binds/swaps each visible SurfaceView window; Android composites them.
void enginePumpJS();
void engineRenderFrame(int width, int height);
void engineRenderFrameAndroid(int screenId, int width, int height);
bool engineNeedsAnotherFrame();
void engineSetRelayoutOnSurfaceResize(bool enabled);
bool engineRelayoutOnSurfaceResizeEnabled();
void engineRequestSurfaceRelayout(int screenId);

// Android SurfaceView touches arrive on the UI thread. Queue the primary
// pointer here so the render thread can dispatch press handlers on release.
void engineQueueTouch(int action, int id, float x, float y);

// Tear down JS subsystems, context and runtime.
void engineDestroy();

#if defined(RAYACT_ANDROID) || defined(RAYACT_IOS)
class EngineRuntime;
bool engineRuntimeBootstrap(EngineRuntime* runtime);
void engineRuntimeTeardown(EngineRuntime* runtime);
void engineRuntimeSaveJsGlobals(EngineRuntime* runtime);
void engineRuntimeRestoreJsGlobals(EngineRuntime* runtime);
#endif

} // namespace rayact
