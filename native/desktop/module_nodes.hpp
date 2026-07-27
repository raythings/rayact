#pragma once

#include "rayact_module_abi.h"

namespace rayact {

// Node kinds contributed by native modules (ABI 2) — the mechanism behind
// module-provided components like <Svg>.
//
// A module registers a kind with a vtable; JS then creates nodes of that kind
// through __rayactCreateModuleNode(kind, style, propsJson). The engine owns the
// node, its layout and its style exactly as for a built-in; the module owns
// whatever is painted inside the resolved rect.
//
// The implementation lives in raym3_bridge.cpp, where the node table, style
// parsing and id allocation already are.

// Register a kind. Returns false if the name is taken by a different vtable or the
// vtable is unusable. Kinds are never unregistered; the vtable is copied.
bool moduleNodesRegisterKind(const char* kind, const RayactNodeVTable* vtable);

// True when any live module node wants another frame (polled from
// engineNeedsAnotherFrame, so it must stay cheap).
bool moduleNodesNeedFrame();

// Fan graphics-device loss out to every registered kind, so modules drop GPU
// objects created against the dead device.
void moduleNodesNotifyGpuReset();

// Dispose one node by id. No-op when the id is not a module node, so engine
// teardown can call it unconditionally.
void moduleNodesDispose(int id);

// Dispose every live module node. Called from engine teardown paths.
void moduleNodesDisposeAll();

} // namespace rayact
