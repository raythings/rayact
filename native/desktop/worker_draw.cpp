#include "worker_draw.hpp"

#include "raylib.h"
#include "rlgl.h"
#include <raym3/fonts/FontManager.h>
#include <raym3/v2/Density.h>

#include <cstring>
#include <string>
#include <string_view>
#include <unordered_map>

namespace {

inline float rdF32(const uint8_t* p) { float f; memcpy(&f, p, 4); return f; }
inline uint32_t rdU32(const uint8_t* p) { uint32_t v; memcpy(&v, p, 4); return v; }

inline Color colorFromU32(uint32_t rgba) {
    return Color{
        (unsigned char)((rgba >> 24) & 0xff),
        (unsigned char)((rgba >> 16) & 0xff),
        (unsigned char)((rgba >> 8) & 0xff),
        (unsigned char)(rgba & 0xff),
    };
}

// Cursor over the stream with bounds checking. Any short read aborts the
// replay (stream desync) rather than misreading.
struct Cursor {
    const uint8_t* base;
    size_t len;
    size_t off = 0;
    bool ok = true;

    bool has(size_t n) {
        if (off + n > len) { ok = false; return false; }
        return true;
    }
    float f32() { if (!has(4)) return 0; float v = rdF32(base + off); off += 4; return v; }
    uint32_t u32() { if (!has(4)) return 0; uint32_t v = rdU32(base + off); off += 4; return v; }
    // Returns a view into the stream; empty on bounds failure.
    std::string_view str() {
        uint32_t n = u32();
        if (!ok || !has(n)) { ok = false; return {}; }
        std::string_view s(reinterpret_cast<const char*>(base + off), n);
        off += ((size_t)n + 3) & ~size_t(3);
        return s;
    }
};

// WDRAW_IMAGE texture cache — render thread only.
std::unordered_map<std::string, Texture2D> g_imageCache;

Texture2D imageTexture(const std::string& path) {
    auto it = g_imageCache.find(path);
    if (it != g_imageCache.end()) return it->second;
    Texture2D tex = LoadTexture(path.c_str());
    if (tex.id != 0) SetTextureFilter(tex, TEXTURE_FILTER_BILINEAR);
    g_imageCache[path] = tex;
    return tex;
}

void beginFramebufferScissor(float x, float y, float width, float height) {
    const int px = (int)raym3::v2::Density::DpToPx(x);
    const int py = (int)raym3::v2::Density::DpToPx(y);
    const int pw = (int)raym3::v2::Density::DpToPx(width);
    const int ph = (int)raym3::v2::Density::DpToPx(height);
    rlDrawRenderBatchActive();
    rlEnableScissorTest();
    rlScissor(px, GetRenderHeight() - py - ph, pw, ph);
}

void endFramebufferScissor() {
    rlDrawRenderBatchActive();
    rlDisableScissorTest();
}

} // namespace

void rayactReplayWorkerDraw(const uint8_t* data, size_t len, Rectangle layout) {
    if (!data || len < 4) return;

    const float dp = raym3::v2::Density::GetLayoutDensity();

    // Everything local to the view: translate to its origin (dp space — the
    // host's ambient dp matrix turns it into pixels), and clip to its rect.
    // Scissor works in framebuffer pixels, hence the explicit DpToPx.
    // raym3 may leave rlgl in projection mode after completing the retained
    // tree. Worker views are replayed as a sibling pass, so establish the
    // model-view stack explicitly before applying view-local transforms.
    rlMatrixMode(RL_MODELVIEW);
    rlPushMatrix();
    rlTranslatef(layout.x, layout.y, 0.0f);
    // BeginScissorMode uses the process root screen height. Android can render
    // into a smaller per-surface framebuffer, so clip against the active
    // render target instead.
    beginFramebufferScissor(layout.x, layout.y, layout.width, layout.height);

    int matrixDepth = 0;   // balance user PUSH/POP even on malformed streams
    bool userScissor = false;

    Cursor c{data, len};
    while (c.ok && c.off + 4 <= c.len) {
        uint32_t op = c.u32();
        switch (op) {
            case WDRAW_CLEAR: {
                Color col = colorFromU32(c.u32());
                if (c.ok) DrawRectangleRec({0, 0, layout.width, layout.height}, col);
                break;
            }
            case WDRAW_RECT: {
                float x = c.f32(), y = c.f32(), w = c.f32(), h = c.f32();
                Color col = colorFromU32(c.u32());
                if (c.ok) DrawRectangleRec({x, y, w, h}, col);
                break;
            }
            case WDRAW_RECT_LINES: {
                float x = c.f32(), y = c.f32(), w = c.f32(), h = c.f32(), t = c.f32();
                Color col = colorFromU32(c.u32());
                if (c.ok) DrawRectangleLinesEx({x, y, w, h}, t, col);
                break;
            }
            case WDRAW_ROUND_RECT: {
                float x = c.f32(), y = c.f32(), w = c.f32(), h = c.f32(), r = c.f32();
                Color col = colorFromU32(c.u32());
                if (!c.ok) break;
                float half = (w < h ? w : h) * 0.5f;
                float roundness = half > 0 ? (r > half ? 1.0f : r / half) : 0.0f;
                DrawRectangleRounded({x, y, w, h}, roundness, 8, col);
                break;
            }
            case WDRAW_ROUND_RECT_LINES: {
                float x = c.f32(), y = c.f32(), w = c.f32(), h = c.f32(), r = c.f32(), t = c.f32();
                Color col = colorFromU32(c.u32());
                if (!c.ok) break;
                float half = (w < h ? w : h) * 0.5f;
                float roundness = half > 0 ? (r > half ? 1.0f : r / half) : 0.0f;
                DrawRectangleRoundedLinesEx({x, y, w, h}, roundness, 8, t, col);
                break;
            }
            case WDRAW_LINE: {
                float x1 = c.f32(), y1 = c.f32(), x2 = c.f32(), y2 = c.f32(), t = c.f32();
                Color col = colorFromU32(c.u32());
                if (c.ok) DrawLineEx({x1, y1}, {x2, y2}, t, col);
                break;
            }
            case WDRAW_CIRCLE: {
                float x = c.f32(), y = c.f32(), r = c.f32();
                Color col = colorFromU32(c.u32());
                if (c.ok) DrawCircleV({x, y}, r, col);
                break;
            }
            case WDRAW_CIRCLE_LINES: {
                float x = c.f32(), y = c.f32(), r = c.f32();
                Color col = colorFromU32(c.u32());
                if (c.ok) DrawCircleLinesV({x, y}, r, col);
                break;
            }
            case WDRAW_TRIANGLE: {
                float x1 = c.f32(), y1 = c.f32(), x2 = c.f32(), y2 = c.f32(),
                      x3 = c.f32(), y3 = c.f32();
                Color col = colorFromU32(c.u32());
                if (c.ok) DrawTriangle({x1, y1}, {x2, y2}, {x3, y3}, col);
                break;
            }
            case WDRAW_TEXT: {
                float x = c.f32(), y = c.f32(), size = c.f32(), spacing = c.f32();
                Color col = colorFromU32(c.u32());
                std::string_view family = c.str();
                std::string_view text = c.str();
                if (!c.ok || text.empty()) break;
                Font font = family.empty()
                    ? GetFontDefault()
                    : raym3::FontManager::LoadFontByFamily(std::string(family), (int)size);
                // Font textures are rasterized at px size (size * density). To
                // sample 1:1 under the host's ambient dp matrix, cancel one dp
                // factor and draw at px coordinates — same trick as raym3's
                // RenderTextNode.
                rlPushMatrix();
                rlScalef(1.0f / dp, 1.0f / dp, 1.0f);
                std::string owned(text);
                DrawTextEx(font, owned.c_str(),
                           {raym3::v2::Density::DpToPx(x), raym3::v2::Density::DpToPx(y)},
                           raym3::v2::Density::DpToPx(size),
                           raym3::v2::Density::DpToPx(spacing), col);
                rlPopMatrix();
                break;
            }
            case WDRAW_SCISSOR: {
                float x = c.f32(), y = c.f32(), w = c.f32(), h = c.f32();
                if (!c.ok) break;
                // Intersect with the view rect so workers can't draw outside
                // their node. Layout-local dp → framebuffer px.
                float ax = layout.x + x, ay = layout.y + y;
                float bx = ax + w, by = ay + h;
                float lx2 = layout.x + layout.width, ly2 = layout.y + layout.height;
                if (ax < layout.x) ax = layout.x;
                if (ay < layout.y) ay = layout.y;
                if (bx > lx2) bx = lx2;
                if (by > ly2) by = ly2;
                if (bx < ax) bx = ax;
                if (by < ay) by = ay;
                beginFramebufferScissor(ax, ay, bx - ax, by - ay);
                userScissor = true;
                break;
            }
            case WDRAW_SCISSOR_END: {
                // Restore the view clip rather than disabling entirely.
                beginFramebufferScissor(layout.x, layout.y, layout.width, layout.height);
                userScissor = false;
                break;
            }
            case WDRAW_PUSH_MATRIX:
                rlPushMatrix();
                matrixDepth++;
                break;
            case WDRAW_POP_MATRIX:
                if (matrixDepth > 0) { rlPopMatrix(); matrixDepth--; }
                break;
            case WDRAW_TRANSLATE: {
                float x = c.f32(), y = c.f32();
                if (c.ok) rlTranslatef(x, y, 0.0f);
                break;
            }
            case WDRAW_SCALE: {
                float sx = c.f32(), sy = c.f32();
                if (c.ok) rlScalef(sx, sy, 1.0f);
                break;
            }
            case WDRAW_ROTATE: {
                float deg = c.f32();
                if (c.ok) rlRotatef(deg, 0.0f, 0.0f, 1.0f);
                break;
            }
            case WDRAW_IMAGE: {
                float x = c.f32(), y = c.f32(), w = c.f32(), h = c.f32();
                Color tint = colorFromU32(c.u32());
                std::string_view path = c.str();
                if (!c.ok || path.empty()) break;
                Texture2D tex = imageTexture(std::string(path));
                if (tex.id != 0) {
                    Rectangle src{0, 0, (float)tex.width, (float)tex.height};
                    DrawTexturePro(tex, src, {x, y, w, h}, {0, 0}, 0.0f, tint);
                }
                break;
            }
            default:
                // Unknown opcode → desync; stop cleanly.
                c.ok = false;
                break;
        }
    }

    while (matrixDepth-- > 0) rlPopMatrix();
    (void)userScissor;
    endFramebufferScissor();
    rlPopMatrix();
}

void rayactWorkerDrawShutdown() {
    for (auto& [path, tex] : g_imageCache)
        if (tex.id != 0) UnloadTexture(tex);
    g_imageCache.clear();
}
