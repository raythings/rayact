#pragma once
// Worker draw-command replay — gives JS and WASM workers the same raylib
// drawing surface the main thread has. Workers RECORD commands into a compact
// binary stream (see rayact/src/worker/canvas.ts and the WASM sys_present_draw
// import); the render thread REPLAYS the last presented stream every frame
// inside the worker view's Custom node, clipped to its layout rect.
//
// Stream format: little-endian, 4-byte aligned.
//   u32 opcode, then args. f32 floats, u32 colors (0xRRGGBBAA — same
//   convention as JS styles). Strings: u32 byteLen + utf8, padded to 4.
// Coordinates are dp, local to the worker view (origin = its top-left).
#include <cstdint>
#include <cstddef>
#include "raylib.h"

enum RayactDrawOp : uint32_t {
    WDRAW_CLEAR            = 1,  // color
    WDRAW_RECT             = 2,  // x,y,w,h, color
    WDRAW_RECT_LINES       = 3,  // x,y,w,h, thick, color
    WDRAW_ROUND_RECT       = 4,  // x,y,w,h, radius, color
    WDRAW_ROUND_RECT_LINES = 5,  // x,y,w,h, radius, thick, color
    WDRAW_LINE             = 6,  // x1,y1,x2,y2, thick, color
    WDRAW_CIRCLE           = 7,  // cx,cy,r, color
    WDRAW_CIRCLE_LINES     = 8,  // cx,cy,r, color
    WDRAW_TRIANGLE         = 9,  // x1,y1,x2,y2,x3,y3, color
    WDRAW_TEXT             = 10, // x,y, fontSize, spacing, color, str family, str text
    WDRAW_SCISSOR          = 11, // x,y,w,h (layout-local dp; user transforms ignored)
    WDRAW_SCISSOR_END      = 12,
    WDRAW_PUSH_MATRIX      = 13,
    WDRAW_POP_MATRIX       = 14,
    WDRAW_TRANSLATE        = 15, // x,y
    WDRAW_SCALE            = 16, // sx,sy
    WDRAW_ROTATE           = 17, // degrees
    WDRAW_IMAGE            = 18, // x,y,w,h, tint, str path (cached LoadTexture)
};

// Replays a command stream. Must be called on the render thread with the GL/VK
// context current (i.e. from a raym3 Custom node render lambda). `layout` is
// the worker view's absolute layout rect in dp.
void rayactReplayWorkerDraw(const uint8_t* data, size_t len, Rectangle layout);

// Frees the path→Texture2D cache used by WDRAW_IMAGE. Render thread only.
void rayactWorkerDrawShutdown();
