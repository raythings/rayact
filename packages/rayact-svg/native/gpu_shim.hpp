#pragma once

#include "rayact_module_abi.h"

// Point the raylib shim at the host's GPU table. Must be called during
// registration, before any draw. No-op when the shim is not compiled in
// (static-linked builds resolve rl* against the host directly).
void rsvgSetGpuApi(const RayactGpuApi* gpu);
