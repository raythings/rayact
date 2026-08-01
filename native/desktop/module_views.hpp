#pragma once

#include "rayact_module_abi.h"

namespace rayact {

// Platform view factories contributed by native modules (ABI 3) — the mechanism
// behind module-provided platform views like @rayact/webview's <WebView>.
//
// A module registers a kind with a vtable; the platform-view host then routes
// create/setProperties/layout/dispose for external-view nodes of that kind to the
// module instead of its own built-in branches. The engine owns the wrapper view,
// hit-testing, clipping, layout and occlusion; the module owns the view's content.
//
// This is the desktop peer of Android's RayactPlatformRegistry.registerViewFactory
// and iOS's registerViewFactory, and mirrors moduleNodesRegisterKind's contract:
// kinds are never unregistered and the vtable is copied at registration.
//
// Registration happens during loadPlugins(), which runs before the window exists
// and therefore before the platform-view host installs and replays the external
// views committed during startup — so a factory is always in place before the
// first create for its kind.

// Register a kind. Returns false if the name is taken by a different vtable or the
// vtable is unusable. Re-registering an identical vtable succeeds (a dev host may
// load the same plugin twice).
bool moduleViewsRegisterFactory(const char* kind, const RayactViewFactory* factory);

// The factory for a kind, or nullptr when no module claims it (the caller then
// falls back to its built-in kinds, and finally to a plain empty view).
const RayactViewFactory* moduleViewsFindFactory(const char* kind);

} // namespace rayact
