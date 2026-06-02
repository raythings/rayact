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
bool engineLoadFile(const std::string& path);          // sets release asset base dir
bool engineLoadSource(const std::string& source, const std::string& name);

// After JS init has run and a window/surface exists: rasterize the icon sprite
// sheet (needs GL) and run a GC pass. Also brings up raym3 + system appearance.
void engineFinishLoad();

// Per-tick work, split so a host can drive them from its own loop:
//   - enginePumpJS(): drain QJS jobs/timers/rAF, workers, net, dev-server poll,
//     and invoke the JS frame-update callback.
//   - engineRenderFrame(w,h): draw the current surface's raym3 tree (or the
//     legacy immediate-mode shapes) into the bound GL surface at size w x h.
void enginePumpJS();
void engineRenderFrame(int width, int height);

// Tear down JS subsystems, context and runtime.
void engineDestroy();

} // namespace rayact
