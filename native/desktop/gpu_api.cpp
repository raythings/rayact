// The RayactGpuApi table exposed to native modules (ABI 2).
//
// This is the only translation unit where a module's drawing needs meet real
// raylib types. Everything crossing the ABI is plain C scalars, so a plugin never
// has to agree with us about struct layout or link raylib itself.

#include "gpu_api.hpp"

#include "raylib.h"
#include "rlgl.h"

namespace rayact {

namespace {

// Texture and RayactGpuTexture have identical fields, but copy explicitly rather
// than reinterpret_cast: the ABI must not silently depend on raylib's layout.
RayactGpuTexture toAbi(Texture2D t) {
  RayactGpuTexture out{};
  out.id = t.id;
  out.width = t.width;
  out.height = t.height;
  out.mipmaps = t.mipmaps;
  out.format = t.format;
  return out;
}

Texture2D fromAbi(RayactGpuTexture t) {
  Texture2D out{};
  out.id = t.id;
  out.width = t.width;
  out.height = t.height;
  out.mipmaps = t.mipmaps;
  out.format = t.format;
  return out;
}

void gpuBegin(int mode) { rlBegin(mode); }
void gpuEnd(void) { rlEnd(); }
void gpuVertex2f(float x, float y) { rlVertex2f(x, y); }
void gpuColor4ub(unsigned char r, unsigned char g, unsigned char b, unsigned char a) {
  rlColor4ub(r, g, b, a);
}
void gpuTexCoord2f(float u, float v) { rlTexCoord2f(u, v); }
void gpuSetTexture(uint32_t id) { rlSetTexture(id); }
uint32_t gpuDefaultTextureId(void) { return rlGetTextureIdDefault(); }
void gpuPushMatrix(void) { rlPushMatrix(); }
void gpuPopMatrix(void) { rlPopMatrix(); }
void gpuTranslatef(float x, float y, float z) { rlTranslatef(x, y, z); }
void gpuRotatef(float deg, float x, float y, float z) { rlRotatef(deg, x, y, z); }
void gpuScalef(float x, float y, float z) { rlScalef(x, y, z); }
int gpuCheckRenderBatchLimit(int vertexCount) {
  return rlCheckRenderBatchLimit(vertexCount) ? 1 : 0;
}

// Modules hand over raw RGBA8 pixels; the Image wrapper stays on this side of the
// ABI. `data` is not retained — LoadTextureFromImage uploads and returns.
RayactGpuTexture gpuLoadTextureRgba8(const void* pixels, int width, int height) {
  if (!pixels || width <= 0 || height <= 0) return RayactGpuTexture{};
  Image img{};
  img.data = const_cast<void*>(pixels);
  img.width = width;
  img.height = height;
  img.mipmaps = 1;
  img.format = PIXELFORMAT_UNCOMPRESSED_R8G8B8A8;
  return toAbi(LoadTextureFromImage(img));
}

void gpuUpdateTextureRgba8(RayactGpuTexture tex, const void* pixels) {
  if (!pixels || tex.id == 0) return;
  UpdateTexture(fromAbi(tex), pixels);
}

void gpuUnloadTexture(RayactGpuTexture tex) {
  if (tex.id == 0) return;
  UnloadTexture(fromAbi(tex));
}

void gpuSetTextureFilter(RayactGpuTexture tex, int filter) {
  if (tex.id == 0) return;
  SetTextureFilter(fromAbi(tex), filter);
}

void gpuSetTextureWrap(RayactGpuTexture tex, int wrap) {
  if (tex.id == 0) return;
  SetTextureWrap(fromAbi(tex), wrap);
}

void gpuBeginScissor(int x, int y, int width, int height) {
  BeginScissorMode(x, y, width, height);
}
void gpuEndScissor(void) { EndScissorMode(); }

const RayactGpuApi g_gpuApi = {
    sizeof(RayactGpuApi),
    gpuBegin,
    gpuEnd,
    gpuVertex2f,
    gpuColor4ub,
    gpuTexCoord2f,
    gpuSetTexture,
    gpuDefaultTextureId,
    gpuPushMatrix,
    gpuPopMatrix,
    gpuTranslatef,
    gpuRotatef,
    gpuScalef,
    gpuCheckRenderBatchLimit,
    gpuLoadTextureRgba8,
    gpuUpdateTextureRgba8,
    gpuUnloadTexture,
    gpuSetTextureFilter,
    gpuSetTextureWrap,
    gpuBeginScissor,
    gpuEndScissor,
};

} // namespace

const RayactGpuApi* rayactGpuApi() { return &g_gpuApi; }

} // namespace rayact
