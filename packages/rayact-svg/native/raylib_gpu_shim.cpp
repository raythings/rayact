// Supplies the raylib/rlgl symbols raysvg needs, forwarding them to the host's
// RayactGpuApi table.
//
// Why this exists: raysvg is written against raylib but deliberately never links it,
// so its rl* calls resolve at the final link of whatever host uses it. That works
// when raysvg is compiled *into* the engine. A dynamically loaded plugin is a
// different binary, and resolving the host executable's symbols from a dlopen'd
// library is not portable — Android isolates library namespaces under
// System.loadLibrary, and on macOS the desktop host is an executable rather than a
// dylib. Rather than fight that per platform, the host hands over a function table
// and this file re-exports it under the names raysvg already calls.
//
// Compiled only for standalone dynamic artifacts. Static-linked builds (iOS, web)
// leave it out and let raysvg bind to the host's real raylib, which is why the gate
// is on linkage rather than platform.

#include "gpu_shim.hpp"

#if RAYACT_SVG_USE_GPU_SHIM

#include "raylib.h"
#include "rlgl.h"

#include <cstring>

namespace {
const RayactGpuApi* g_gpu = nullptr;

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
} // namespace

void rsvgSetGpuApi(const RayactGpuApi* gpu) { g_gpu = gpu; }

// Every entry guards on the table being present: a draw before registration should
// paint nothing rather than jump through a null pointer.
extern "C" {

void rlBegin(int mode) { if (g_gpu) g_gpu->begin(mode); }
void rlEnd(void) { if (g_gpu) g_gpu->end(); }
void rlVertex2f(float x, float y) { if (g_gpu) g_gpu->vertex2f(x, y); }
void rlColor4ub(unsigned char r, unsigned char g, unsigned char b, unsigned char a) {
    if (g_gpu) g_gpu->color4ub(r, g, b, a);
}
void rlTexCoord2f(float x, float y) { if (g_gpu) g_gpu->tex_coord2f(x, y); }
void rlSetTexture(unsigned int id) { if (g_gpu) g_gpu->set_texture(id); }
unsigned int rlGetTextureIdDefault(void) { return g_gpu ? g_gpu->default_texture_id() : 0u; }
void rlPushMatrix(void) { if (g_gpu) g_gpu->push_matrix(); }
void rlPopMatrix(void) { if (g_gpu) g_gpu->pop_matrix(); }
void rlTranslatef(float x, float y, float z) { if (g_gpu) g_gpu->translatef(x, y, z); }
void rlRotatef(float angle, float x, float y, float z) { if (g_gpu) g_gpu->rotatef(angle, x, y, z); }
void rlScalef(float x, float y, float z) { if (g_gpu) g_gpu->scalef(x, y, z); }
bool rlCheckRenderBatchLimit(int vCount) {
    return g_gpu ? g_gpu->check_render_batch_limit(vCount) != 0 : false;
}

Texture2D LoadTextureFromImage(Image image) {
    // raysvg only ever builds RGBA8 ramp images, which is the one format the ABI
    // carries. Anything else would need a wider table entry.
    if (!g_gpu || !image.data || image.format != PIXELFORMAT_UNCOMPRESSED_R8G8B8A8) {
        return Texture2D{};
    }
    return fromAbi(g_gpu->load_texture_rgba8(image.data, image.width, image.height));
}

void UnloadTexture(Texture2D texture) { if (g_gpu) g_gpu->unload_texture(toAbi(texture)); }
void SetTextureFilter(Texture2D texture, int filter) {
    if (g_gpu) g_gpu->set_texture_filter(toAbi(texture), filter);
}
void SetTextureWrap(Texture2D texture, int wrap) {
    if (g_gpu) g_gpu->set_texture_wrap(toAbi(texture), wrap);
}

} // extern "C"

#else

void rsvgSetGpuApi(const RayactGpuApi*) {}

#endif // RAYACT_SVG_USE_GPU_SHIM
