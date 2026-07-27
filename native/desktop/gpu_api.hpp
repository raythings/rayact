#pragma once

#include "rayact_module_abi.h"

namespace rayact {

// The RayactGpuApi table handed to plugins via host->gpu().
//
// Modules cannot link raylib — they are loaded into a host that already owns a
// backend (desktop GL, rlvk, rlmt, rlwg), and on Android/macOS a plugin cannot
// reliably resolve the host's symbols anyway. So the host hands over function
// pointers instead, and a drawing module either calls them directly or compiles a
// shim that re-exports them under their raylib names.
//
// The table is deliberately the narrow subset that behaves identically on all four
// backends. See rayact_module_abi.h for why stencil/shaders/vertex-arrays are out.
const RayactGpuApi* rayactGpuApi();

} // namespace rayact
