#include "raym3_bridge.hpp"
#include "css_bridge.hpp"
#include "color_parse.hpp"
#include "commit_queue.hpp"
#include "shadow_tree.hpp"
#include "../core/config_loader.hpp"

#include <raym3/v2/View.h>
#include <raym3/v2/Renderer.h>
#include <raym3/v2/Style.h>
#include <raym3/v2/Components.h>
#include <raym3/v2/Density.h>
#include <raym3/v2/IconRenderer.h>
#include <raym3/v2/Input.h>
#include <raym3/v2/MaterialDefaults.h>
#include <raym3/v2/MaterialTokens.h>
#include <raym3/v2/TextInput.h>
#include <raym3/v2/Transitions.h>
#include <raym3/fonts/FontManager.h>
#include <raym3/components/Checkbox.h>
#include <raym3/components/ProgressIndicator.h>
#include <raym3/components/RadioButton.h>
#include <raym3/components/Switch.h>
#include <raym3/styles/Theme.h>
#include <raylib.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <optional>
#include <sstream>
#include <set>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>
#include <regex>
#include <cstdlib>

// Navigation-crash instrumentation: log stale-id node ops and surface teardown
// so a logcat capture during back-nav reveals which fault fires first.
#ifdef RAYACT_ANDROID
#include <android/log.h>
#include <sys/system_properties.h>
#define RAYACT_NAV_LOG(...) __android_log_print(ANDROID_LOG_WARN, "RayactNav", __VA_ARGS__)
#define RAYACT_IME_LOG(...) __android_log_print(ANDROID_LOG_WARN, "RayactIME", __VA_ARGS__)
#else
#define RAYACT_NAV_LOG(...) do { fprintf(stderr, "[RayactNav] "); fprintf(stderr, __VA_ARGS__); fprintf(stderr, "\n"); } while (0)
#define RAYACT_IME_LOG(...) do { } while (0)
#endif

// ─── per-screen state ──────────────────────────────────────────────────────
//
// One QJS context, but N React trees (one per navigation screen). All per-node
// state is per-screen. The bridge functions read/write the CURRENT screen's
// state via `g_currentScreenId` — JS code calls `setCurrentScreen(id)` before
// each screen's React mount, and the rest of the bridge transparently operates
// on that screen's node map / press callbacks / etc.
//
struct ScreenState;  // forward decl (defined later with NativeControlState below)

enum class NativeControlKind { Checkbox, Switch, RadioButton, Slider, RangeSlider };

struct NativeControlState {
    NativeControlKind kind;
    bool checked = false;
    bool disabled = false;
    std::string label;
    float anim = -1.0f; // eased 0..1 toggle progress; -1 = uninitialized
    float animFrom = 0.0f;
    float animTarget = -1.0f;
    float animElapsedMs = 0.0f;
    // Slider state.
    float value = 0.0f;
    float minValue = 0.0f;
    float maxValue = 1.0f;
    float step = 0.0f;   // 0 = continuous
    bool dragging = false;
    int draggingThumb = -1;
    float startValue = 0.25f;
    float endValue = 0.75f;
    float sliderTrackH  = 16.0f;
    float sliderHandleH = 44.0f;
};

// `g_nodes`, `g_root`, `g_pressCallbacks` are kept as live maps for back-compat
// with main.cpp's render loop (which iterates `g_nodes` for hit-testing). They
// are kept in sync with the current screen's state via SaveCurrentScreen() /
// LoadCurrentScreen() called from setCurrentScreen.

struct ScreenState {
    std::map<int, raym3::v2::NodePtr> nodes;
    raym3::v2::NodePtr root;
    std::map<int, JSValue> pressCallbacks;
    std::map<int, std::string> nodeClassNames;
    std::map<int, JSValue> changeTextCallbacks;
    std::map<int, JSValue> focusCallbacks;
    std::map<int, JSValue> blurCallbacks;
    std::map<int, JSValue> submitEditingCallbacks;
    std::map<int, JSValue> endEditingCallbacks;
    std::map<int, JSValue> selectionChangeCallbacks;
    std::map<int, JSValue> changeValueCallbacks;
    std::map<int, JSValue> scrollCallbacks;
    std::map<int, JSValue> requestCloseCallbacks;
    std::map<int, NativeControlState> nativeControlStates;
    std::map<int, raym3::v2::M3Component> materialComponentKinds;
    int nextNodeId = 1;
};

static std::map<int, ScreenState> g_screens;
static int g_currentScreenId = 0;     // 0 = legacy single-screen (always present)
static int g_nextScreenId = 1;        // ids 1+ are navigation screens
// Z-order stack: index 0 = bottom (root screen 0), back = topmost (focused).
// Empty by default — populated when the host (Android NavigationHost) pushes.
static std::vector<int> g_screenStack;

// ─── globals (mirrors of current screen) ──────────────────────────────────

std::map<int, raym3::v2::NodePtr> g_nodes;
raym3::v2::NodePtr g_root;
std::map<int, JSValue> g_pressCallbacks;
JSContext* g_bridge_ctx = nullptr;

static std::map<int, std::string> g_nodeClassNames;
static std::map<int, int> g_nodeParents;
static std::vector<int> g_deferredPressCallbacks;
static std::vector<int> g_deferredRequestCloseCallbacks;
// Native-allocated node ids are ODD; JS-owned (command-buffer) ids are EVEN
// (allocNodeId in commandBuffer.ts). Disjoint by parity so the two id spaces
// never collide — robust against per-instance resets that set g_nextNodeId back
// to 1 (raym3BridgeClearRuntimeGlobals / ImportRuntimeStorage). Both stay
// low/dense so the animated style slab (indexed by id) holds them.
static int g_nextNodeId = 1;  // odd; stepped by 2 via nextNativeNodeId()
static inline int nextNativeNodeId() {
    int id = g_nextNodeId;
    g_nextNodeId += 2;
    return id;
}

// ─── native animated render-only styles ───────────────────────────────────

static constexpr int kAnimatedStyleSlots = 8;
static constexpr int kAnimatedStyleMaxNodes = 65536;
static constexpr int kAnimatedTranslateX = 0;
static constexpr int kAnimatedTranslateY = 1;
static constexpr int kAnimatedScale = 2;
static constexpr int kAnimatedOpacity = 3;
static constexpr int kAnimatedRotation = 4;
static constexpr int kAnimatedDirty = 5;
static constexpr int kAnimatedGeneration = 6;

static std::vector<float> g_animatedStyleBuffer(
    (size_t)kAnimatedStyleMaxNodes * (size_t)kAnimatedStyleSlots, 0.0f);
static std::set<int> g_animatedNodes;

struct StyleAnimation {
    int nodeId = 0;
    bool active[5] = {false, false, false, false, false};
    float from[5] = {0, 0, 1, 1, 0};
    float to[5] = {0, 0, 1, 1, 0};
    double startMs = 0.0;
    double durationMs = 0.0;
    JSValue onComplete = JS_UNDEFINED;
};

static std::unordered_map<int, StyleAnimation> g_styleAnimations;

static double animatedNowMs() {
    using clock = std::chrono::steady_clock;
    static const auto epoch = clock::now();
    return std::chrono::duration<double, std::milli>(clock::now() - epoch).count();
}

static float easeInOutCubicNative(float t) {
    return t < 0.5f ? 4.0f * t * t * t : 1.0f - powf(-2.0f * t + 2.0f, 3.0f) / 2.0f;
}

static int animatedOffsetForKey(const char* key) {
    if (!key) return -1;
    if (strcmp(key, "translateX") == 0) return kAnimatedTranslateX;
    if (strcmp(key, "translateY") == 0) return kAnimatedTranslateY;
    if (strcmp(key, "scale") == 0) return kAnimatedScale;
    if (strcmp(key, "opacity") == 0) return kAnimatedOpacity;
    if (strcmp(key, "rotation") == 0) return kAnimatedRotation;
    return -1;
}

static bool animatedNodeIndex(int nodeId, size_t& base) {
    if (nodeId < 0 || nodeId >= kAnimatedStyleMaxNodes) return false;
    base = (size_t)nodeId * (size_t)kAnimatedStyleSlots;
    return base + kAnimatedStyleSlots <= g_animatedStyleBuffer.size();
}

static float animatedDefaultForOffset(int offset) {
    return (offset == kAnimatedScale || offset == kAnimatedOpacity) ? 1.0f : 0.0f;
}

// Seed identity defaults (scale=1, opacity=1) the first time a node becomes
// animated. The style buffer is zero-initialized, but applyAnimatedStylesToNodes
// applies ALL five slots every frame — so a partial animation (e.g. the stack's
// slide_from_right sets only translateX) would otherwise stamp scale=0/opacity=0
// onto the node and render it invisible (the "offscreen animation → black
// screen" bug).
static void ensureAnimatedDefaults(int nodeId, size_t base) {
    if (g_animatedNodes.find(nodeId) != g_animatedNodes.end()) return;
    g_animatedStyleBuffer[base + kAnimatedScale] = 1.0f;
    g_animatedStyleBuffer[base + kAnimatedOpacity] = 1.0f;
}

static void setAnimatedStyleValue(int nodeId, int offset, float value) {
    size_t base = 0;
    if (!animatedNodeIndex(nodeId, base) || offset < 0 || offset >= 5) return;
    ensureAnimatedDefaults(nodeId, base);
    g_animatedStyleBuffer[base + (size_t)offset] = value;
    g_animatedStyleBuffer[base + kAnimatedDirty] = 1.0f;
    g_animatedNodes.insert(nodeId);
}

static float getAnimatedStyleValue(int nodeId, int offset) {
    size_t base = 0;
    if (!animatedNodeIndex(nodeId, base) || offset < 0 || offset >= 5)
        return animatedDefaultForOffset(offset);
    return g_animatedStyleBuffer[base + (size_t)offset];
}

static void applyAnimatedValueToStyle(raym3::v2::Style& style, int offset, float value) {
    switch (offset) {
        case kAnimatedTranslateX: style.translateX = value; break;
        case kAnimatedTranslateY: style.translateY = value; break;
        case kAnimatedScale:      style.scale = value; break;
        case kAnimatedOpacity:    style.opacity = value; break;
        case kAnimatedRotation:   style.rotation = value; break;
    }
}

static void clearAnimatedNode(JSContext* ctx, int nodeId) {
    auto anim = g_styleAnimations.find(nodeId);
    if (anim != g_styleAnimations.end()) {
        if (!JS_IsUndefined(anim->second.onComplete)) JS_FreeValue(ctx, anim->second.onComplete);
        g_styleAnimations.erase(anim);
    }
    size_t base = 0;
    if (animatedNodeIndex(nodeId, base)) {
        for (int i = 0; i < kAnimatedStyleSlots; ++i) g_animatedStyleBuffer[base + (size_t)i] = 0.0f;
    }
    g_animatedNodes.erase(nodeId);
}

static void captureNodeClassName(JSContext* ctx, int id, JSValueConst styleObj) {
    if (!JS_IsObject(styleObj)) return;
    JSValue classVal = JS_GetPropertyStr(ctx, styleObj, "className");
    if (JS_IsString(classVal)) {
        const char* classStr = JS_ToCString(ctx, classVal);
        if (classStr) {
            if (classStr[0]) g_nodeClassNames[id] = classStr;
            else g_nodeClassNames.erase(id);
            JS_FreeCString(ctx, classStr);
        }
    }
    JS_FreeValue(ctx, classVal);
}

static std::vector<Texture2D> g_textures;
static std::map<int, JSValue> g_changeTextCallbacks;
static std::map<int, JSValue> g_focusCallbacks;
static std::map<int, JSValue> g_blurCallbacks;
// TextInput react-native parity callbacks.
static std::map<int, JSValue> g_submitEditingCallbacks;
static std::map<int, JSValue> g_endEditingCallbacks;
static std::map<int, JSValue> g_selectionChangeCallbacks;
static std::map<int, JSValue> g_scrollCallbacks;
static std::map<int, JSValue> g_requestCloseCallbacks;
static std::map<int, JSValue> g_dragStartCallbacks;
static std::map<int, JSValue> g_dragMoveCallbacks;
static std::map<int, JSValue> g_dragEndCallbacks;
static std::map<int, JSValue> g_layoutCallbacks;

static std::map<int, NativeControlState> g_nativeControlStates;
static std::map<int, raym3::v2::M3Component> g_materialComponentKinds;
static std::set<int> g_scrollViewIds;

struct SafeAreaInsets {
    float top = 0.0f;
    float right = 0.0f;
    float bottom = 0.0f;
    float left = 0.0f;
};

static SafeAreaInsets g_safeAreaInsets;
static std::map<int, raym3::v2::Style> g_safeAreaBaseStyles;

static float maxPadding(float current, float inset) {
    return std::max(current, inset);
}

static int utf8NextByteLocal(const std::string& text, int pos) {
    if (pos < 0) return 0;
    if (pos >= (int)text.size()) return (int)text.size();
    unsigned char c = (unsigned char)text[(size_t)pos];
    int len = 1;
    if ((c & 0x80) == 0) len = 1;
    else if ((c & 0xE0) == 0xC0) len = 2;
    else if ((c & 0xF0) == 0xE0) len = 3;
    else if ((c & 0xF8) == 0xF0) len = 4;
    return std::min((int)text.size(), pos + len);
}

static int utf8PrevByteLocal(const std::string& text, int pos) {
    if (pos <= 0) return 0;
    pos = std::min(pos, (int)text.size());
    do {
        --pos;
    } while (pos > 0 && (((unsigned char)text[(size_t)pos] & 0xC0) == 0x80));
    return pos;
}

static uint32_t utf8CodepointAtLocal(const std::string& text, int pos) {
    if (pos < 0 || pos >= (int)text.size()) return 0;
    unsigned char c = (unsigned char)text[(size_t)pos];
    if ((c & 0x80) == 0) return c;
    if ((c & 0xE0) == 0xC0 && pos + 1 < (int)text.size())
        return ((uint32_t)(c & 0x1F) << 6) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 1] & 0x3F));
    if ((c & 0xF0) == 0xE0 && pos + 2 < (int)text.size())
        return ((uint32_t)(c & 0x0F) << 12) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 1] & 0x3F) << 6) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 2] & 0x3F));
    if ((c & 0xF8) == 0xF0 && pos + 3 < (int)text.size())
        return ((uint32_t)(c & 0x07) << 18) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 1] & 0x3F) << 12) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 2] & 0x3F) << 6) |
               ((uint32_t)((unsigned char)text[(size_t)pos + 3] & 0x3F));
    return c;
}

static int utf16OffsetToUtf8ByteLocal(const std::string& text, int utf16Offset) {
    if (utf16Offset < 0) return -1;
    int u16 = 0;
    int byte = 0;
    while (byte < (int)text.size() && u16 < utf16Offset) {
        uint32_t cp = utf8CodepointAtLocal(text, byte);
        int next = utf8NextByteLocal(text, byte);
        int units = cp > 0xFFFF ? 2 : 1;
        if (u16 + units > utf16Offset) break;
        u16 += units;
        byte = next;
    }
    return byte;
}

static int utf8ByteToUtf16OffsetLocal(const std::string& text, int byteOffset) {
    if (byteOffset < 0) return -1;
    byteOffset = std::clamp(byteOffset, 0, (int)text.size());
    int u16 = 0;
    for (int byte = 0; byte < byteOffset; byte = utf8NextByteLocal(text, byte)) {
        uint32_t cp = utf8CodepointAtLocal(text, byte);
        u16 += cp > 0xFFFF ? 2 : 1;
    }
    return u16;
}

static raym3::v2::Style applySafeAreaPadding(raym3::v2::Style style) {
    style.padding.top = maxPadding(style.padding.Top(), g_safeAreaInsets.top);
    style.padding.right = maxPadding(style.padding.Right(), g_safeAreaInsets.right);
    style.padding.bottom = maxPadding(style.padding.Bottom(), g_safeAreaInsets.bottom);
    style.padding.left = maxPadding(style.padding.Left(), g_safeAreaInsets.left);
    return style;
}

static void refreshSafeAreaStyles() {
    for (const auto& [id, baseStyle] : g_safeAreaBaseStyles) {
        auto nodeIt = g_nodes.find(id);
        if (nodeIt != g_nodes.end() && nodeIt->second) {
            nodeIt->second->style = applySafeAreaPadding(baseStyle);
        }
    }
}

void setSafeAreaInsets(float top, float right, float bottom, float left) {
    g_safeAreaInsets.top = std::max(0.0f, top);
    g_safeAreaInsets.right = std::max(0.0f, right);
    g_safeAreaInsets.bottom = std::max(0.0f, bottom);
    g_safeAreaInsets.left = std::max(0.0f, left);
    refreshSafeAreaStyles();
}

void resolvePopoverAnchors() {
    for (auto& [id, node] : g_nodes) {
        if (node && node->anchorId > 0) {
            auto anchorIt = g_nodes.find(node->anchorId);
            if (anchorIt != g_nodes.end() && anchorIt->second) {
                node->anchorRect = anchorIt->second->layout;
            } else {
                node->anchorRect = std::nullopt;
            }
        }
    }
}

// ─── icon sprite sheet ─────────────────────────────────────────────────────
// All icons used by the app are rasterized once into a single RenderTexture.
// Rendering uses DrawTextureRec (one UV copy) instead of DrawTextEx (glyph
// lookup + advance loop). All icons on screen share one texture → Raylib
// batches every icon draw call into a single GPU draw.

struct IconKey {
    int cp;   // Unicode codepoint
    int size; // pixel size (float rounded to int)
    bool filled;
    bool operator<(const IconKey& o) const {
        if (cp != o.cp) return cp < o.cp;
        if (size != o.size) return size < o.size;
        return filled < o.filled;
    }
};

struct IconFontKey {
    int size;
    bool filled;
    bool operator<(const IconFontKey& o) const {
        return size != o.size ? size < o.size : filled < o.filled;
    }
};

struct IconRenderState {
    std::string glyph;
    int codepoint = 0;
    float size = 24.0f;
    Color color = WHITE;
    bool filled = false;
    std::string variant = "rounded";
};

static std::map<IconFontKey, Font> g_iconFonts; // (size, fill) → Font
static std::set<int>            g_iconCPSet;    // codepoints loaded into fonts
static std::size_t              g_iconCPSetVer = 0;
static std::map<IconFontKey, std::size_t> g_iconFontVer;
static std::map<int, IconRenderState> g_iconRenderStates;

// Sprite sheet state — built once after JS init via buildIconSpriteSheet()
static std::set<IconKey>         g_iconRequests;  // (cp, size) pairs registered during init
static Texture2D                 g_iconSheet = {0};
static std::map<IconKey, Rectangle> g_iconSheetRects; // UV pixel rects in g_iconSheet

// Search order must match material_icons.js. That map currently uses classic
// Material Icons codepoints; loading Material Symbols first produces .notdef
// glyphs for many names.
static const char* kFilledIconFontCandidates[] = {
    "./rayact/resources/fonts/MaterialIcons-Regular.ttf",
    "./rayact/resources/fonts/MaterialSymbolsRounded-Filled.ttf",
    "./rayact/resources/fonts/MaterialSymbolsRounded.ttf",
    "./resources/fonts/MaterialIcons-Regular.ttf",
    "./resources/fonts/MaterialSymbolsRounded-Filled.ttf",
    "./resources/fonts/MaterialSymbolsRounded.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    nullptr
};

static const char* kOutlinedIconFontCandidates[] = {
    "./rayact/resources/fonts/MaterialIcons-Regular.ttf",
    "./rayact/resources/fonts/MaterialSymbolsRounded.ttf",
    "./rayact/resources/fonts/MaterialSymbolsRounded-Filled.ttf",
    "./resources/fonts/MaterialIcons-Regular.ttf",
    "./resources/fonts/MaterialSymbolsRounded.ttf",
    "./resources/fonts/MaterialSymbolsRounded-Filled.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    nullptr
};

static void DrawSliderTrackSegment(Rectangle r, float leftRadius,
                                   float rightRadius, Color color) {
    if (r.width <= 0.5f || r.height <= 0.5f) return;
    leftRadius = std::clamp(leftRadius, 0.0f, r.height * 0.5f);
    rightRadius = std::clamp(rightRadius, 0.0f, r.height * 0.5f);
    float left = r.x;
    float right = r.x + r.width;
    float top = r.y;
    float bottom = r.y + r.height;
    DrawRectangleRec({left + leftRadius, top, std::max(0.0f, r.width - leftRadius - rightRadius), r.height}, color);
    DrawRectangleRec({left, top + leftRadius, leftRadius, std::max(0.0f, r.height - leftRadius * 2.0f)}, color);
    DrawRectangleRec({right - rightRadius, top + rightRadius, rightRadius, std::max(0.0f, r.height - rightRadius * 2.0f)}, color);
    if (leftRadius > 0.0f) {
        DrawCircleSector({left + leftRadius, top + leftRadius}, leftRadius, 180.0f, 270.0f, 12, color);
        DrawCircleSector({left + leftRadius, bottom - leftRadius}, leftRadius, 90.0f, 180.0f, 12, color);
    }
    if (rightRadius > 0.0f) {
        DrawCircleSector({right - rightRadius, top + rightRadius}, rightRadius, 270.0f, 360.0f, 12, color);
        DrawCircleSector({right - rightRadius, bottom - rightRadius}, rightRadius, 0.0f, 90.0f, 12, color);
    }
}

static float easeInOutCubic(float t) {
    t = std::clamp(t, 0.0f, 1.0f);
    return t < 0.5f ? 4.0f * t * t * t
                    : 1.0f - std::pow(-2.0f * t + 2.0f, 3.0f) * 0.5f;
}

static Color lerpColor(Color a, Color b, float t) {
    t = std::clamp(t, 0.0f, 1.0f);
    auto channel = [t](unsigned char from, unsigned char to) {
        return (unsigned char)std::round((float)from + ((float)to - (float)from) * t);
    };
    return {channel(a.r, b.r), channel(a.g, b.g), channel(a.b, b.b),
            channel(a.a, b.a)};
}

static Rectangle centeredRect(Rectangle outer, float width, float height) {
    return {outer.x + (outer.width - width) * 0.5f,
            outer.y + (outer.height - height) * 0.5f,
            width, height};
}

static float roundedRectRoundness(float width, float height, float radius) {
    float minDim = std::min(width, height);
    return minDim > 0.0f ? std::clamp((2.0f * radius) / minDim, 0.0f, 1.0f)
                         : 0.0f;
}

static void paintNativeMaterialCheckmark(Rectangle r, Color color) {
    Vector2 c = {r.x + r.width * 0.5f, r.y + r.height * 0.5f};
    float s = std::min(r.width, r.height) * 0.5f;
    Vector2 p1 = {c.x - s * 0.5f, c.y};
    Vector2 p2 = {c.x - s * 0.1f, c.y + s * 0.45f};
    Vector2 p3 = {c.x + s * 0.55f, c.y - s * 0.45f};
    DrawLineEx(p1, p2, 2.0f, color);
    DrawLineEx(p2, p3, 2.0f, color);
}

static void paintNativeMaterialCheckbox(Rectangle layout,
                                        const NativeControlState& state,
                                        float progress, bool pressed) {
    using namespace raym3::v2;
    const auto& scheme = raym3::Theme::GetColorScheme();
    Rectangle visual = centeredRect(layout, tokens::kCheckboxVisualSize,
                                    tokens::kCheckboxVisualSize);
    float t = std::clamp(progress, 0.0f, 1.0f);
    bool selected = t >= 0.5f;
    float opacity = state.disabled ? tokens::kDisabledContentOpacity : 1.0f;

    Color border = selected ? Color{0, 0, 0, 0} : scheme.onSurfaceVariant;
    Color fill = scheme.primary;
    Color mark = scheme.onPrimary;
    if (state.disabled) {
        border = selected ? Color{0, 0, 0, 0} : scheme.onSurface;
        fill = scheme.onSurface;
        mark = scheme.surface;
    } else if (pressed && !selected) {
        border = scheme.onSurface;
    }

    if (pressed && !state.disabled) {
        Vector2 center = {layout.x + layout.width * 0.5f,
                          layout.y + layout.height * 0.5f};
        DrawCircleV(center, tokens::kStateLayerSize * 0.5f,
                    ColorAlpha(selected ? scheme.onSurface : scheme.primary,
                               tokens::kPressedStateOpacity));
    }

    float fillAlpha = selected ? opacity : opacity * t;
    if (fillAlpha > 0.0f) {
        float roundness = roundedRectRoundness(visual.width, visual.height, 2.0f);
        DrawRectangleRounded(visual, roundness, 8, ColorAlpha(fill, fillAlpha));
    }
    if (!selected) {
        float roundness = roundedRectRoundness(visual.width, visual.height, 2.0f);
        DrawRectangleRoundedLinesEx(visual, roundness, 8, 2.0f,
                                    ColorAlpha(border, opacity));
    }
    if (t > 0.0f) {
        paintNativeMaterialCheckmark(visual, ColorAlpha(mark, opacity * t));
    }
}

static void paintNativeMaterialRadio(Rectangle layout,
                                     const NativeControlState& state,
                                     float progress, bool pressed) {
    using namespace raym3::v2;
    const auto& scheme = raym3::Theme::GetColorScheme();
    Rectangle visual = centeredRect(layout, tokens::kRadioVisualSize,
                                    tokens::kRadioVisualSize);
    float t = std::clamp(progress, 0.0f, 1.0f);
    bool selected = t >= 0.5f;
    float opacity = state.disabled ? tokens::kDisabledContentOpacity : 1.0f;
    Vector2 center = {visual.x + visual.width * 0.5f,
                      visual.y + visual.height * 0.5f};
    Color color = selected ? scheme.primary : scheme.onSurfaceVariant;
    if (state.disabled) color = scheme.onSurface;
    else if (pressed && !selected) color = scheme.onSurface;

    if (pressed && !state.disabled) {
        Vector2 stateCenter = {layout.x + layout.width * 0.5f,
                               layout.y + layout.height * 0.5f};
        DrawCircleV(stateCenter, tokens::kStateLayerSize * 0.5f,
                    ColorAlpha(selected ? scheme.onSurface : scheme.primary,
                               tokens::kPressedStateOpacity));
    }

    float outer = tokens::kRadioVisualSize * 0.5f;
    DrawRing(center, outer - 2.0f, outer, 0.0f, 360.0f, 32,
             ColorAlpha(color, opacity));
    if (t > 0.0f) {
        DrawCircleV(center, 4.5f * t, ColorAlpha(scheme.primary, opacity));
    }
}

static void paintNativeMaterialSwitch(Rectangle layout, const NativeControlState& state,
                                      float progress, bool pressed) {
    using namespace raym3::v2;
    const auto& scheme = raym3::Theme::GetColorScheme();
    Rectangle track = centeredRect(layout, tokens::kSwitchTrackWidth,
                                   tokens::kSwitchTrackHeight);
    float t = std::clamp(progress, 0.0f, 1.0f);
    bool selected = t >= 0.5f;
    float opacity = state.disabled ? tokens::kDisabledContentOpacity : 1.0f;

    Color offTrack = scheme.surfaceContainerHighest;
    Color onTrack = scheme.primary;
    Color offThumb = scheme.outline;
    Color onThumb = scheme.onPrimary;
    Color trackColor = lerpColor(offTrack, onTrack, t);
    Color thumbColor = lerpColor(offThumb, onThumb, t);
    Color iconColor = selected ? scheme.onPrimaryContainer
                               : scheme.surfaceContainerHighest;
    if (state.disabled) {
        trackColor = ColorAlpha(scheme.onSurface, tokens::kDisabledContainerOpacity);
        thumbColor = selected ? scheme.surface : scheme.onSurface;
        iconColor = scheme.onSurface;
    }

    DrawRectangleRounded(track, 1.0f, 16, ColorAlpha(trackColor, opacity));
    if (t < 0.5f && !state.disabled) {
        DrawRectangleRoundedLinesEx({track.x + 1.0f, track.y + 1.0f,
                                      track.width - 2.0f, track.height - 2.0f},
                                     1.0f,
                                     16, 2.0f, scheme.outline);
    }

    float thumbSize = tokens::kSwitchInactiveThumbSize +
                      (tokens::kSwitchActiveThumbSize -
                       tokens::kSwitchInactiveThumbSize) * t;
    if (pressed) thumbSize = tokens::kSwitchPressedThumbSize;
    float cy = track.y + track.height * 0.5f;
    float offX = track.x + track.height * 0.5f;
    float onX = track.x + track.width - track.height * 0.5f;
    float cx = offX + (onX - offX) * t;
    Rectangle thumb = {cx - thumbSize * 0.5f, cy - thumbSize * 0.5f,
                       thumbSize, thumbSize};

    if (pressed && !state.disabled) {
        Rectangle stateLayer = centeredRect({cx - 0.5f, cy - 0.5f, 1.0f, 1.0f},
                                            tokens::kStateLayerSize,
                                            tokens::kStateLayerSize);
        DrawCircleV({stateLayer.x + stateLayer.width * 0.5f,
                     stateLayer.y + stateLayer.height * 0.5f},
                    stateLayer.width * 0.5f,
                    ColorAlpha(selected ? scheme.primary : scheme.onSurface,
                               tokens::kPressedStateOpacity));
    }

    DrawRectangleRounded(thumb, 1.0f, 16, ColorAlpha(thumbColor, opacity));
    if (thumbSize >= tokens::kSwitchActiveThumbSize - 0.1f) {
        raym3::v2::DrawMaterialIcon(selected ? 0xe5ca : 0xe5cd, thumb,
                                    ColorAlpha(iconColor, opacity),
                                    (int)tokens::kSwitchIconSize, true);
    }
}

static int iconPixelSize(int sizeDp) {
    return raym3::v2::Density::RasterPixels((float)sizeDp);
}

static const char* findIconFontPath(bool filled) {
    static std::string s_found;
    auto tryPath = [&](const std::string& p) -> const char* {
        FILE* f = fopen(p.c_str(), "rb");
        if (f) { fclose(f); s_found = p; return s_found.c_str(); }
        return nullptr;
    };
    const char* assets = rayact::appAssetsPath();
    if (assets && *assets) {
        const char* rels[] = {
            "resources/fonts/MaterialIcons-Regular.ttf",
            filled ? "resources/fonts/MaterialSymbolsRounded-Filled.ttf"
                   : "resources/fonts/MaterialSymbolsRounded.ttf",
            filled ? "resources/fonts/MaterialSymbolsRounded.ttf"
                   : "resources/fonts/MaterialSymbolsRounded-Filled.ttf",
            nullptr
        };
        for (int i = 0; rels[i]; i++) {
            if (auto hit = tryPath(std::string(assets) + "/" + rels[i])) return hit;
        }
    }
    const char** candidates = filled ? kFilledIconFontCandidates : kOutlinedIconFontCandidates;
    for (int i = 0; candidates[i]; i++) {
        if (auto hit = tryPath(candidates[i])) return hit;
    }
    return nullptr;
}

// Register a (codepoint, size) pair. Also invalidates font cache if new CP.
static void requireIcon(int cp, int size, bool filled) {
    g_iconRequests.insert({cp, size, filled});
    raym3::v2::RegisterMaterialIcon(cp, size, filled);
    if (!g_iconCPSet.count(cp)) {
        g_iconCPSet.insert(cp);
        g_iconCPSetVer++;
        for (auto& [sz, font] : g_iconFonts)
            if (font.texture.id != 0) ::UnloadFont(font);
        g_iconFonts.clear();
        g_iconFontVer.clear();
    }
}

// Returns a font loaded with ONLY the codepoints that have been requested via
// createIcon — keeps the atlas small (one glyph per icon used, not all 2188).
static Font getIconFont(int size, bool filled) {
    IconFontKey fontKey{size, filled};
    auto verIt = g_iconFontVer.find(fontKey);
    if (verIt != g_iconFontVer.end() && verIt->second == g_iconCPSetVer) {
        return g_iconFonts[fontKey]; // cache hit, CP set unchanged
    }

    // Unload stale entry for this size if present
    auto it = g_iconFonts.find(fontKey);
    if (it != g_iconFonts.end() && it->second.texture.id != 0)
        ::UnloadFont(it->second);

    const char* path = findIconFontPath(filled);
    Font font = {0};
    if (path && !g_iconCPSet.empty()) {
        std::vector<int> cps(g_iconCPSet.begin(), g_iconCPSet.end());
        font = LoadFontEx(path, iconPixelSize(size), cps.data(), (int)cps.size());
        printf("Icon font: loaded %d %s glyph(s) at size %d\n",
               (int)cps.size(), filled ? "filled" : "outlined", size);
    }
    if (font.texture.id == 0) font = GetFontDefault();
    g_iconFonts[fontKey]    = font;
    g_iconFontVer[fontKey]  = g_iconCPSetVer;
    return font;
}

// Drop all GPU-side icon-sheet state WITHOUT unloading: the graphics device
// was re-initialized, so the held texture/font ids are stale (and may already
// be reused by the new device). g_iconRequests/g_iconCPSet are kept so
// buildIconSpriteSheet() can rebuild from the same registrations (icon fonts
// reload from disk on demand).
void rayactResetIconSheet() {
    g_iconSheet = {0};
    g_iconSheetRects.clear();
    g_iconFonts.clear();
    g_iconFontVer.clear();
}

// Build sprite sheet from all (cp, size) pairs registered during JS init.
// Called once after JS finishes executing, before the render loop starts.
// After this, all icon render lambdas use DrawTextureRec instead of DrawTextEx.
void buildIconSpriteSheet() {
    // g_iconRequests travels with the runtime (per-runtime storage), but
    // g_iconCPSet is process-global and gets reset when another engine
    // runtime bootstraps. Re-derive it here so a post-re-init rebuild loads
    // the real icon font instead of falling back to the default font (which
    // baked "?" tofu glyphs into the sheet).
    for (const auto& key : g_iconRequests) {
        if (g_iconCPSet.insert(key.cp).second) g_iconCPSetVer++;
    }
    if (g_iconRequests.empty() || !IsWindowReady()) return;

    const int PAD = 2;

    // UTF-8 encode a codepoint
    auto cpToUtf8 = [](int cp, char out[5]) {
        if (cp < 0x80) {
            out[0] = (char)cp; out[1] = 0;
        } else if (cp < 0x800) {
            out[0] = (char)(0xC0|(cp>>6));   out[1] = (char)(0x80|(cp&0x3F)); out[2]=0;
        } else {
            out[0] = (char)(0xE0|(cp>>12));
            out[1] = (char)(0x80|((cp>>6)&0x3F));
            out[2] = (char)(0x80|(cp&0x3F)); out[3]=0;
        }
    };

    // Each icon gets a SQUARE dpi-scaled cell. Font metrics (offsetY, advance,
    // line height) do NOT reliably center the visual glyph — different icons have
    // different ink bearings, so trusting metrics leaves them sitting high/low.
    // Instead build the atlas on the CPU: scan each glyph bitmap for its actual
    // ink bounds (first/last opaque pixel) and blit ONLY the ink, centered, into
    // the cell. This centers every icon by its real pixels, uniformly.
    struct Entry { IconKey key; float x; float cellPx; };
    std::vector<Entry> entries;
    float curX = PAD;
    int maxCell = 0;
    for (const auto& key : g_iconRequests) {
        int cellPx = iconPixelSize(key.size);
        entries.push_back({key, curX, (float)cellPx});
        curX += cellPx + PAD * 2;
        maxCell = std::max(maxCell, cellPx);
    }
    if (entries.empty()) return;

    // Round up to power-of-2 dimensions
    int texW = 1, texH = 1;
    int rawW = (int)curX + PAD, rawH = maxCell + PAD * 2;
    while (texW < rawW) texW <<= 1;
    while (texH < rawH) texH <<= 1;

    Image atlas = GenImageColor(texW, texH, Color{0, 0, 0, 0});
    ImageFormat(&atlas, PIXELFORMAT_UNCOMPRESSED_R8G8B8A8);
    for (auto& e : entries) {
        Font font = getIconFont(e.key.size, e.key.filled);
        float cell = e.cellPx;
        int gidx = GetGlyphIndex(font, e.key.cp);
        Image g = font.glyphs[gidx].image; // rasterized glyph bitmap at baseSize
        // Actual ink bounds (alpha or luminance > threshold).
        int top = g.height, bot = -1, left = g.width, right = -1;
        for (int y = 0; y < g.height; ++y)
            for (int x = 0; x < g.width; ++x) {
                Color p = GetImageColor(g, x, y);
                if (p.a > 16 || p.r > 16) {
                    if (y < top) top = y;
                    if (y > bot) bot = y;
                    if (x < left) left = x;
                    if (x > right) right = x;
                }
            }
        if (bot >= top && right >= left) {
            float inkW = (float)(right - left + 1), inkH = (float)(bot - top + 1);
            float scale = font.baseSize > 0 ? cell / (float)font.baseSize : 1.0f;
            float dw = inkW * scale, dh = inkH * scale;
            // Never exceed the cell (keep aspect) for unusually large glyphs.
            float fit = std::min(1.0f, std::min(cell / dw, cell / dh));
            dw *= fit; dh *= fit;
            Rectangle src = {(float)left, (float)top, inkW, inkH};
            Rectangle dst = {e.x + (cell - dw) * 0.5f, PAD + (cell - dh) * 0.5f, dw, dh};
            ImageDrawImagePro(&atlas, g, src, dst, (Vector2){0, 0}, 0.0f, WHITE);
        }
        g_iconSheetRects[e.key] = {e.x, (float)PAD, cell, cell};
    }

    if (g_iconSheet.id != 0) UnloadTexture(g_iconSheet);
    g_iconSheet = LoadTextureFromImage(atlas);
    SetTextureFilter(g_iconSheet, TEXTURE_FILTER_BILINEAR);
    if (std::getenv("RAYACT_ATLAS_DBG")) ExportImage(atlas, "atlas.png");
    UnloadImage(atlas);

    // Icon fonts no longer needed for rendering — all glyphs are now in the
    // sprite sheet. Unloading frees the per-size font texture atlases from VRAM/RAM.
    for (auto& [sz, font] : g_iconFonts)
        if (font.texture.id != 0) ::UnloadFont(font);
    g_iconFonts.clear();
    g_iconFontVer.clear();

    printf("Icon sprite sheet built: %dx%d px, %zu icon(s)\n",
           texW, texH, entries.size());
}

// ─── helpers ───────────────────────────────────────────────────────────────

static Color colorFromUint(uint32_t c) {
    return {
        (unsigned char)((c >> 24) & 0xFF),
        (unsigned char)((c >> 16) & 0xFF),
        (unsigned char)((c >>  8) & 0xFF),
        (unsigned char)( c        & 0xFF)
    };
}

static std::optional<Color> jsToColor(JSContext* ctx, JSValueConst v) {
    if (JS_IsUndefined(v) || JS_IsNull(v)) return std::nullopt;
    if (JS_IsString(v)) {
        const char* s = JS_ToCString(ctx, v);
        if (!s) return std::nullopt;
        Color c = ParseCssColorToRaylib(s);
        JS_FreeCString(ctx, s);
        return c;
    }
    uint32_t c;
    if (JS_ToUint32(ctx, &c, v) == 0) return colorFromUint(c);
    return std::nullopt;
}

static std::optional<float> jsGetFloat(JSContext* ctx, JSValue obj, const char* key) {
    JSValue v = JS_GetPropertyStr(ctx, obj, key);
    std::optional<float> result;
    if (!JS_IsUndefined(v) && !JS_IsNull(v)) {
        double d;
        if (JS_ToFloat64(ctx, &d, v) == 0) result = (float)d;
    }
    JS_FreeValue(ctx, v);
    return result;
}

static std::optional<Color> jsGetColor(JSContext* ctx, JSValue obj, const char* key) {
    JSValue v = JS_GetPropertyStr(ctx, obj, key);
    std::optional<Color> result = jsToColor(ctx, v);
    JS_FreeValue(ctx, v);
    return result;
}

static std::string jsGetString(JSContext* ctx, JSValue obj, const char* key) {
    JSValue v = JS_GetPropertyStr(ctx, obj, key);
    std::string result;
    if (!JS_IsUndefined(v) && !JS_IsNull(v)) {
        const char* s = JS_ToCString(ctx, v);
        if (s) { result = s; JS_FreeCString(ctx, s); }
    }
    JS_FreeValue(ctx, v);
    return result;
}

static bool jsGetBool(JSContext* ctx, JSValue obj, const char* key, bool fallback = false) {
    JSValue v = JS_GetPropertyStr(ctx, obj, key);
    bool result = fallback;
    if (!JS_IsUndefined(v) && !JS_IsNull(v)) result = JS_ToBool(ctx, v);
    JS_FreeValue(ctx, v);
    return result;
}

static bool jsHasProperty(JSContext* ctx, JSValue obj, const char* key) {
    JSValue value = JS_GetPropertyStr(ctx, obj, key);
    bool hasValue = !JS_IsUndefined(value) && !JS_IsNull(value);
    JS_FreeValue(ctx, value);
    return hasValue;
}

static raym3::v2::Style parseStyle(JSContext* ctx, JSValue obj);

static std::optional<raym3::FontWeight> parseFontWeightString(const std::string& raw) {
    std::string key;
    key.reserve(raw.size());
    for (char c : raw) {
        if (c != '-' && c != '_' && c != ' ') key.push_back((char)std::tolower((unsigned char)c));
    }
    if (key == "thin" || key == "100") return raym3::FontWeight::Thin;
    if (key == "light" || key == "300") return raym3::FontWeight::Light;
    if (key == "regular" || key == "normal" || key == "400") return raym3::FontWeight::Regular;
    if (key == "medium" || key == "500") return raym3::FontWeight::Medium;
    if (key == "bold" || key == "700") return raym3::FontWeight::Bold;
    if (key == "black" || key == "900") return raym3::FontWeight::Black;
    return std::nullopt;
}

static std::optional<raym3::FontWeight> jsGetFontWeight(JSContext* ctx, JSValue obj, const char* key) {
    JSValue v = JS_GetPropertyStr(ctx, obj, key);
    std::optional<raym3::FontWeight> result;
    if (JS_IsString(v)) {
        const char* s = JS_ToCString(ctx, v);
        if (s) {
            result = parseFontWeightString(s);
            JS_FreeCString(ctx, s);
        }
    } else if (JS_IsNumber(v)) {
        double d = 0.0;
        if (JS_ToFloat64(ctx, &d, v) == 0) {
            result = parseFontWeightString(std::to_string((int)std::round(d)));
        }
    }
    JS_FreeValue(ctx, v);
    return result;
}

static raym3::v2::Style preserveLayoutStyle(const raym3::v2::Style& visualStyle,
                                            const raym3::v2::Style& previousStyle) {
    raym3::v2::Style result = visualStyle;
    // Preserve the caller-set background across a partial (style-less) material
    // update. React sends DIFF payloads, so an AppBar that re-renders because a
    // child/title changed omits its unchanged style — and `visualStyle` is the
    // freshly-rebuilt M3 default (backgroundColor = theme.surface). Without this,
    // an AppBar with a custom backgroundColor (e.g. surfaceVariant) reverted to
    // surface on every such update, so only the JS-level status-bar spacer kept
    // the intended colour ("AppBar only shows the background colour on the status
    // bar"). A real colour change always carries `style`, taking the other branch.
    result.backgroundColor = previousStyle.backgroundColor;
    result.backgroundGradient = previousStyle.backgroundGradient;
    result.display = previousStyle.display;
    result.flexDirection = previousStyle.flexDirection;
    result.justifyContent = previousStyle.justifyContent;
    result.alignItems = previousStyle.alignItems;
    result.alignSelf = previousStyle.alignSelf;
    result.position = previousStyle.position;
    result.overflow = previousStyle.overflow;
    result.pointerEvents = previousStyle.pointerEvents;
    result.width = previousStyle.width;
    result.height = previousStyle.height;
    result.minWidth = previousStyle.minWidth;
    result.minHeight = previousStyle.minHeight;
    result.maxWidth = previousStyle.maxWidth;
    result.maxHeight = previousStyle.maxHeight;
    result.flexGrow = previousStyle.flexGrow;
    result.flexShrink = previousStyle.flexShrink;
    result.flexBasis = previousStyle.flexBasis;
    result.gap = previousStyle.gap;
    result.rowGap = previousStyle.rowGap;
    result.columnGap = previousStyle.columnGap;
    result.margin = previousStyle.margin;
    result.padding = previousStyle.padding;
    result.inset = previousStyle.inset;
    return result;
}

static void enforceNativeControlLayoutDefaults(int id, raym3::v2::Style& style) {
    auto stateIt = g_nativeControlStates.find(id);
    if (stateIt == g_nativeControlStates.end()) return;
    switch (stateIt->second.kind) {
        case NativeControlKind::Slider:
        case NativeControlKind::RangeSlider: {
            auto m = raym3::v2::GetMaterialMetrics(
                stateIt->second.kind == NativeControlKind::RangeSlider
                    ? raym3::v2::M3Component::RangeSlider
                    : raym3::v2::M3Component::Slider);
            if (!style.height || *style.height < m.layoutHeight) style.height = m.layoutHeight;
            if (!style.minHeight || *style.minHeight < m.layoutHeight) style.minHeight = m.layoutHeight;
            if (!style.minWidth || *style.minWidth < m.minWidth) style.minWidth = m.minWidth;
            break;
        }
        case NativeControlKind::Switch: {
            auto m = raym3::v2::GetMaterialMetrics(raym3::v2::M3Component::Switch);
            if (!style.width || *style.width < m.layoutWidth) style.width = m.layoutWidth;
            if (!style.height || *style.height < m.layoutHeight) style.height = m.layoutHeight;
            if (!style.minWidth || *style.minWidth < m.minWidth) style.minWidth = m.minWidth;
            if (!style.minHeight || *style.minHeight < m.minHeight) style.minHeight = m.minHeight;
            break;
        }
        case NativeControlKind::Checkbox:
        case NativeControlKind::RadioButton: {
            raym3::v2::M3Component component =
                stateIt->second.kind == NativeControlKind::Checkbox
                    ? raym3::v2::M3Component::Checkbox
                    : raym3::v2::M3Component::RadioButton;
            auto m = raym3::v2::GetMaterialMetrics(component);
            if (!style.width || *style.width < m.layoutWidth) style.width = m.layoutWidth;
            if (!style.height || *style.height < m.layoutHeight) style.height = m.layoutHeight;
            if (!style.minWidth || *style.minWidth < m.minWidth) style.minWidth = m.minWidth;
            if (!style.minHeight || *style.minHeight < m.minHeight) style.minHeight = m.minHeight;
            break;
        }
    }
}

static raym3::v2::ComponentProps parseMaterialProps(JSContext* ctx, JSValue obj) {
    raym3::v2::ComponentProps props;
    if (!JS_IsObject(obj)) return props;

    props.style = parseStyle(ctx, obj);
    props.label = jsGetString(ctx, obj, "label");
    if (props.label.empty()) props.label = jsGetString(ctx, obj, "text");
    props.disabled = jsGetBool(ctx, obj, "disabled", false);
    props.selected = jsGetBool(ctx, obj, "selected", false);
    props.checked = jsGetBool(ctx, obj, "checked", false);
    props.indeterminate = jsGetBool(ctx, obj, "indeterminate", false);
    props.wavy = jsGetBool(ctx, obj, "wavy", false);
    props.open = jsGetBool(ctx, obj, "open", false);
    props.scrim = jsGetBool(ctx, obj, "scrim", false);
    {
        std::string layout = jsGetString(ctx, obj, "layout");
        if (layout == "row") {
            props.navigationItemLayout = raym3::v2::NavigationItemLayout::Row;
        } else if (layout == "column") {
            props.navigationItemLayout = raym3::v2::NavigationItemLayout::Column;
        }
    }
    if (auto z = jsGetFloat(ctx, obj, "zIndex")) props.zIndex = (int)roundf(*z);
    if (jsHasProperty(ctx, obj, "capturesInput"))
        props.capturesInput = jsGetBool(ctx, obj, "capturesInput", false);
    if (jsHasProperty(ctx, obj, "centerTitle"))
        props.appBarCenterTitle = jsGetBool(ctx, obj, "centerTitle", false);
    if (auto progress = jsGetFloat(ctx, obj, "progress")) props.progress = *progress;
    if (auto start = jsGetFloat(ctx, obj, "startProgress")) props.startProgress = *start;
    if (auto end = jsGetFloat(ctx, obj, "endProgress")) props.endProgress = *end;
    if (auto start = jsGetFloat(ctx, obj, "start")) props.startProgress = *start;
    if (auto end = jsGetFloat(ctx, obj, "end")) props.endProgress = *end;
    if (auto start = jsGetFloat(ctx, obj, "lower")) props.startProgress = *start;
    if (auto end = jsGetFloat(ctx, obj, "upper")) props.endProgress = *end;
    if (auto wavelength = jsGetFloat(ctx, obj, "wavelength")) props.wavelength = *wavelength;
    if (auto anchor = jsGetFloat(ctx, obj, "anchor")) props.anchorId = (int)roundf(*anchor);
    {
        std::string placementStr = jsGetString(ctx, obj, "placement");
        if (placementStr == "below") {
            props.placement = raym3::v2::PopoverPlacement::Below;
        } else if (placementStr == "above") {
            props.placement = raym3::v2::PopoverPlacement::Above;
        } else {
            props.placement = raym3::v2::PopoverPlacement::Auto;
        }
    }
    return props;
}

static std::optional<raym3::v2::M3Component> materialComponentFromString(const std::string& raw) {
    std::string key;
    key.reserve(raw.size());
    for (char c : raw) {
        if (c != '-' && c != '_' && c != ' ') key.push_back((char)std::tolower((unsigned char)c));
    }

    static const std::map<std::string, raym3::v2::M3Component> components = {
        {"appbar", raym3::v2::M3Component::AppBar},
        {"badge", raym3::v2::M3Component::Badge},
        {"banner", raym3::v2::M3Component::Banner},
        {"bottomappbar", raym3::v2::M3Component::BottomAppBar},
        {"bottomsheet", raym3::v2::M3Component::BottomSheet},
        {"datatable", raym3::v2::M3Component::DataTable},
        {"dockedtoolbar", raym3::v2::M3Component::DockedToolbar},
        {"floatingtoolbar", raym3::v2::M3Component::FloatingToolbar},
        {"buttongroup", raym3::v2::M3Component::ButtonGroup},
        {"button", raym3::v2::M3Component::Button},
        {"card", raym3::v2::M3Component::Card},
        {"carousel", raym3::v2::M3Component::Carousel},
        {"checkbox", raym3::v2::M3Component::Checkbox},
        {"chip", raym3::v2::M3Component::Chip},
        {"datepicker", raym3::v2::M3Component::DatePicker},
        {"dialog", raym3::v2::M3Component::Dialog},
        {"divider", raym3::v2::M3Component::Divider},
        {"extendedfab", raym3::v2::M3Component::ExtendedFab},
        {"fab", raym3::v2::M3Component::Fab},
        {"floatingactionbutton", raym3::v2::M3Component::Fab},
        {"fabmenu", raym3::v2::M3Component::FabMenu},
        {"iconbutton", raym3::v2::M3Component::IconButton},
        {"list", raym3::v2::M3Component::List},
        {"loadingindicator", raym3::v2::M3Component::LoadingIndicator},
        {"menu", raym3::v2::M3Component::Menu},
        {"menuitem", raym3::v2::M3Component::MenuItem},
        {"navigationbar", raym3::v2::M3Component::NavigationBar},
        {"navigationbaritem", raym3::v2::M3Component::NavigationBarItem},
        {"navigationdrawer", raym3::v2::M3Component::NavigationDrawer},
        {"navigationrail", raym3::v2::M3Component::NavigationRail},
        {"progressindicator", raym3::v2::M3Component::ProgressIndicator},
        {"radiobutton", raym3::v2::M3Component::RadioButton},
        {"rangeslider", raym3::v2::M3Component::RangeSlider},
        {"search", raym3::v2::M3Component::Search},
        {"searchbar", raym3::v2::M3Component::Search},
        {"segmentedbutton", raym3::v2::M3Component::SegmentedButton},
        {"sidesheet", raym3::v2::M3Component::SideSheet},
        {"slider", raym3::v2::M3Component::Slider},
        {"snackbar", raym3::v2::M3Component::Snackbar},
        {"splitbutton", raym3::v2::M3Component::SplitButton},
        {"switch", raym3::v2::M3Component::Switch},
        {"tabs", raym3::v2::M3Component::Tabs},
        {"textfield", raym3::v2::M3Component::TextField},
        {"timepicker", raym3::v2::M3Component::TimePicker},
        {"toolbar", raym3::v2::M3Component::Toolbar},
        {"tooltip", raym3::v2::M3Component::Tooltip},
        {"popover", raym3::v2::M3Component::Popover},
    };

    auto it = components.find(key);
    if (it == components.end()) return std::nullopt;
    return it->second;
}

struct SliderSizeVals { float trackH, handleH; };
static SliderSizeVals sliderSizeFor(const std::string& s) {
    if (s == "s")  return {24.0f, 44.0f};
    if (s == "m")  return {40.0f, 52.0f};
    if (s == "l")  return {56.0f, 68.0f};
    if (s == "xl") return {96.0f, 108.0f};
    return {raym3::v2::tokens::kSliderTrackHeight,
            raym3::v2::tokens::kSliderHandleHeight};
}

static std::optional<NativeControlKind> nativeControlKindFromString(const std::string& raw) {
    std::string key;
    key.reserve(raw.size());
    for (char c : raw) {
        if (c != '-' && c != '_' && c != ' ') key.push_back((char)std::tolower((unsigned char)c));
    }
    if (key == "checkbox") return NativeControlKind::Checkbox;
    if (key == "switch") return NativeControlKind::Switch;
    if (key == "radiobutton") return NativeControlKind::RadioButton;
    if (key == "slider") return NativeControlKind::Slider;
    if (key == "rangeslider") return NativeControlKind::RangeSlider;
    return std::nullopt;
}

static void invokePressCallbackNow(int id) {
    auto it = g_pressCallbacks.find(id);
    if (it == g_pressCallbacks.end() || !g_bridge_ctx) return;
    JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 0, nullptr);
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(g_bridge_ctx);
        const char* s = JS_ToCString(g_bridge_ctx, exc);
        fprintf(stderr, "onPress error: %s\n", s ? s : "(unknown)");
        if (s) JS_FreeCString(g_bridge_ctx, s);
        JS_FreeValue(g_bridge_ctx, exc);
    }
    JS_FreeValue(g_bridge_ctx, result);
}

static void invokeRequestCloseNow(int id) {
    auto it = g_requestCloseCallbacks.find(id);
    if (it == g_requestCloseCallbacks.end() || !g_bridge_ctx) return;
    JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 0, nullptr);
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(g_bridge_ctx);
        const char* s = JS_ToCString(g_bridge_ctx, exc);
        fprintf(stderr, "onRequestClose error: %s\n", s ? s : "(unknown)");
        if (s) JS_FreeCString(g_bridge_ctx, s);
        JS_FreeValue(g_bridge_ctx, exc);
    }
    JS_FreeValue(g_bridge_ctx, result);
}

static void queuePressCallback(int id) {
    g_deferredPressCallbacks.push_back(id);
}

static void queueRequestCloseCallback(int id) {
    g_deferredRequestCloseCallbacks.push_back(id);
}

static void clearTransientInputCapture() {
    // raym3 input stores Node* values in hover/active/pendingPress. A press
    // callback can synchronously replace or dispose the scene, so drop those
    // transient captures before the next input frame dereferences them.
    raym3::v2::SetHoveredId(0);
    raym3::v2::SetActiveId(0);
    raym3::v2::SetPendingPressId(0);
}

void rayactDrainDeferredInputCallbacks() {
    if (!g_bridge_ctx) {
        g_deferredPressCallbacks.clear();
        g_deferredRequestCloseCallbacks.clear();
        clearTransientInputCapture();
        return;
    }
    std::vector<int> requestCloseIds;
    std::vector<int> pressIds;
    requestCloseIds.swap(g_deferredRequestCloseCallbacks);
    pressIds.swap(g_deferredPressCallbacks);

    for (int id : requestCloseIds) invokeRequestCloseNow(id);
    for (int id : pressIds) invokePressCallbackNow(id);
    if (!requestCloseIds.empty() || !pressIds.empty()) clearTransientInputCapture();
}

static std::map<int, JSValue> g_changeValueCallbacks;

// Reports a numeric value change (slider) back to JS.
static void invokeChangeValueCallback(int id, float value) {
    auto it = g_changeValueCallbacks.find(id);
    if (it == g_changeValueCallbacks.end() || !g_bridge_ctx) return;
    JSValue arg = JS_NewFloat64(g_bridge_ctx, (double)value);
    JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 1, &arg);
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(g_bridge_ctx);
        const char* s = JS_ToCString(g_bridge_ctx, exc);
        fprintf(stderr, "onChangeValue error: %s\n", s ? s : "(unknown)");
        if (s) JS_FreeCString(g_bridge_ctx, s);
        JS_FreeValue(g_bridge_ctx, exc);
    }
    JS_FreeValue(g_bridge_ctx, arg);
    JS_FreeValue(g_bridge_ctx, result);
}

// Push the JS-facing control state into the first-class node's core
// ControlState so raym3 paints + drives it. Core owns dragging/anim, so those
// are never clobbered; controlled value/checked flow JS -> core here.
static void syncControlNodeFromState(int id) {
    auto nit = g_nodes.find(id);
    auto sit = g_nativeControlStates.find(id);
    if (nit == g_nodes.end() || sit == g_nativeControlStates.end() || !nit->second)
        return;
    auto& n = *nit->second;
    const NativeControlState& s = sit->second;
    auto& c = n.control;
    n.disabled = s.disabled;
    c.minValue = s.minValue;
    c.maxValue = s.maxValue;
    c.step = s.step;
    c.sliderTrackH = s.sliderTrackH;
    c.sliderHandleH = s.sliderHandleH;
    if (!c.dragging) {
        c.value = s.value;
        c.startValue = s.startValue;
        c.endValue = s.endValue;
    }
    c.checked = s.checked;
}

static void updateNativeControlState(JSContext* ctx, int id, JSValue props) {
    auto it = g_nativeControlStates.find(id);
    if (it == g_nativeControlStates.end() || !JS_IsObject(props)) return;

    NativeControlState& state = it->second;
    if (jsHasProperty(ctx, props, "label") || jsHasProperty(ctx, props, "text")) {
        std::string label = jsGetString(ctx, props, "label");
        if (label.empty()) label = jsGetString(ctx, props, "text");
        state.label = label;
    }
    if (jsHasProperty(ctx, props, "disabled")) {
        state.disabled = jsGetBool(ctx, props, "disabled", state.disabled);
    }
    if (state.kind == NativeControlKind::Slider || state.kind == NativeControlKind::RangeSlider) {
        if (auto v = jsGetFloat(ctx, props, "min")) state.minValue = *v;
        if (auto v = jsGetFloat(ctx, props, "max")) state.maxValue = *v;
        if (auto v = jsGetFloat(ctx, props, "step")) state.step = *v;
        // Don't clobber the in-flight value while the user is dragging.
        if (auto nit = g_nodes.find(id); nit != g_nodes.end() && nit->second) {
            state.dragging = nit->second->control.dragging;
            state.draggingThumb = nit->second->control.draggingThumb;
        }
        if (!state.dragging) {
            if (auto v = jsGetFloat(ctx, props, "value")) state.value = *v;
            if (auto v = jsGetFloat(ctx, props, "startProgress")) state.startValue = *v;
            if (auto v = jsGetFloat(ctx, props, "endProgress")) state.endValue = *v;
            if (auto v = jsGetFloat(ctx, props, "start")) state.startValue = *v;
            if (auto v = jsGetFloat(ctx, props, "end")) state.endValue = *v;
            if (auto v = jsGetFloat(ctx, props, "lower")) state.startValue = *v;
            if (auto v = jsGetFloat(ctx, props, "upper")) state.endValue = *v;
        }
        if (jsHasProperty(ctx, props, "size")) {
            JSValue sizeVal = JS_GetPropertyStr(ctx, props, "size");
            const char* sz = JS_ToCString(ctx, sizeVal);
            if (sz) {
                auto sv2 = sliderSizeFor(sz);
                state.sliderTrackH  = sv2.trackH;
                state.sliderHandleH = sv2.handleH;
                JS_FreeCString(ctx, sz);
                auto nodeIt = g_nodes.find(id);
                if (nodeIt != g_nodes.end()) {
                    nodeIt->second->style.height    = sv2.handleH;
                    nodeIt->second->style.minHeight = sv2.handleH;
                }
            }
            JS_FreeValue(ctx, sizeVal);
        }
        syncControlNodeFromState(id);
        return;
    }
    if (state.kind == NativeControlKind::RadioButton) {
        state.checked = jsGetBool(ctx, props, "selected",
                         jsGetBool(ctx, props, "checked", state.checked));
    } else {
        state.checked = jsGetBool(ctx, props, "checked",
                         jsGetBool(ctx, props, "selected", state.checked));
    }
    syncControlNodeFromState(id);
}

static int nodeIdFor(const raym3::v2::NodePtr& node) {
    for (const auto& [id, candidate] : g_nodes) {
        if (candidate == node) return id;
    }
    return -1;
}

// Fire a modal's onRequestClose when a tap lands on the scrim (outside the
// frontmost modal panel). Pickers (DatePicker/TimePicker) dismiss via
// onRequestClose rather than a root onPress, so HitTest produces no press
// target for a backdrop tap. Call this only on that miss path so it never
// competes with Dialog/BottomSheet root onPress or inner child handlers.
bool engineTryRequestCloseOnScrimTap(Vector2 pointDp) {
    auto modal = raym3::v2::TopmostModalNode();
    if (!modal) return false;
    if (CheckCollisionPointRec(pointDp, modal->layout)) return false; // inside panel
    int id = nodeIdFor(modal);
    if (id < 0) return false;
    if (g_requestCloseCallbacks.find(id) == g_requestCloseCallbacks.end()) return false;
    queueRequestCloseCallback(id);
    return true;
}

static void emitScrollEvent(int id, const raym3::v2::NodePtr& node) {
    auto it = g_scrollCallbacks.find(id);
    if (it == g_scrollCallbacks.end() || !g_bridge_ctx) return;

    JSValue event = JS_NewObject(g_bridge_ctx);
    JS_SetPropertyStr(g_bridge_ctx, event, "x", JS_NewFloat64(g_bridge_ctx, node->scrollOffsetX));
    JS_SetPropertyStr(g_bridge_ctx, event, "y", JS_NewFloat64(g_bridge_ctx, node->scrollOffsetY));
    JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 1, &event);
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(g_bridge_ctx);
        const char* s = JS_ToCString(g_bridge_ctx, exc);
        fprintf(stderr, "onScroll error: %s\n", s ? s : "(unknown)");
        if (s) JS_FreeCString(g_bridge_ctx, s);
        JS_FreeValue(g_bridge_ctx, exc);
    }
    JS_FreeValue(g_bridge_ctx, result);
    JS_FreeValue(g_bridge_ctx, event);
}

static std::vector<std::string> splitCssTopLevel(const std::string& input, char delimiter) {
    std::vector<std::string> parts;
    int depth = 0;
    std::string current;
    for (char ch : input) {
        if (ch == '(') depth++;
        if (ch == ')' && depth > 0) depth--;
        if (ch == delimiter && depth == 0) {
            parts.push_back(current);
            current.clear();
        } else {
            current += ch;
        }
    }
    if (!current.empty()) parts.push_back(current);
    return parts;
}

static std::string trimCss(std::string value) {
    auto first = value.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return {};
    auto last = value.find_last_not_of(" \t\r\n");
    return value.substr(first, last - first + 1);
}

static Color parseCssColorString(const std::string& raw) {
    std::string value = trimCss(raw);
    if (value.empty()) return BLANK;
    return ParseCssColorToRaylib(value);
}

static std::optional<raym3::v2::LinearGradient> parseLinearGradientCss(const std::string& css) {
    auto start = css.find("linear-gradient(");
    if (start == std::string::npos) return std::nullopt;
    start += strlen("linear-gradient(");
    auto end = css.rfind(')');
    if (end == std::string::npos || end <= start) return std::nullopt;
    auto args = splitCssTopLevel(css.substr(start, end - start), ',');
    if (args.size() < 2) return std::nullopt;
    raym3::v2::LinearGradient gradient;
    size_t colorStart = 0;
    std::string first = trimCss(args[0]);
    if (first.find("deg") != std::string::npos) {
        gradient.angleDegrees = std::strtof(first.c_str(), nullptr);
        colorStart = 1;
    } else if (first.rfind("to ", 0) == 0) {
        if (first.find("right") != std::string::npos) gradient.angleDegrees = 90.0f;
        else if (first.find("left") != std::string::npos) gradient.angleDegrees = 270.0f;
        else if (first.find("top") != std::string::npos) gradient.angleDegrees = 0.0f;
        else gradient.angleDegrees = 180.0f;
        colorStart = 1;
    }
    size_t colorCount = args.size() - colorStart;
    for (size_t i = colorStart; i < args.size(); i++) {
        std::string stop = trimCss(args[i]);
        std::smatch match;
        std::regex colorRe(R"(rgba?\([^)]+\)|#[0-9A-Fa-f]{3,8})");
        if (std::regex_search(stop, match, colorRe)) {
            float pos = colorCount <= 1 ? 0.0f : (float)(i - colorStart) / (float)(colorCount - 1);
            gradient.stops.push_back({parseCssColorString(match.str()), pos});
        }
    }
    return gradient.stops.size() >= 2 ? std::optional<raym3::v2::LinearGradient>(gradient) : std::nullopt;
}

static std::vector<raym3::v2::BoxShadow> parseBoxShadowCss(const std::string& css) {
    std::vector<raym3::v2::BoxShadow> shadows;
    std::regex colorRe(R"(rgba?\([^)]+\)|#[0-9A-Fa-f]{3,8})");
    for (std::string part : splitCssTopLevel(css, ',')) {
        raym3::v2::BoxShadow shadow;
        part = trimCss(part);
        shadow.inset = part.find("inset") != std::string::npos;
        std::smatch match;
        if (std::regex_search(part, match, colorRe)) {
            shadow.color = parseCssColorString(match.str());
            part.erase(match.position(), match.length());
        }
        std::istringstream ss(part);
        std::string token;
        std::vector<float> nums;
        while (ss >> token) {
            if (token == "inset") continue;
            nums.push_back(parseCssLengthToLayoutDp(token));
        }
        if (nums.size() > 0) shadow.offsetX = nums[0];
        if (nums.size() > 1) shadow.offsetY = nums[1];
        if (nums.size() > 2) shadow.blurRadius = nums[2];
        if (nums.size() > 3) shadow.spreadRadius = nums[3];
        shadows.push_back(shadow);
    }
    return shadows;
}

static bool jsValueIsAuto(JSContext* ctx, JSValue v) {
    if (!JS_IsString(v)) return false;
    const char* s = JS_ToCString(ctx, v);
    bool result = s && strcmp(s, "auto") == 0;
    if (s) JS_FreeCString(ctx, s);
    return result;
}

static void applyMarginEdgeProp(JSContext* ctx, JSValue obj, const char* key,
                                std::optional<float>& point,
                                std::optional<bool>& autoFlag) {
    if (!jsHasProperty(ctx, obj, key)) return;
    JSValue v = JS_GetPropertyStr(ctx, obj, key);
    if (jsValueIsAuto(ctx, v)) {
        autoFlag = true;
        point = std::nullopt;
    } else if (!JS_IsUndefined(v) && !JS_IsNull(v)) {
        double d;
        if (JS_ToFloat64(ctx, &d, v) == 0) {
            point = (float)d;
            autoFlag = false;
        }
    }
    JS_FreeValue(ctx, v);
}

static std::optional<raym3::v2::EdgeValues> jsGetEdgeValues(JSContext* ctx, JSValue obj, const char* key) {
    JSValue v = JS_GetPropertyStr(ctx, obj, key);
    if (JS_IsUndefined(v) || JS_IsNull(v)) { JS_FreeValue(ctx, v); return std::nullopt; }
    raym3::v2::EdgeValues ev;
    if (JS_IsString(v) && jsValueIsAuto(ctx, v) && strcmp(key, "margin") == 0) {
        ev.allAuto = true;
    } else if (JS_IsNumber(v)) {
        double d; JS_ToFloat64(ctx, &d, v);
        ev.all = (float)d;
    } else if (JS_IsObject(v)) {
        auto edge = [&](const char* k) -> std::optional<float> {
            JSValue e = JS_GetPropertyStr(ctx, v, k);
            std::optional<float> r;
            if (!JS_IsUndefined(e) && !JS_IsNull(e) && !jsValueIsAuto(ctx, e)) {
                double d; JS_ToFloat64(ctx, &d, e); r = (float)d;
            }
            JS_FreeValue(ctx, e);
            return r;
        };
        auto edgeAuto = [&](const char* k) -> std::optional<bool> {
            JSValue e = JS_GetPropertyStr(ctx, v, k);
            std::optional<bool> r;
            if (!JS_IsUndefined(e) && !JS_IsNull(e)) {
                if (jsValueIsAuto(ctx, e)) r = true;
                else if (JS_IsNumber(e)) r = false;
            }
            JS_FreeValue(ctx, e);
            return r;
        };
        ev.top = edge("top"); ev.right = edge("right");
        ev.bottom = edge("bottom"); ev.left = edge("left");
        if (strcmp(key, "margin") == 0) {
            ev.topAuto = edgeAuto("top"); ev.rightAuto = edgeAuto("right");
            ev.bottomAuto = edgeAuto("bottom"); ev.leftAuto = edgeAuto("left");
        }
    }
    JS_FreeValue(ctx, v);
    return ev;
}

// Apply inline style props from a JS object onto an existing Style.
// Only sets a field when the property is explicitly present in `obj`.
// Called once for className-resolved base, once for inline overrides.
static void applyStyleProps(JSContext* ctx, JSValue obj, raym3::v2::Style& s) {
    if (!JS_IsObject(obj)) return;

    // Sizing
    if (auto v = jsGetFloat(ctx, obj, "width"))     s.width     = v;
    if (auto v = jsGetFloat(ctx, obj, "height"))    s.height    = v;
    if (auto v = jsGetFloat(ctx, obj, "minWidth"))  s.minWidth  = v;
    if (auto v = jsGetFloat(ctx, obj, "minHeight")) s.minHeight = v;
    if (auto v = jsGetFloat(ctx, obj, "maxWidth"))  s.maxWidth  = v;
    if (auto v = jsGetFloat(ctx, obj, "maxHeight")) s.maxHeight = v;

    // Flex
    if (auto v = jsGetFloat(ctx, obj, "flex")) {
        if (*v > 0.0f) {
            s.flexGrow = *v;
            s.flexShrink = 1.0f;
            s.flexBasis = 0.0f;
        } else if (*v == 0.0f) {
            s.flexGrow = 0.0f;
            s.flexShrink = 0.0f;
        } else {
            s.flexGrow = 0.0f;
            s.flexShrink = -*v;
        }
    }
    if (auto v = jsGetFloat(ctx, obj, "flexGrow"))   s.flexGrow   = v;
    if (auto v = jsGetFloat(ctx, obj, "flexShrink")) s.flexShrink = v;
    if (auto v = jsGetFloat(ctx, obj, "flexBasis"))  s.flexBasis  = v;
    if (auto v = jsGetFloat(ctx, obj, "gap"))        s.gap        = v;
    if (auto v = jsGetFloat(ctx, obj, "rowGap"))     s.rowGap     = v;
    if (auto v = jsGetFloat(ctx, obj, "columnGap"))  s.columnGap  = v;

    // Spacing — shorthand and per-edge
    if (auto v = jsGetEdgeValues(ctx, obj, "margin"))  s.margin  = *v;
    if (auto v = jsGetEdgeValues(ctx, obj, "padding")) s.padding = *v;
    if (auto v = jsGetFloat(ctx, obj, "paddingHorizontal")) s.padding.horizontal = v;
    if (auto v = jsGetFloat(ctx, obj, "paddingVertical"))   s.padding.vertical = v;
    applyMarginEdgeProp(ctx, obj, "marginHorizontal", s.margin.horizontal, s.margin.horizontalAuto);
    applyMarginEdgeProp(ctx, obj, "marginVertical", s.margin.vertical, s.margin.verticalAuto);
    applyMarginEdgeProp(ctx, obj, "margin", s.margin.all, s.margin.allAuto);
    // Per-edge shortcuts (override shorthand if both present)
    auto applyEdge = [&](raym3::v2::EdgeValues& ev, const char* tKey, const char* rKey,
                         const char* bKey, const char* lKey) {
        if (auto v = jsGetFloat(ctx, obj, tKey)) ev.top    = v;
        if (auto v = jsGetFloat(ctx, obj, rKey)) ev.right  = v;
        if (auto v = jsGetFloat(ctx, obj, bKey)) ev.bottom = v;
        if (auto v = jsGetFloat(ctx, obj, lKey)) ev.left   = v;
    };
    applyEdge(s.padding, "paddingTop", "paddingRight", "paddingBottom", "paddingLeft");
    applyMarginEdgeProp(ctx, obj, "marginTop", s.margin.top, s.margin.topAuto);
    applyMarginEdgeProp(ctx, obj, "marginRight", s.margin.right, s.margin.rightAuto);
    applyMarginEdgeProp(ctx, obj, "marginBottom", s.margin.bottom, s.margin.bottomAuto);
    applyMarginEdgeProp(ctx, obj, "marginLeft", s.margin.left, s.margin.leftAuto);

    // Visual
    if (auto v = jsGetColor(ctx, obj, "backgroundColor")) s.backgroundColor = v;
    {
        std::string gradientCss = jsGetString(ctx, obj, "backgroundGradientCss");
        if (!gradientCss.empty()) {
            if (auto gradient = parseLinearGradientCss(gradientCss)) s.backgroundGradient = *gradient;
        }
    }
    if (auto v = jsGetColor(ctx, obj, "borderColor"))     s.borderColor     = v;
    if (auto v = jsGetFloat(ctx, obj, "borderWidth"))     s.borderWidth     = v;
    if (auto v = jsGetFloat(ctx, obj, "borderRadius"))    s.borderRadius    = v;
    {
        std::string shadowCss = jsGetString(ctx, obj, "boxShadowCss");
        if (!shadowCss.empty()) s.boxShadows = parseBoxShadowCss(shadowCss);
    }
    {
        std::string backdropCss = jsGetString(ctx, obj, "backdropFilterCss");
        auto blurPos = backdropCss.find("blur(");
        if (blurPos != std::string::npos) {
            s.backdropBlur = std::strtof(backdropCss.c_str() + blurPos + 5, nullptr);
        }
    }
    if (auto v = jsGetFloat(ctx, obj, "opacity"))         s.opacity         = v;
    if (auto v = jsGetFloat(ctx, obj, "scrimOpacity"))    s.scrimOpacity    = v;
    if (auto v = jsGetFloat(ctx, obj, "elevation"))       s.elevation       = v;

    // Transforms
    if (auto v = jsGetFloat(ctx, obj, "translateX")) s.translateX = v;
    if (auto v = jsGetFloat(ctx, obj, "translateY")) s.translateY = v;
    if (auto v = jsGetFloat(ctx, obj, "scale"))      s.scale      = v;
    if (auto v = jsGetFloat(ctx, obj, "rotation"))   s.rotation   = v;

    // Enum: flexDirection
    std::string fd = jsGetString(ctx, obj, "flexDirection");
    if      (fd == "row")            s.flexDirection = raym3::v2::FlexDirection::Row;
    else if (fd == "column")         s.flexDirection = raym3::v2::FlexDirection::Column;
    else if (fd == "row-reverse")    s.flexDirection = raym3::v2::FlexDirection::RowReverse;
    else if (fd == "column-reverse") s.flexDirection = raym3::v2::FlexDirection::ColumnReverse;

    // Enum: display
    std::string display = jsGetString(ctx, obj, "display");
    if      (display == "flex")     s.display = raym3::v2::Display::Flex;
    else if (display == "none")     s.display = raym3::v2::Display::None;
    else if (display == "contents") s.display = raym3::v2::Display::Contents;

    // Enum: justifyContent
    std::string jc = jsGetString(ctx, obj, "justifyContent");
    if      (jc == "flex-start")    s.justifyContent = raym3::v2::Justify::FlexStart;
    else if (jc == "flex-end")      s.justifyContent = raym3::v2::Justify::FlexEnd;
    else if (jc == "center")        s.justifyContent = raym3::v2::Justify::Center;
    else if (jc == "space-between") s.justifyContent = raym3::v2::Justify::SpaceBetween;
    else if (jc == "space-around")  s.justifyContent = raym3::v2::Justify::SpaceAround;
    else if (jc == "space-evenly")  s.justifyContent = raym3::v2::Justify::SpaceEvenly;

    // Enum: alignItems
    std::string ai = jsGetString(ctx, obj, "alignItems");
    if      (ai == "flex-start") s.alignItems = raym3::v2::Align::FlexStart;
    else if (ai == "flex-end")   s.alignItems = raym3::v2::Align::FlexEnd;
    else if (ai == "center")     s.alignItems = raym3::v2::Align::Center;
    else if (ai == "stretch")    s.alignItems = raym3::v2::Align::Stretch;
    else if (ai == "baseline")   s.alignItems = raym3::v2::Align::Baseline;

    // Enum: alignSelf
    std::string as_ = jsGetString(ctx, obj, "alignSelf");
    if      (as_ == "flex-start") s.alignSelf = raym3::v2::Align::FlexStart;
    else if (as_ == "flex-end")   s.alignSelf = raym3::v2::Align::FlexEnd;
    else if (as_ == "center")     s.alignSelf = raym3::v2::Align::Center;
    else if (as_ == "stretch")    s.alignSelf = raym3::v2::Align::Stretch;

    // Enum: overflow
    std::string ov = jsGetString(ctx, obj, "overflow");
    if      (ov == "hidden")  s.overflow = raym3::v2::Overflow::Hidden;
    else if (ov == "scroll")  s.overflow = raym3::v2::Overflow::Scroll;
    else if (ov == "visible") s.overflow = raym3::v2::Overflow::Visible;

    // Enum: position
    std::string pos = jsGetString(ctx, obj, "position");
    if      (pos == "absolute") s.position = raym3::v2::PositionType::Absolute;
    else if (pos == "relative") s.position = raym3::v2::PositionType::Relative;
    else if (pos == "fixed")    s.position = raym3::v2::PositionType::Fixed;

    std::string pe = jsGetString(ctx, obj, "pointerEvents");
    if (pe == "none") s.pointerEvents = raym3::v2::PointerEvents::None;
    else if (pe == "auto") s.pointerEvents = raym3::v2::PointerEvents::Auto;

    // Absolute insets (top/left/right/bottom)
    {
        raym3::v2::EdgeValues inset;
        bool hasInset = false;
        auto tryEdge = [&](const char* key) -> std::optional<float> {
            JSValue v = JS_GetPropertyStr(ctx, obj, key);
            std::optional<float> r;
            if (!JS_IsUndefined(v) && !JS_IsNull(v)) {
                double d; JS_ToFloat64(ctx, &d, v); r = (float)d; hasInset = true;
            }
            JS_FreeValue(ctx, v);
            return r;
        };
        inset.top    = tryEdge("top");
        inset.right  = tryEdge("right");
        inset.bottom = tryEdge("bottom");
        inset.left   = tryEdge("left");
        if (hasInset) s.inset = inset;
    }

    // text sub-object — nested style.text.* first, then RN-style flat fallback
    bool hasNestedFontSize = false;
    bool hasNestedColor = false;
    bool hasNestedLineHeight = false;
    bool hasNestedLetterSpacing = false;
    bool hasNestedWeight = false;
    bool hasNestedFontFamily = false;

    JSValue textObj = JS_GetPropertyStr(ctx, obj, "text");
    if (JS_IsObject(textObj)) {
        if (auto v = jsGetFloat(ctx, textObj, "fontSize")) {
            s.text.fontSize = v;
            hasNestedFontSize = true;
        }
        if (auto v = jsGetColor(ctx, textObj, "color")) {
            s.text.color = v;
            hasNestedColor = true;
        }
        if (auto v = jsGetFloat(ctx, textObj, "lineHeight")) {
            s.text.lineHeight = v;
            hasNestedLineHeight = true;
        }
        if (auto v = jsGetFloat(ctx, textObj, "letterSpacing")) {
            s.text.letterSpacing = v;
            hasNestedLetterSpacing = true;
        }
        if (auto v = jsGetFontWeight(ctx, textObj, "weight")) {
            s.text.weight = v;
            hasNestedWeight = true;
        }
        if (!hasNestedWeight) {
            if (auto v = jsGetFontWeight(ctx, textObj, "fontWeight")) {
                s.text.weight = v;
                hasNestedWeight = true;
            }
        }
        JSValue fv = JS_GetPropertyStr(ctx, textObj, "fontFamily");
        if (!JS_IsUndefined(fv)) {
            const char* fname = JS_ToCString(ctx, fv);
            if (fname && fname[0]) {
                s.text.fontFamily = std::string(fname);
                hasNestedFontFamily = true;
            }
            JS_FreeCString(ctx, fname);
        }
        JS_FreeValue(ctx, fv);
    }
    JS_FreeValue(ctx, textObj);

    if (!hasNestedFontSize) {
        if (auto v = jsGetFloat(ctx, obj, "fontSize")) s.text.fontSize = v;
    }
    if (!hasNestedColor) {
        if (auto v = jsGetColor(ctx, obj, "color")) s.text.color = v;
    }
    if (!hasNestedLineHeight) {
        if (auto v = jsGetFloat(ctx, obj, "lineHeight")) s.text.lineHeight = v;
    }
    if (!hasNestedLetterSpacing) {
        if (auto v = jsGetFloat(ctx, obj, "letterSpacing")) s.text.letterSpacing = v;
    }
    if (!hasNestedWeight) {
        if (auto v = jsGetFontWeight(ctx, obj, "weight")) s.text.weight = v;
        else if (auto v = jsGetFontWeight(ctx, obj, "fontWeight")) s.text.weight = v;
    }
    if (!hasNestedFontFamily) {
        JSValue fv = JS_GetPropertyStr(ctx, obj, "fontFamily");
        if (!JS_IsUndefined(fv)) {
            const char* fname = JS_ToCString(ctx, fv);
            if (fname && fname[0]) s.text.fontFamily = std::string(fname);
            JS_FreeCString(ctx, fname);
        }
        JS_FreeValue(ctx, fv);
    }

    // CSS transitions: `transition` shorthand string (from a class rule via
    // buildStyleObject, or inline — 'none' cancels), then an optional numeric
    // transitionDurationMs override (AvoidKeyboard passes the IME-reported
    // duration this way).
    std::string transitionStr = jsGetString(ctx, obj, "transition");
    if (!transitionStr.empty()) {
        if (auto spec = parseTransitionShorthand(transitionStr))
            s.transitions = std::move(*spec);
    }
    if (auto v = jsGetFloat(ctx, obj, "transitionDurationMs")) {
        if (s.transitions)
            for (auto& e : *s.transitions) e.durationMs = *v;
    }
}

static raym3::v2::Style parseStyle(JSContext* ctx, JSValue obj) {
    raym3::v2::Style style;
    if (!JS_IsObject(obj)) return style;

    // 1. Resolve className base (space-separated class names, no leading dot needed)
    JSValue classVal = JS_GetPropertyStr(ctx, obj, "className");
    if (!JS_IsUndefined(classVal) && !JS_IsNull(classVal)) {
        const char* classStr = JS_ToCString(ctx, classVal);
        if (classStr && classStr[0]) {
            JSValue base = resolveClassNames(ctx, classStr);
            applyStyleProps(ctx, base, style);  // populate from CSS classes
            JS_FreeValue(ctx, base);
        }
        JS_FreeCString(ctx, classStr);
    }
    JS_FreeValue(ctx, classVal);

    // 2. Apply inline props — override only what is explicitly present
    applyStyleProps(ctx, obj, style);

    return style;
}

static void syncNavItemIconFill(const raym3::v2::NodePtr& node, bool selected);

void refreshStylesForColorScheme(JSContext* ctx) {
    if (!ctx) return;
    for (auto& [id, component] : g_materialComponentKinds) {
        auto nodeIt = g_nodes.find(id);
        if (nodeIt == g_nodes.end() || !nodeIt->second) continue;
        raym3::v2::ComponentProps props;
        props.selected = nodeIt->second->selected;
        props.checked = nodeIt->second->selected;
        props.open = component == raym3::v2::M3Component::NavigationRail
            ? nodeIt->second->selected
            : false;
        props.disabled = nodeIt->second->disabled;
        props.zIndex = nodeIt->second->zIndex;
        props.onPress = nodeIt->second->onPress;
        auto updated = raym3::v2::MaterialComponent(component, props);
        nodeIt->second->style = preserveLayoutStyle(updated->style, nodeIt->second->style);
        nodeIt->second->stateStyles = updated->stateStyles;
        nodeIt->second->motion = updated->motion;
        if (nodeIt->second->role == raym3::v2::NodeRole::NavItem) {
            Color labelColor = nodeIt->second->selected
                ? raym3::Theme::GetColorScheme().onSurface
                : raym3::Theme::GetColorScheme().onSurfaceVariant;
            for (auto& child : nodeIt->second->children) {
                if (child && child->kind == raym3::v2::NodeKind::Text) {
                    child->style.text.color = labelColor;
                }
            }
            syncNavItemIconFill(nodeIt->second, nodeIt->second->selected);
        }
    }

    for (auto& [id, node] : g_nodes) {
        auto cn = g_nodeClassNames.find(id);
        if (cn == g_nodeClassNames.end() || cn->second.empty()) continue;

        JSValue styleObj = JS_NewObject(ctx);
        JS_SetPropertyStr(ctx, styleObj, "className", JS_NewString(ctx, cn->second.c_str()));
        raym3::v2::Style parsed = parseStyle(ctx, styleObj);
        JS_FreeValue(ctx, styleObj);

        // Re-resolve CSS but keep inline layout props (width, height, margin, etc.)
        // that were set on createView/setStyle alongside className.
        node->style = raym3::v2::MergeStyles(node->style, parsed);
    }
}

void installAnimatedStyleBuffer(JSContext* ctx, JSValue global) {
    if (g_animatedStyleBuffer.empty()) return;
    JSValue buffer = JS_NewArrayBuffer(
        ctx,
        reinterpret_cast<uint8_t*>(g_animatedStyleBuffer.data()),
        g_animatedStyleBuffer.size() * sizeof(float),
        nullptr,
        nullptr,
        false);
    JS_SetPropertyStr(ctx, global, "__rayactAnimatedStyleBuffer", JS_DupValue(ctx, buffer));
    // Back-compat with the original SharedValue experiment.
    JS_SetPropertyStr(ctx, global, "__rayactSharedStyleBuffer", buffer);
}

static void readAnimatedStyleObject(JSContext* ctx, JSValueConst obj, bool present[5], float values[5]) {
    const char* keys[5] = {"translateX", "translateY", "scale", "opacity", "rotation"};
    for (int i = 0; i < 5; ++i) {
        present[i] = false;
        values[i] = animatedDefaultForOffset(i);
        JSValue v = JS_GetPropertyStr(ctx, obj, keys[i]);
        if (!JS_IsUndefined(v) && !JS_IsNull(v)) {
            double d = 0.0;
            if (JS_ToFloat64(ctx, &d, v) == 0) {
                present[i] = true;
                values[i] = (float)d;
            }
        }
        JS_FreeValue(ctx, v);
    }
}

JSValue JS_rayactRegisterAnimatedNode(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "__rayactRegisterAnimatedNode: expected (nodeId, initialStyle?)");
    int nodeId = 0;
    JS_ToInt32(ctx, &nodeId, argv[0]);
    size_t base = 0;
    if (!animatedNodeIndex(nodeId, base)) return JS_UNDEFINED;

    g_animatedNodes.insert(nodeId);
    if (g_animatedStyleBuffer[base + kAnimatedGeneration] == 0.0f) {
        g_animatedStyleBuffer[base + kAnimatedScale] = 1.0f;
        g_animatedStyleBuffer[base + kAnimatedOpacity] = 1.0f;
    }
    g_animatedStyleBuffer[base + kAnimatedGeneration] += 1.0f;

    if (argc >= 2 && JS_IsObject(argv[1])) {
        bool present[5];
        float values[5];
        readAnimatedStyleObject(ctx, argv[1], present, values);
        for (int i = 0; i < 5; ++i) {
            if (present[i]) g_animatedStyleBuffer[base + (size_t)i] = values[i];
        }
    }
    g_animatedStyleBuffer[base + kAnimatedDirty] = 1.0f;
    return JS_UNDEFINED;
}

JSValue JS_rayactSetAnimatedStyle(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2 || !JS_IsObject(argv[1]))
        return JS_ThrowTypeError(ctx, "__rayactSetAnimatedStyle: expected (nodeId, partialStyle)");
    int nodeId = 0;
    JS_ToInt32(ctx, &nodeId, argv[0]);
    bool present[5];
    float values[5];
    readAnimatedStyleObject(ctx, argv[1], present, values);
    for (int i = 0; i < 5; ++i) {
        if (present[i]) setAnimatedStyleValue(nodeId, i, values[i]);
    }
    return JS_UNDEFINED;
}

JSValue JS_rayactStopStyleAnimation(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    int nodeId = 0;
    JS_ToInt32(ctx, &nodeId, argv[0]);
    auto it = g_styleAnimations.find(nodeId);
    if (it == g_styleAnimations.end()) return JS_UNDEFINED;

    if (argc >= 2 && JS_IsString(argv[1])) {
        const char* key = JS_ToCString(ctx, argv[1]);
        int offset = animatedOffsetForKey(key);
        JS_FreeCString(ctx, key);
        if (offset >= 0) {
            it->second.active[offset] = false;
            bool any = false;
            for (bool active : it->second.active) any = any || active;
            if (any) return JS_UNDEFINED;
        }
    }

    if (!JS_IsUndefined(it->second.onComplete)) JS_FreeValue(ctx, it->second.onComplete);
    g_styleAnimations.erase(it);
    return JS_UNDEFINED;
}

JSValue JS_rayactStartStyleAnimation(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 3 || !JS_IsObject(argv[1]) || !JS_IsObject(argv[2]))
        return JS_ThrowTypeError(ctx, "__rayactStartStyleAnimation: expected (nodeId, targetStyle, config, onComplete?)");
    int nodeId = 0;
    JS_ToInt32(ctx, &nodeId, argv[0]);
    size_t base = 0;
    if (!animatedNodeIndex(nodeId, base)) return JS_UNDEFINED;
    // Seed identity defaults before reading `from` / inserting the node, so an
    // animation that doesn't drive scale/opacity never leaves them at 0.
    ensureAnimatedDefaults(nodeId, base);

    JSValue durationValue = JS_GetPropertyStr(ctx, argv[2], "duration");
    double duration = 300.0;
    if (!JS_IsUndefined(durationValue) && !JS_IsNull(durationValue)) JS_ToFloat64(ctx, &duration, durationValue);
    JS_FreeValue(ctx, durationValue);

    bool present[5];
    float values[5];
    readAnimatedStyleObject(ctx, argv[1], present, values);

    auto existing = g_styleAnimations.find(nodeId);
    if (existing != g_styleAnimations.end() && !JS_IsUndefined(existing->second.onComplete)) {
        JS_FreeValue(ctx, existing->second.onComplete);
    }

    StyleAnimation anim;
    anim.nodeId = nodeId;
    anim.startMs = animatedNowMs();
    anim.durationMs = duration < 0.0 ? 0.0 : duration;
    if (argc >= 4 && JS_IsFunction(ctx, argv[3])) anim.onComplete = JS_DupValue(ctx, argv[3]);

    bool any = false;
    for (int i = 0; i < 5; ++i) {
        anim.active[i] = present[i];
        if (!present[i]) continue;
        any = true;
        anim.from[i] = getAnimatedStyleValue(nodeId, i);
        anim.to[i] = values[i];
    }
    if (!any) {
        if (!JS_IsUndefined(anim.onComplete)) {
            JSValue r = JS_Call(ctx, anim.onComplete, JS_UNDEFINED, 0, nullptr);
            JS_FreeValue(ctx, r);
            JS_FreeValue(ctx, anim.onComplete);
        }
        return JS_UNDEFINED;
    }

    g_styleAnimations[nodeId] = anim;
    g_animatedNodes.insert(nodeId);
    return JS_UNDEFINED;
}

bool hasActiveStyleAnimations() { return !g_styleAnimations.empty(); }

void tickAnimatedStyles(JSContext* ctx) {
    if (g_styleAnimations.empty()) return;
    double now = animatedNowMs();
    std::vector<JSValue> completions;
    for (auto it = g_styleAnimations.begin(); it != g_styleAnimations.end();) {
        StyleAnimation& anim = it->second;
        float t = anim.durationMs <= 0.0
            ? 1.0f
            : (float)std::min(1.0, (now - anim.startMs) / anim.durationMs);
        float eased = easeInOutCubicNative(t);
        for (int i = 0; i < 5; ++i) {
            if (!anim.active[i]) continue;
            float value = t >= 1.0f ? anim.to[i] : anim.from[i] + (anim.to[i] - anim.from[i]) * eased;
            setAnimatedStyleValue(anim.nodeId, i, value);
        }
        if (t >= 1.0f) {
            if (!JS_IsUndefined(anim.onComplete)) completions.push_back(anim.onComplete);
            it = g_styleAnimations.erase(it);
        } else {
            ++it;
        }
    }
    for (JSValue cb : completions) {
        JSValue r = JS_Call(ctx, cb, JS_UNDEFINED, 0, nullptr);
        if (JS_IsException(r)) {
            JSValue exc = JS_GetException(ctx);
            const char* s = JS_ToCString(ctx, exc);
            fprintf(stderr, "[animated style completion error] %s\n", s ? s : "?");
            if (s) JS_FreeCString(ctx, s);
            JS_FreeValue(ctx, exc);
        }
        JS_FreeValue(ctx, r);
        JS_FreeValue(ctx, cb);
    }
}

void applyAnimatedStylesToNodes() {
    if (g_animatedNodes.empty()) return;
    for (int nodeId : g_animatedNodes) {
        auto it = g_nodes.find(nodeId);
        if (it == g_nodes.end() || !it->second) continue;
        size_t base = 0;
        if (!animatedNodeIndex(nodeId, base)) continue;
        raym3::v2::Style& style = it->second->style;
        for (int i = 0; i < 5; ++i) applyAnimatedValueToStyle(style, i, g_animatedStyleBuffer[base + (size_t)i]);
        g_animatedStyleBuffer[base + kAnimatedDirty] = 0.0f;
    }
}

// ─── JS bridge functions ────────────────────────────────────────────────────

JSValue JS_createView(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    raym3::v2::ViewProps props;
    if (argc >= 1 && JS_IsObject(argv[0])) {
        props.style = parseStyle(ctx, argv[0]);
        if (auto z = jsGetFloat(ctx, argv[0], "zIndex")) props.zIndex = (int)roundf(*z);
        if (jsHasProperty(ctx, argv[0], "capturesInput"))
            props.capturesInput = jsGetBool(ctx, argv[0], "capturesInput", false);
        if (jsHasProperty(ctx, argv[0], "appBarTitle"))
            props.appBarTitle = jsGetBool(ctx, argv[0], "appBarTitle", false);
    }

    auto node = raym3::v2::View(props);
    int id = nextNativeNodeId();
    g_nodes[id] = node;
    rayact::shadowTree().createNode((uint32_t)id, props.style);
    if (argc >= 1 && JS_IsObject(argv[0])) captureNodeClassName(ctx, id, argv[0]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_createText(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "createText: expected (text, style?)");
    const char* str = JS_ToCString(ctx, argv[0]);
    if (!str) return JS_ThrowTypeError(ctx, "createText: invalid text");

    raym3::v2::TextProps props;
    if (argc >= 2 && JS_IsObject(argv[1]))
        props.style = parseStyle(ctx, argv[1]);

    auto node = raym3::v2::Text(str, props);
    JS_FreeCString(ctx, str);

    int id = nextNativeNodeId();
    g_nodes[id] = node;
    if (argc >= 2 && JS_IsObject(argv[1])) captureNodeClassName(ctx, id, argv[1]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_createButton(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "createButton: expected (label, style?)");
    const char* label = JS_ToCString(ctx, argv[0]);
    if (!label) return JS_ThrowTypeError(ctx, "createButton: invalid label");

    raym3::v2::ComponentProps props;
    props.label = label;
    JS_FreeCString(ctx, label);

    if (argc >= 2 && JS_IsObject(argv[1]))
        props.style = parseStyle(ctx, argv[1]);

    // Route through MaterialComponent so M3 defaults (primary bg, 40dp height,
    // 20dp radius, labelLarge text) are applied before user style overrides.
    auto node = raym3::v2::MaterialComponent(raym3::v2::M3Component::Button, props, {});
    int id = nextNativeNodeId();
    g_nodes[id] = node;
    g_materialComponentKinds[id] = raym3::v2::M3Component::Button;
    if (argc >= 2 && JS_IsObject(argv[1])) captureNodeClassName(ctx, id, argv[1]);
    return JS_NewInt32(ctx, id);
}

void rayactBlurFocusedTextInput() {
    raym3::v2::Blur();
}

#if defined(__ANDROID__) || defined(RAYACT_IOS)
// Push native editing-state changes back into the IME InputConnection.
static void registerImeStateCallbackOnce() {
    static bool registered = false;
    if (registered) return;
    registered = true;
    raym3::v2::SetTextInputStateCallback([](raym3::v2::NodeId nodeId,
                                            const raym3::v2::TextInputEditingState &state) {
        for (auto& [id, node] : g_nodes) {
            if (raym3::v2::IdOf(node) == nodeId) {
                AndroidKeyboard_UpdateSelection(id, state.selectionStart, state.selectionEnd,
                                                state.composingStart, state.composingEnd,
                                                state.textChanged ? state.text.c_str() : nullptr);
                return;
            }
        }
    });
}
#endif

// Fire a react-native style text callback: cb({ nativeEvent: { text } }) with the
// node's current text. Used for onSubmitEditing / onEndEditing.
static void fireTextInputTextEvent(std::map<int, JSValue>& callbacks, int nodeId) {
    auto cbIt = callbacks.find(nodeId);
    if (cbIt == callbacks.end() || !g_bridge_ctx) return;
    std::string text;
    auto nodeIt = g_nodes.find(nodeId);
    if (nodeIt != g_nodes.end() && nodeIt->second) {
        if (nodeIt->second->textInput.value) text = *nodeIt->second->textInput.value;
        else text = nodeIt->second->inputScratch;
    }
    JSValue ev = JS_NewObject(g_bridge_ctx);
    JSValue ne = JS_NewObject(g_bridge_ctx);
    JS_SetPropertyStr(g_bridge_ctx, ne, "text", JS_NewString(g_bridge_ctx, text.c_str()));
    JS_SetPropertyStr(g_bridge_ctx, ev, "nativeEvent", ne);
    JSValue r = JS_Call(g_bridge_ctx, cbIt->second, JS_UNDEFINED, 1, &ev);
    if (JS_IsException(r)) JS_FreeValue(g_bridge_ctx, JS_GetException(g_bridge_ctx));
    JS_FreeValue(g_bridge_ctx, r);
    JS_FreeValue(g_bridge_ctx, ev);
}

JSValue JS_createTextInput(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
#if defined(__ANDROID__) || defined(RAYACT_IOS)
    registerImeStateCallbackOnce();
#endif
    std::string value;
    if (argc >= 1 && !JS_IsUndefined(argv[0]) && !JS_IsNull(argv[0])) {
        const char* s = JS_ToCString(ctx, argv[0]);
        if (s) { value = s; JS_FreeCString(ctx, s); }
    }

    raym3::v2::TextInputProps props;
    props.value = nullptr;
    if (argc >= 2 && JS_IsObject(argv[1])) {
        props.style = parseStyle(ctx, argv[1]);
        props.placeholder = jsGetString(ctx, argv[1], "placeholder");
        props.label = jsGetString(ctx, argv[1], "label");
        props.passwordMode = jsGetBool(ctx, argv[1], "secureTextEntry", false);
        props.secure = jsGetBool(ctx, argv[1], "secure", false);
        props.autocorrect = jsGetBool(ctx, argv[1], "autocorrect", false);
        props.inputType = jsGetString(ctx, argv[1], "inputType");
        props.imeAction = jsGetString(ctx, argv[1], "imeAction");
        props.readOnly = jsGetBool(ctx, argv[1], "readOnly", false);
        props.disabled = jsGetBool(ctx, argv[1], "disabled", false);
        {
            std::string variant = jsGetString(ctx, argv[1], "variant");
            if (variant == "filled") props.variant = raym3::TextFieldVariant::Filled;
            else if (variant == "outlined") props.variant = raym3::TextFieldVariant::Outlined;
            else if (variant == "underline") props.variant = raym3::TextFieldVariant::Underline;
        }
        props.drawBackground = jsGetBool(ctx, argv[1], "drawBackground", true);
        props.drawOutline = jsGetBool(ctx, argv[1], "drawOutline", true);
        props.drawStateLayer = jsGetBool(ctx, argv[1], "drawStateLayer", true);
        // react-native parity props.
        if (auto m = jsGetFloat(ctx, argv[1], "maxLength")) props.maxLength = (int)*m;
        props.multiline = jsGetBool(ctx, argv[1], "multiline", false);
        props.caretHidden = jsGetBool(ctx, argv[1], "caretHidden", false);
        props.blurOnSubmit = jsGetBool(ctx, argv[1], "blurOnSubmit", !props.multiline);
        props.selectTextOnFocus = jsGetBool(ctx, argv[1], "selectTextOnFocus", false);
        props.autoFocus = jsGetBool(ctx, argv[1], "autoFocus", false);
        { std::string ac = jsGetString(ctx, argv[1], "autoCapitalize");
          if (!ac.empty()) props.autoCapitalize = ac; }
        { std::string ta = jsGetString(ctx, argv[1], "textAlign");
          if (!ta.empty()) props.textAlign = ta; }
        if (auto c = jsGetColor(ctx, argv[1], "selectionColor")) {
            props.hasSelectionColor = true; props.selectionColor = *c;
        }
        if (auto c = jsGetColor(ctx, argv[1], "cursorColor")) {
            props.hasCursorColor = true; props.cursorColor = *c;
        }
        if (auto c = jsGetColor(ctx, argv[1], "placeholderTextColor")) {
            props.hasPlaceholderColor = true; props.placeholderColor = *c;
        }
    }

    auto node = raym3::v2::TextInput(props);
    node->inputScratch = value;
    node->inputBuffer.assign(1024, '\0');
    std::strncpy(node->inputBuffer.data(), node->inputScratch.c_str(), node->inputBuffer.size() - 1);
    node->textInput.buffer = node->inputBuffer.data();
    node->textInput.bufferSize = (int)node->inputBuffer.size();
    node->textInput.value = &node->inputScratch;
    node->textInput.onChange = [id = g_nextNodeId](const std::string& text) {
        auto it = g_changeTextCallbacks.find(id);
        if (it == g_changeTextCallbacks.end() || !g_bridge_ctx) return;
        JSValue arg = JS_NewString(g_bridge_ctx, text.c_str());
        JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 1, &arg);
        if (JS_IsException(result)) {
            JSValue exc = JS_GetException(g_bridge_ctx);
            const char* s = JS_ToCString(g_bridge_ctx, exc);
            fprintf(stderr, "onChangeText error: %s\n", s ? s : "(unknown)");
            if (s) JS_FreeCString(g_bridge_ctx, s);
            JS_FreeValue(g_bridge_ctx, exc);
        }
        JS_FreeValue(g_bridge_ctx, result);
        JS_FreeValue(g_bridge_ctx, arg);
    };
    node->textInput.onFocus = [id = g_nextNodeId,
                               inputType = props.inputType,
                               autocorrect = props.autocorrect,
                               secure = props.secure || props.passwordMode,
                               imeAction = props.imeAction]() {
#if defined(__ANDROID__) || defined(RAYACT_IOS)
        AndroidKeyboard_ShowForNode(id, inputType, autocorrect, secure, imeAction);
#endif
        auto it = g_focusCallbacks.find(id);
        if (it == g_focusCallbacks.end() || !g_bridge_ctx) return;
        JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 0, nullptr);
        if (JS_IsException(result)) JS_FreeValue(g_bridge_ctx, JS_GetException(g_bridge_ctx));
        JS_FreeValue(g_bridge_ctx, result);
    };
    node->textInput.onBlur = [id = g_nextNodeId]() {
#if defined(__ANDROID__) || defined(RAYACT_IOS)
        // Focus already moved when switching fields — keep keyboard open.
        raym3::v2::NodeId focused = raym3::v2::GetFocusedId();
        if (focused != 0) {
            auto *n = reinterpret_cast<raym3::v2::Node *>(focused);
            if (n && n->kind == raym3::v2::NodeKind::TextInput)
                return;
        }
        AndroidKeyboard_Hide();
#endif
        // react-native onEndEditing: fires with the final text when editing ends.
        fireTextInputTextEvent(g_endEditingCallbacks, id);
        auto it = g_blurCallbacks.find(id);
        if (it == g_blurCallbacks.end() || !g_bridge_ctx) return;
        JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 0, nullptr);
        if (JS_IsException(result)) JS_FreeValue(g_bridge_ctx, JS_GetException(g_bridge_ctx));
        JS_FreeValue(g_bridge_ctx, result);
    };
    // react-native onSubmitEditing: fired by the engine on the return/IME action.
    node->textInput.onSubmit = [id = g_nextNodeId](const std::string&) {
        fireTextInputTextEvent(g_submitEditingCallbacks, id);
    };

    int id = nextNativeNodeId();
    g_nodes[id] = node;
    if (argc >= 1 && JS_IsObject(argv[0])) captureNodeClassName(ctx, id, argv[0]);
    // react-native autoFocus: focus the field as soon as it mounts.
    if (argc >= 2 && JS_IsObject(argv[1]) && jsGetBool(ctx, argv[1], "autoFocus", false)) {
        raym3::v2::SetFocusedId(raym3::v2::IdOf(node));
    }
    return JS_NewInt32(ctx, id);
}

JSValue JS_createScrollView(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    raym3::v2::ViewProps props;
    if (argc >= 1 && JS_IsObject(argv[0])) {
        props.style = parseStyle(ctx, argv[0]);
        props.style.overflow = raym3::v2::Overflow::Scroll;
        if (auto z = jsGetFloat(ctx, argv[0], "zIndex")) props.zIndex = (int)roundf(*z);
    }
    auto node = raym3::v2::View(props);
#if defined(RAYACT_ANDROID) || defined(__ANDROID__)
    node->scrollMomentumEnabled = true;
#endif
    int id = nextNativeNodeId();
    g_nodes[id] = node;
    g_scrollViewIds.insert(id);
    if (argc >= 1 && JS_IsObject(argv[0])) captureNodeClassName(ctx, id, argv[0]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_createModal(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    raym3::v2::ViewProps props;
    props.style.position = raym3::v2::PositionType::Absolute;
    props.style.inset.all = 0.0f;
    props.style.backgroundColor = Color{0, 0, 0, 96};
    props.zIndex = 1000;
    if (argc >= 1 && JS_IsObject(argv[0])) {
        props.style = raym3::v2::MergeStyles(props.style, parseStyle(ctx, argv[0]));
    }
    auto node = raym3::v2::View(props);
    int id = nextNativeNodeId();
    g_nodes[id] = node;
    if (argc >= 1 && JS_IsObject(argv[0])) captureNodeClassName(ctx, id, argv[0]);
    return JS_NewInt32(ctx, id);
}

// ─── external (platform) views ────────────────────────────────────────────────
// A node whose content is produced by a platform-native view (EditText,
// NSTextField, WebView, ...) and composited as a texture inside the raym3
// scene. The bridge owns the node + texture + layout/input channels; platform
// hosts (JNI / ObjC++) own the producer and push frames.

struct ExternalViewEntry {
    std::string kind;                       // "stub" | "textfield" | ...
    int nodeId = 0;
    Texture2D texture = {0};                // lazy — JS may run before InitWindow
    std::shared_ptr<Rectangle> layoutRect;  // dp; written by the render lambda
    Rectangle lastPushedRect = {0, 0, -1, -1};
    bool focused = false;
    // Texture supplied by the platform host (AHB import etc.) — producers own
    // its contents; the bridge must not UpdateTexture into it.
    bool externalTexture = false;
    // Texture content insets (px): the producer surface is oversized so
    // overflow chrome (caret handles, selection toolbar, magnifier) isn't
    // clipped at the field edge. The node draws the texture expanded by these
    // insets; the field content itself stays aligned to the layout rect.
    float insetL = 0, insetT = 0, insetR = 0, insetB = 0;
    // Stub producer state (kind == "stub"): animated CPU test pattern.
    std::vector<unsigned char> stubPixels;
};
static std::map<int, ExternalViewEntry> g_externalViews; // nodeId → entry

// Platform host callbacks. Rect: dp-space layout (drives VirtualDisplay /
// ImageReader / NSView sizing). Input: action 0=down 1=up 2=move, view-local dp.
static void (*g_externalViewRectCb)(int nodeId, const char* kind, float x, float y, float w, float h) = nullptr;
static void (*g_externalViewInputCb)(int nodeId, int action, float localX, float localY) = nullptr;
static void (*g_externalViewPropCb)(int nodeId, const char* key, const char* value) = nullptr;
static void (*g_externalViewDisposeCb)(int nodeId) = nullptr;

void rayactSetExternalViewHostCallbacks(
    void (*rectCb)(int, const char*, float, float, float, float),
    void (*inputCb)(int, int, float, float),
    void (*propCb)(int, const char*, const char*),
    void (*disposeCb)(int)) {
    g_externalViewRectCb = rectCb;
    g_externalViewInputCb = inputCb;
    g_externalViewPropCb = propCb;
    g_externalViewDisposeCb = disposeCb;
}

// Producer-driven text change (e.g. EditText TextWatcher): invoke the node's
// JS onChangeText callback. Runs on the JS thread (pump drain).
void rayactExternalViewEmitText(int nodeId, const char* text) {
    auto cbIt = g_changeTextCallbacks.find(nodeId);
    if (cbIt == g_changeTextCallbacks.end() || !g_bridge_ctx) return;
    JSValue arg = JS_NewString(g_bridge_ctx, text ? text : "");
    JSValue result = JS_Call(g_bridge_ctx, cbIt->second, JS_UNDEFINED, 1, &arg);
    if (JS_IsException(result)) JS_FreeValue(g_bridge_ctx, JS_GetException(g_bridge_ctx));
    JS_FreeValue(g_bridge_ctx, result);
    JS_FreeValue(g_bridge_ctx, arg);
}

// Replace an external view's texture with one imported/updated by the platform
// host (e.g. backend AHardwareBuffer wrap). id 0 leaves the texture untouched.
void rayactSetExternalViewTextureInsets(int nodeId, float l, float t, float r, float b) {
    auto it = g_externalViews.find(nodeId);
    if (it == g_externalViews.end()) return;
    it->second.insetL = l;
    it->second.insetT = t;
    it->second.insetR = r;
    it->second.insetB = b;
}

void rayactSetExternalViewTexture(int nodeId, Texture2D texture) {
    auto it = g_externalViews.find(nodeId);
    if (it == g_externalViews.end()) return;
    // Drop the bridge-owned placeholder; the host owns the new texture.
    if (!it->second.externalTexture && it->second.texture.id != 0 && IsWindowReady())
        UnloadTexture(it->second.texture);
    it->second.texture = texture;
    it->second.externalTexture = true;
}

static void stubProducerTick(ExternalViewEntry& ev) {
    // Animated diagonal gradient + moving bar: proves per-frame UpdateTexture,
    // clipping, z-order, and frame scheduling without any native widget.
    const int w = ev.texture.width, h = ev.texture.height;
    if (w <= 0 || h <= 0) return;
    if ((int)ev.stubPixels.size() != w * h * 4) ev.stubPixels.resize((size_t)w * h * 4);
    const float t = (float)GetTime();
    const int bar = (int)((0.5f + 0.5f * sinf(t * 2.0f)) * (float)(h - 8));
    unsigned char* p = ev.stubPixels.data();
    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            const size_t i = ((size_t)y * w + x) * 4;
            p[i + 0] = (unsigned char)((x * 255) / (w > 1 ? w - 1 : 1));
            p[i + 1] = (unsigned char)((y * 255) / (h > 1 ? h - 1 : 1));
            p[i + 2] = (unsigned char)(128 + 127 * sinf(t));
            p[i + 3] = 255;
            if (y >= bar && y < bar + 8) { p[i + 0] = p[i + 1] = p[i + 2] = 255; }
        }
    }
    UpdateTexture(ev.texture, p);
}

// createExternalView(kind, propsObj?) → nodeId
JSValue JS_createExternalView(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "createExternalView: expected (kind, props?)");
    const char* kindC = JS_ToCString(ctx, argv[0]);
    if (!kindC) return JS_ThrowTypeError(ctx, "createExternalView: invalid kind");
    std::string kind = kindC;
    JS_FreeCString(ctx, kindC);

    raym3::v2::ViewProps props;
    if (argc >= 2 && JS_IsObject(argv[1])) {
        props.style = parseStyle(ctx, argv[1]);
        if (auto z = jsGetFloat(ctx, argv[1], "zIndex")) props.zIndex = (int)roundf(*z);
    }

    const int id = nextNativeNodeId();
    auto layoutRect = std::make_shared<Rectangle>(Rectangle{0, 0, 0, 0});
    const bool isStub = (kind == "stub");

    auto node = raym3::v2::Custom(props, [id, layoutRect, isStub](Rectangle layout) {
        *layoutRect = layout;
        auto it = g_externalViews.find(id);
        if (it == g_externalViews.end()) return;
        ExternalViewEntry& ev = it->second;

        // Push layout changes to the platform host (dp-space).
        if (g_externalViewRectCb &&
            (fabsf(layout.x - ev.lastPushedRect.x) > 0.5f ||
             fabsf(layout.y - ev.lastPushedRect.y) > 0.5f ||
             fabsf(layout.width - ev.lastPushedRect.width) > 0.5f ||
             fabsf(layout.height - ev.lastPushedRect.height) > 0.5f)) {
            ev.lastPushedRect = layout;
            g_externalViewRectCb(id, ev.kind.c_str(), layout.x, layout.y, layout.width, layout.height);
        }

        // Lazy texture creation: JS executes before InitWindow on Android.
        if (!ev.externalTexture && ev.texture.id == 0 && IsWindowReady() &&
            layout.width >= 1.0f && layout.height >= 1.0f) {
            const int pw = (int)raym3::v2::Density::RasterPixels(layout.width);
            const int ph = (int)raym3::v2::Density::RasterPixels(layout.height);
            Image blank = GenImageColor(pw > 0 ? pw : 1, ph > 0 ? ph : 1, Color{0, 0, 0, 0});
            ev.texture = LoadTextureFromImage(blank);
            UnloadImage(blank);
            SetTextureFilter(ev.texture, TEXTURE_FILTER_BILINEAR);
        }
        if (ev.texture.id == 0) return;

        if (isStub && !ev.externalTexture) stubProducerTick(ev);

        // Expand the destination by the producer's content insets so overflow
        // chrome (selection handles, context menu) draws outside the field.
        Rectangle dst = layout;
        if (ev.insetL || ev.insetT || ev.insetR || ev.insetB) {
            const float l = raym3::v2::Density::PxToDp(ev.insetL);
            const float t = raym3::v2::Density::PxToDp(ev.insetT);
            dst.x -= l;
            dst.y -= t;
            dst.width += l + raym3::v2::Density::PxToDp(ev.insetR);
            dst.height += t + raym3::v2::Density::PxToDp(ev.insetB);
        }
        Rectangle src{0, 0, (float)ev.texture.width, (float)ev.texture.height};
        DrawTexturePro(ev.texture, src, dst, {0, 0}, 0.0f, WHITE);
    });

    // Stub animates continuously; real producers wake frames via requestFrame.
    if (isStub) node->alwaysAnimates = true;

    // P1 input: forward presses view-local to the host sink (full down/move/up
    // routing with stashed MotionEvents lands with the Android producer).
    node->onPress = [id, layoutRect]() {
        if (!g_externalViewInputCb) return;
        Vector2 m = GetMousePosition();
#if defined(RAYACT_ANDROID) || defined(__ANDROID__)
        m = raym3::v2::Density::PxToDp(m);
#endif
        g_externalViewInputCb(id, 1 /*up=tap*/, m.x - layoutRect->x, m.y - layoutRect->y);
    };

    g_nodes[id] = node;
    ExternalViewEntry ev;
    ev.kind = kind;
    ev.nodeId = id;
    ev.layoutRect = layoutRect;
    g_externalViews[id] = std::move(ev);
    if (argc >= 2 && JS_IsObject(argv[1])) captureNodeClassName(ctx, id, argv[1]);
    return JS_NewInt32(ctx, id);
}

// setExternalViewProps(nodeId, propsObj) — forwards producer-relevant props
// (value, placeholder, inputType, secure, focused) to the platform host as
// key/value strings.
JSValue JS_setExternalViewProps(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setExternalViewProps: expected (nodeId, props)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_externalViews.find(id);
    if (it == g_externalViews.end()) return JS_UNDEFINED;

    JSValue fv = JS_GetPropertyStr(ctx, argv[1], "focused");
    if (!JS_IsUndefined(fv)) {
        bool want = JS_ToBool(ctx, fv) != 0;
        if (want != it->second.focused) {
            it->second.focused = want;
            if (g_externalViewPropCb)
                g_externalViewPropCb(id, "focused", want ? "1" : "0");
        }
    }
    JS_FreeValue(ctx, fv);

    static const char* kForwarded[] = {"value", "placeholder", "inputType", "secure"};
    for (const char* key : kForwarded) {
        JSValue v = JS_GetPropertyStr(ctx, argv[1], key);
        if (!JS_IsUndefined(v) && !JS_IsNull(v)) {
            const char* str = JS_ToCString(ctx, v);
            if (str && g_externalViewPropCb) g_externalViewPropCb(id, key, str);
            if (str) JS_FreeCString(ctx, str);
        }
        JS_FreeValue(ctx, v);
    }
    return JS_UNDEFINED;
}

JSValue JS_createSafeArea(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    raym3::v2::ViewProps props;
    raym3::v2::Style baseStyle;
    if (argc >= 1 && JS_IsObject(argv[0])) {
        baseStyle = parseStyle(ctx, argv[0]);
        if (auto z = jsGetFloat(ctx, argv[0], "zIndex")) props.zIndex = (int)roundf(*z);
    }
    props.style = applySafeAreaPadding(baseStyle);
    auto node = raym3::v2::View(props);
    int id = nextNativeNodeId();
    g_nodes[id] = node;
    g_safeAreaBaseStyles[id] = baseStyle;
    if (argc >= 1 && JS_IsObject(argv[0])) captureNodeClassName(ctx, id, argv[0]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_createStatusBar(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    raym3::v2::ViewProps props;
    props.style.display = raym3::v2::Display::None;
    if (argc >= 1 && JS_IsObject(argv[0]))
        props.style = raym3::v2::MergeStyles(props.style, parseStyle(ctx, argv[0]));
    auto node = raym3::v2::View(props);
    int id = nextNativeNodeId();
    g_nodes[id] = node;
    if (argc >= 1 && JS_IsObject(argv[0])) captureNodeClassName(ctx, id, argv[0]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_createActivityIndicator(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    float size = 48.0f; // M3 spec: circular progress indicator is 48dp
    Color color = BLANK;
    bool wavy = true; // M3 expressive active indicator is wavy by default
    float wavelength = 15.0f;
    raym3::v2::ViewProps props;
    if (argc >= 1 && JS_IsObject(argv[0])) {
        // Resolve size prop first, then let CSS override via MergeStyles
        if (auto v = jsGetFloat(ctx, argv[0], "size")) {
            size = *v;
        } else {
            std::string sizeStr = jsGetString(ctx, argv[0], "size");
            if (sizeStr == "small") size = 24.0f;
            else if (sizeStr == "large") size = 48.0f;
        }
        props.style.width = size;
        props.style.height = size;
        // CSS className and inline style override the size prop
        props.style = raym3::v2::MergeStyles(props.style, parseStyle(ctx, argv[0]));
        if (auto c = jsGetColor(ctx, argv[0], "color")) color = *c;
        wavy = jsGetBool(ctx, argv[0], "wavy", wavy);
        if (auto wl = jsGetFloat(ctx, argv[0], "wavelength")) wavelength = *wl;
    } else {
        props.style.width = size;
        props.style.height = size;
    }
    auto node = raym3::v2::Custom(props, [color, wavy, wavelength](Rectangle layout) {
        Vector2 center = {layout.x + layout.width * 0.5f, layout.y + layout.height * 0.5f};
        float outer = std::min(layout.width, layout.height) * 0.5f;
        float stroke = 4.0f;
        float inner = outer - stroke;
        float radius = (inner + outer) * 0.5f;
        float capR = stroke * 0.5f;
        float gapDeg = radius > 0.0f ? (4.0f / radius) * RAD2DEG : 0.0f;
        float waveLen = wavelength > 0.0f ? wavelength : 15.0f;
        float t = (float)GetTime();
        float sweep = 36.0f + (sinf(t * 3.2f) * 0.5f + 0.5f) * 234.0f;
        float start = fmodf(t * 270.0f, 360.0f) - 90.0f;
        Color c = color.a > 0 ? color : raym3::Theme::GetColorScheme().primary;
        Color track = raym3::Theme::GetColorScheme().secondaryContainer;
        auto cap = [&](float deg, Color capColor) {
            float a = deg * DEG2RAD;
            DrawCircleV({center.x + cosf(a) * radius, center.y + sinf(a) * radius}, capR, capColor);
        };
        if ((start + 360.0f - gapDeg) - (start + sweep + gapDeg) > 0.5f)
            DrawRing(center, inner, outer, start + sweep + gapDeg, start + 360.0f - gapDeg, 96, track);
        if (wavy) {
            float arcLen = fabsf(sweep * DEG2RAD * radius);
            int steps = std::max(12, (int)ceilf(arcLen / 2.5f));
            Vector2 first = {0.0f, 0.0f};
            Vector2 prev = {0.0f, 0.0f};
            float phase = t * 5.0f;
            for (int i = 0; i <= steps; ++i) {
                float u = (float)i / (float)steps;
                float deg = start + sweep * u;
                float distance = arcLen * u;
                float rr = radius + 1.6f * sinf((distance / waveLen) * 2.0f * PI + phase);
                float a = deg * DEG2RAD;
                Vector2 p = {center.x + cosf(a) * rr, center.y + sinf(a) * rr};
                if (i == 0) first = p;
                else DrawLineEx(prev, p, stroke, c);
                // Round join at every vertex: DrawLineEx quads meet only at the
                // centerline, leaving triangular gaps ("cracks") on the outer
                // edge of each bend. A capR circle at each point fills them.
                DrawCircleV(p, capR, c);
                prev = p;
            }
            DrawCircleV(first, capR, c);
        } else {
            DrawRing(center, inner, outer, start, start + sweep, 96, c);
            cap(start, c);
            cap(start + sweep, c);
        }
    });
    int id = nextNativeNodeId();
    g_nodes[id] = node;
    if (argc >= 1 && JS_IsObject(argv[0])) captureNodeClassName(ctx, id, argv[0]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_createAvoidKeyboard(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    return JS_createView(ctx, JS_UNDEFINED, argc, argv);
}

JSValue JS_createMaterialComponent(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) {
        return JS_ThrowTypeError(ctx, "createMaterialComponent: expected (component, props?)");
    }

    const char* componentName = JS_ToCString(ctx, argv[0]);
    if (!componentName) return JS_ThrowTypeError(ctx, "createMaterialComponent: invalid component");
    std::string componentKey = componentName;
    auto component = materialComponentFromString(componentName);
    auto nativeControl = nativeControlKindFromString(componentKey);
    JS_FreeCString(ctx, componentName);
    if (!component) return JS_ThrowTypeError(ctx, "createMaterialComponent: unknown component");

    if (nativeControl) {
        raym3::v2::ViewProps controlProps;
        int id = nextNativeNodeId();
        g_nativeControlStates[id] = {.kind = *nativeControl};
        controlProps.style.pointerEvents = raym3::v2::PointerEvents::None;

        // Parse slider size before setting layout defaults.
        SliderSizeVals sv = {raym3::v2::tokens::kSliderTrackHeight,
                             raym3::v2::tokens::kSliderHandleHeight};
        if ((*nativeControl == NativeControlKind::Slider ||
             *nativeControl == NativeControlKind::RangeSlider) &&
            argc >= 2 && JS_IsObject(argv[1])) {
            JSValue sizeVal = JS_GetPropertyStr(ctx, argv[1], "size");
            if (!JS_IsUndefined(sizeVal) && !JS_IsNull(sizeVal)) {
                const char* sz = JS_ToCString(ctx, sizeVal);
                if (sz) { sv = sliderSizeFor(sz); JS_FreeCString(ctx, sz); }
            }
            JS_FreeValue(ctx, sizeVal);
        }

        // Apply M3 default dimensions so Yoga gives correct layout bounds.
        // Without these, hit testing fails (Yoga computes 0×0 for unsized nodes).
        switch (*nativeControl) {
            case NativeControlKind::Switch: {
                auto m = raym3::v2::GetMaterialMetrics(raym3::v2::M3Component::Switch);
                controlProps.style.width = m.layoutWidth;
                controlProps.style.height = m.layoutHeight;
                controlProps.style.minWidth = m.minWidth;
                controlProps.style.minHeight = m.minHeight;
                break;
            }
            case NativeControlKind::Checkbox: {
                auto m = raym3::v2::GetMaterialMetrics(raym3::v2::M3Component::Checkbox);
                controlProps.style.width = m.layoutWidth;
                controlProps.style.height = m.layoutHeight;
                controlProps.style.minWidth = m.minWidth;
                controlProps.style.minHeight = m.minHeight;
                break;
            }
            case NativeControlKind::RadioButton: {
                auto m = raym3::v2::GetMaterialMetrics(raym3::v2::M3Component::RadioButton);
                controlProps.style.width = m.layoutWidth;
                controlProps.style.height = m.layoutHeight;
                controlProps.style.minWidth = m.minWidth;
                controlProps.style.minHeight = m.minHeight;
                break;
            }
            case NativeControlKind::Slider:
            case NativeControlKind::RangeSlider: {
                auto m = raym3::v2::GetMaterialMetrics(
                    *nativeControl == NativeControlKind::RangeSlider
                        ? raym3::v2::M3Component::RangeSlider
                        : raym3::v2::M3Component::Slider);
                controlProps.style.height = sv.handleH;
                controlProps.style.minHeight = sv.handleH;
                controlProps.style.minWidth = m.minWidth;
                break;
            }
        }

        if (argc >= 2 && JS_IsObject(argv[1])) {
            if (auto z = jsGetFloat(ctx, argv[1], "zIndex")) controlProps.zIndex = (int)roundf(*z);
            auto explicitStyle = parseStyle(ctx, argv[1]);
            // Merge: explicit style overrides defaults, but keep defaults where not set
            if (explicitStyle.width)    controlProps.style.width    = explicitStyle.width;
            if (explicitStyle.height)   controlProps.style.height   = explicitStyle.height;
            if (explicitStyle.minWidth) controlProps.style.minWidth = explicitStyle.minWidth;
            if (explicitStyle.minHeight)controlProps.style.minHeight= explicitStyle.minHeight;
            if (explicitStyle.flexGrow)   controlProps.style.flexGrow   = explicitStyle.flexGrow;
            if (explicitStyle.flexShrink) controlProps.style.flexShrink = explicitStyle.flexShrink;
            if (explicitStyle.flexBasis)  controlProps.style.flexBasis  = explicitStyle.flexBasis;
            controlProps.style.margin    = explicitStyle.margin;
            controlProps.style.padding   = explicitStyle.padding;
            controlProps.style.alignSelf = explicitStyle.alignSelf;
            controlProps.style.pointerEvents = raym3::v2::PointerEvents::None;
            enforceNativeControlLayoutDefaults(id, controlProps.style);
            updateNativeControlState(ctx, id, argv[1]);
            captureNodeClassName(ctx, id, argv[1]);
        }
        enforceNativeControlLayoutDefaults(id, controlProps.style);

        // Store slider size values for use in the render lambda.
        if (*nativeControl == NativeControlKind::Slider ||
            *nativeControl == NativeControlKind::RangeSlider) {
            g_nativeControlStates[id].sliderTrackH  = sv.trackH;
            g_nativeControlStates[id].sliderHandleH = sv.handleH;
        }

        auto node = raym3::v2::Custom(controlProps, [id](Rectangle layout) {
            auto it = g_nativeControlStates.find(id);
            if (it == g_nativeControlStates.end()) return;

            NativeControlState& state = it->second;
            bool value = state.checked;
            bool changed = false;

            // Material state transitions use a fixed-duration curve so the
            // native bridge matches the v2 component painters.
            float target = state.checked ? 1.0f : 0.0f;
            float dt = GetFrameTime();
            if (dt <= 0.0f || dt > 0.1f) dt = 0.016f;
            if (state.anim < 0.0f) {
                state.anim = target;
                state.animFrom = target;
                state.animTarget = target;
                state.animElapsedMs = raym3::v2::tokens::kSwitchToggleDurationMs;
            } else if (state.animTarget != target) {
                state.animFrom = state.anim;
                state.animTarget = target;
                state.animElapsedMs = 0.0f;
            }
            if (state.anim != state.animTarget) {
                state.animElapsedMs += dt * 1000.0f;
                float duration = raym3::v2::tokens::kSwitchToggleDurationMs;
                float t = duration <= 0.0f ? 1.0f : state.animElapsedMs / duration;
                if (t >= 1.0f) {
                    state.anim = state.animTarget;
                } else {
                    float eased = easeInOutCubic(t);
                    state.anim = state.animFrom +
                                 (state.animTarget - state.animFrom) * eased;
                }
            }

            switch (state.kind) {
            case NativeControlKind::Checkbox: {
                Vector2 m = GetMousePosition();
#if defined(RAYACT_ANDROID) || defined(__ANDROID__)
                m = raym3::v2::Density::PxToDp(m);
#endif
                bool over = !state.disabled && CheckCollisionPointRec(m, layout) && raym3::v2::OwnsInput(g_nodes[id], m);
                bool pressed = over && IsMouseButtonDown(MOUSE_BUTTON_LEFT);
                paintNativeMaterialCheckbox(layout, state, state.anim, pressed);
                changed = over && IsMouseButtonReleased(MOUSE_BUTTON_LEFT);
                value = !state.checked;
                break;
            }
            case NativeControlKind::Switch: {
                Vector2 m = GetMousePosition();
#if defined(RAYACT_ANDROID) || defined(__ANDROID__)
                m = raym3::v2::Density::PxToDp(m);
#endif
                bool over = !state.disabled && CheckCollisionPointRec(m, layout) && raym3::v2::OwnsInput(g_nodes[id], m);
                bool pressed = over && IsMouseButtonDown(MOUSE_BUTTON_LEFT);
                paintNativeMaterialSwitch(layout, state, state.anim, pressed);
                changed = over && IsMouseButtonReleased(MOUSE_BUTTON_LEFT);
                value = !state.checked;
                break;
            }
            case NativeControlKind::RadioButton: {
                Vector2 m = GetMousePosition();
#if defined(RAYACT_ANDROID) || defined(__ANDROID__)
                m = raym3::v2::Density::PxToDp(m);
#endif
                bool over = !state.disabled && CheckCollisionPointRec(m, layout) && raym3::v2::OwnsInput(g_nodes[id], m);
                bool pressed = over && IsMouseButtonDown(MOUSE_BUTTON_LEFT);
                paintNativeMaterialRadio(layout, state, state.anim, pressed);
                changed = over && IsMouseButtonReleased(MOUSE_BUTTON_LEFT);
                value = true;
                break;
            }
            case NativeControlKind::Slider: {
                const auto& scheme = raym3::Theme::GetColorScheme();
                float span = (state.maxValue - state.minValue);
                float opacity = state.disabled ? 0.38f : 1.0f;
                float trackX = layout.x;
                float trackW = layout.width;
                float p = span > 0.0f ? std::clamp((state.value - state.minValue) / span, 0.0f, 1.0f) : 0.0f;
                float trackH  = state.sliderTrackH;
                float handleH = state.sliderHandleH;
                float handleW = raym3::v2::tokens::kSliderHandleWidth;
                float cy = layout.y + layout.height * 0.5f;
                float thumbX = trackX + p * trackW;
                thumbX = std::clamp(thumbX, trackX, trackX + trackW);
                float handleGap = raym3::v2::tokens::kSliderTrackGap;
                float activeEnd = std::max(trackX, thumbX - handleW * 0.5f - handleGap);
                float inactiveStart = std::min(trackX + trackW, thumbX + handleW * 0.5f + handleGap);
                float innerRadius = std::min(2.0f, trackH * 0.05f);
                if (activeEnd > trackX)
                    DrawSliderTrackSegment({trackX, cy - trackH * 0.5f, activeEnd - trackX, trackH}, trackH * 0.5f, innerRadius, ColorAlpha(scheme.primary, opacity));
                if (inactiveStart < trackX + trackW)
                    DrawSliderTrackSegment({inactiveStart, cy - trackH * 0.5f, trackX + trackW - inactiveStart, trackH}, innerRadius, trackH * 0.5f, ColorAlpha(scheme.secondaryContainer, opacity));
                Vector2 mouse = GetMousePosition();
#if defined(RAYACT_ANDROID) || defined(__ANDROID__)
                mouse = raym3::v2::Density::PxToDp(mouse);
#endif
                if (!state.disabled && CheckCollisionPointRec(mouse, layout))
                    DrawCircle((int)thumbX, (int)cy, 20.0f, ColorAlpha(scheme.primary, 0.12f));
                DrawRectangleRounded({thumbX - handleW * 0.5f, cy - handleH * 0.5f, handleW, handleH}, handleW * 0.5f, 8, ColorAlpha(scheme.primary, opacity));
                break;
            }
            case NativeControlKind::RangeSlider: {
                const auto& scheme = raym3::Theme::GetColorScheme();
                float opacity = state.disabled ? 0.38f : 1.0f;
                float trackX = layout.x;
                float trackW = layout.width;
                if (state.startValue > state.endValue) std::swap(state.startValue, state.endValue);

                float start = std::clamp(state.startValue, 0.0f, 1.0f);
                float end = std::clamp(state.endValue, 0.0f, 1.0f);
                if (start > end) std::swap(start, end);
                float trackH = state.sliderTrackH;
                float handleH = state.sliderHandleH;
                float handleW = raym3::v2::tokens::kSliderHandleWidth;
                float handleGap = raym3::v2::tokens::kSliderTrackGap;
                float cy = layout.y + layout.height * 0.5f;
                float leftX = trackX + start * trackW;
                float rightX = trackX + end * trackW;
                // Gaps (masks) on BOTH sides of each thumb to hide the track,
                // like the standard slider.
                float leftInactiveEnd = std::max(trackX, leftX - handleW * 0.5f - handleGap);
                float activeStart = std::min(trackX + trackW, leftX + handleW * 0.5f + handleGap);
                float activeEnd = std::max(trackX, rightX - handleW * 0.5f - handleGap);
                float rightInactiveStart = std::min(trackX + trackW, rightX + handleW * 0.5f + handleGap);
                float innerRadius = std::min(2.0f, trackH * 0.05f);

                if (leftInactiveEnd > trackX)
                    DrawSliderTrackSegment({trackX, cy - trackH * 0.5f, leftInactiveEnd - trackX, trackH}, trackH * 0.5f, innerRadius, ColorAlpha(scheme.secondaryContainer, opacity));
                if (activeEnd > activeStart)
                    DrawSliderTrackSegment({activeStart, cy - trackH * 0.5f, activeEnd - activeStart, trackH}, innerRadius, innerRadius, ColorAlpha(scheme.primary, opacity));
                if (rightInactiveStart < trackX + trackW)
                    DrawSliderTrackSegment({rightInactiveStart, cy - trackH * 0.5f, trackX + trackW - rightInactiveStart, trackH}, innerRadius, trackH * 0.5f, ColorAlpha(scheme.secondaryContainer, opacity));

                Vector2 mouse = GetMousePosition();
#if defined(RAYACT_ANDROID) || defined(__ANDROID__)
                mouse = raym3::v2::Density::PxToDp(mouse);
#endif
                if (!state.disabled && CheckCollisionPointRec(mouse, layout)) {
                    float hoverX = fabsf(mouse.x - leftX) <= fabsf(mouse.x - rightX) ? leftX : rightX;
                    DrawCircle((int)hoverX, (int)cy, 20.0f, ColorAlpha(scheme.primary, 0.12f));
                }
                Color handleColor = ColorAlpha(scheme.primary, opacity);
                DrawRectangleRounded({leftX - handleW * 0.5f, cy - handleH * 0.5f, handleW, handleH}, handleW * 0.5f, 8, handleColor);
                DrawRectangleRounded({rightX - handleW * 0.5f, cy - handleH * 0.5f, handleW, handleH}, handleW * 0.5f, 8, handleColor);
                break;
            }
            }

            if (changed && !state.disabled) {
                state.checked = value;
                queuePressCallback(id);
            }
        });

        // Promote to a first-class raym3 control node: raym3 core now paints
        // and drives interaction (ResolveInput). The Custom lambda above is
        // dead weight (never invoked once kind != Custom) — clear it.
        node->customRender = nullptr;
        switch (*nativeControl) {
            case NativeControlKind::Slider:      node->kind = raym3::v2::NodeKind::Slider; break;
            case NativeControlKind::RangeSlider: node->kind = raym3::v2::NodeKind::RangeSlider; break;
            case NativeControlKind::Switch:      node->kind = raym3::v2::NodeKind::Switch; break;
            case NativeControlKind::Checkbox:    node->kind = raym3::v2::NodeKind::Checkbox; break;
            case NativeControlKind::RadioButton: node->kind = raym3::v2::NodeKind::RadioButton; break;
        }
        node->capturesInput = true;
        node->onValueChange = [id](float v) {
            auto nit = g_nodes.find(id);
            auto sit = g_nativeControlStates.find(id);
            if (nit != g_nodes.end() && nit->second && sit != g_nativeControlStates.end()) {
                sit->second.value = nit->second->control.value;
                sit->second.startValue = nit->second->control.startValue;
                sit->second.endValue = nit->second->control.endValue;
            }
            invokeChangeValueCallback(id, v);
        };
        node->onToggle = [id](bool checked) {
            auto sit = g_nativeControlStates.find(id);
            if (sit != g_nativeControlStates.end()) sit->second.checked = checked;
            queuePressCallback(id);
        };
        g_nodes[id] = node;
        syncControlNodeFromState(id);
        return JS_NewInt32(ctx, id);
    }

    raym3::v2::ComponentProps props;
    if (argc >= 2 && JS_IsObject(argv[1])) props = parseMaterialProps(ctx, argv[1]);

    int id = nextNativeNodeId();
    // onPress is intentionally left null here. JS_setOnPress sets it only when
    // a real JS callback is registered, so containers without handlers stay
    // non-interactive (ComputeState + HitTest both gate on node->onPress).

    g_nodes[id] = raym3::v2::MaterialComponent(*component, props);
    g_materialComponentKinds[id] = *component;
    if (argc >= 2 && JS_IsObject(argv[1])) captureNodeClassName(ctx, id, argv[1]);
    return JS_NewInt32(ctx, id);
}

static int nodeToId(const raym3::v2::NodePtr& ptr) {
    for (auto& [nid, node] : g_nodes)
        if (node == ptr) return nid;
    return -1;
}

static void syncNavItemIconFill(const raym3::v2::NodePtr& node, bool selected) {
    for (auto& child : node->children) {
        if (!child) continue;
        int childId = nodeToId(child);
        auto iconIt = g_iconRenderStates.find(childId);
        if (iconIt == g_iconRenderStates.end()) continue;
        if (iconIt->second.filled != selected) {
            iconIt->second.filled = selected;
            if (iconIt->second.codepoint != 0)
                requireIcon(iconIt->second.codepoint,
                            (int)roundf(iconIt->second.size), selected);
        }
    }
}

JSValue JS_setMaterialComponentProps(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setMaterialComponentProps: expected (nodeId, props)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setMaterialComponentProps: invalid node id");
    if (!JS_IsObject(argv[1])) return JS_UNDEFINED;

    auto materialIt = g_materialComponentKinds.find(id);
    if (materialIt != g_materialComponentKinds.end()) {
        raym3::v2::Style previousStyle = it->second->style;
        raym3::v2::ComponentProps props = parseMaterialProps(ctx, argv[1]);
        // React commits only changed props, so a selection key missing from this
        // payload means "unchanged" — not false. parseMaterialProps defaults it
        // to false, which would wipe the active state (e.g. the nav-rail pill)
        // every frame. Preserve the current value when no selection key is sent,
        // mirroring how the JS side keeps the filled-icon variant in sync.
        if (!jsHasProperty(ctx, argv[1], "selected") &&
            !jsHasProperty(ctx, argv[1], "checked") &&
            !jsHasProperty(ctx, argv[1], "indeterminate")) {
            props.selected = it->second->selected;
        }
        // Nav item: selection-only commits should not rebuild via MaterialComponent
        // (which would churn styles). Update selected + label/icon sync only so the
        // native Flutter-style per-item indicator animation can run continuously.
        if (materialIt->second == raym3::v2::M3Component::NavigationBarItem &&
            it->second->role == raym3::v2::NodeRole::NavItem &&
            !jsHasProperty(ctx, argv[1], "className") &&
            !jsHasProperty(ctx, argv[1], "style") &&
            !jsHasProperty(ctx, argv[1], "label") &&
            !jsHasProperty(ctx, argv[1], "text")) {
            bool selected = jsGetBool(ctx, argv[1], "selected", false) ||
                            jsGetBool(ctx, argv[1], "checked", false) ||
                            jsGetBool(ctx, argv[1], "indeterminate", false);
            if (!jsHasProperty(ctx, argv[1], "selected") &&
                !jsHasProperty(ctx, argv[1], "checked") &&
                !jsHasProperty(ctx, argv[1], "indeterminate")) {
                selected = it->second->selected;
            }
            it->second->selected = selected;
            Color labelColor = selected ? raym3::Theme::GetColorScheme().onSurface
                                        : raym3::Theme::GetColorScheme().onSurfaceVariant;
            for (auto& child : it->second->children) {
                if (child && child->kind == raym3::v2::NodeKind::Text) {
                    child->style.text.color = labelColor;
                }
            }
            syncNavItemIconFill(it->second, selected);
            updateNativeControlState(ctx, id, argv[1]);
            return JS_UNDEFINED;
        }
        props.onPress = it->second->onPress;
        auto updated = raym3::v2::MaterialComponent(materialIt->second, props);
        it->second->style = (jsHasProperty(ctx, argv[1], "className") || jsHasProperty(ctx, argv[1], "style"))
            ? updated->style
            : preserveLayoutStyle(updated->style, previousStyle);
        // Overlay surfaces toggle visibility via the `open` prop -> display.
        // A style-only partial update (common when JS passes an inline style
        // object that React recreates every render) rebuilds the full style
        // with the default open=false -> display:none, which would wrongly
        // hide an already-open overlay whose `open` didn't change (so it isn't
        // in the diff payload). Re-apply display from the payload's `open` when
        // present; otherwise preserve the prior open-driven display.
        if (materialIt->second == raym3::v2::M3Component::Dialog ||
            materialIt->second == raym3::v2::M3Component::BottomSheet ||
            materialIt->second == raym3::v2::M3Component::SideSheet ||
            materialIt->second == raym3::v2::M3Component::DatePicker ||
            materialIt->second == raym3::v2::M3Component::TimePicker ||
            materialIt->second == raym3::v2::M3Component::Popover) {
            it->second->style.display = jsHasProperty(ctx, argv[1], "open")
                ? updated->style.display
                : previousStyle.display;
        }
        it->second->stateStyles = updated->stateStyles;
        it->second->motion = updated->motion;
        it->second->disabled = updated->disabled;
        it->second->zIndex = updated->zIndex;
        // Overlay hit-test flags are assigned in MaterialComponent() at create
        // time. Only re-sync them when the update payload actually carries the
        // prop: React sends DIFF payloads, so an inner-state re-render (month
        // nav, day select) omits an unchanged `scrim`/`anchor` — rebuilding
        // from the diff would silently reset the scrim and input capture,
        // killing backdrop dismiss for the still-open overlay.
        if (jsHasProperty(ctx, argv[1], "scrim")) {
            it->second->hasScrim = updated->hasScrim;
            it->second->capturesInput = updated->capturesInput;
        }
        if (jsHasProperty(ctx, argv[1], "capturesInput"))
            it->second->capturesInput = updated->capturesInput;
        it->second->selected = updated->selected;
        if (jsHasProperty(ctx, argv[1], "anchor"))
            it->second->anchorId = updated->anchorId;
        if (jsHasProperty(ctx, argv[1], "placement"))
            it->second->placement = updated->placement;
        // SegmentedButton/ButtonGroup/Tabs role (container vs item) is determined
        // at creation via label presence and must not be overwritten on partial
        // prop updates (which omit label). All other components are safe to update.
        const bool isContainerItemKind =
            materialIt->second == raym3::v2::M3Component::SegmentedButton ||
            materialIt->second == raym3::v2::M3Component::ButtonGroup ||
            materialIt->second == raym3::v2::M3Component::Tabs;
        if (!isContainerItemKind) {
            it->second->role = updated->role;
        }
        // SegmentedButton/ButtonGroup/Tabs items: rebuild internal children so the
        // checkmark/label restyle as selected state changes. Containers
        // (ButtonGroupContainer / Tabs role) own their children via JS_appendChild
        // — don't touch those.
        const bool isContainer =
            it->second->role == raym3::v2::NodeRole::ButtonGroupContainer ||
            it->second->role == raym3::v2::NodeRole::ButtonGroupConnected ||
            it->second->role == raym3::v2::NodeRole::NavigationBar ||
            it->second->role == raym3::v2::NodeRole::Tabs;
        if (isContainerItemKind && !isContainer) {
            // Partial prop updates omit label. Recover it from the existing
            // Text child so MaterialComponent takes the item (not container) branch.
            if (props.label.empty()) {
                for (auto& child : it->second->children) {
                    if (child && child->kind == raym3::v2::NodeKind::Text &&
                        !child->text.empty()) {
                        props.label = child->text;
                        break;
                    }
                }
            }
            if (!props.label.empty()) {
                auto itemUpdated = raym3::v2::MaterialComponent(materialIt->second, props);
                it->second->style = preserveLayoutStyle(itemUpdated->style, previousStyle);
                it->second->stateStyles = itemUpdated->stateStyles;
                it->second->motion = itemUpdated->motion;
                it->second->disabled = itemUpdated->disabled;
                it->second->selected = itemUpdated->selected;
                it->second->children = itemUpdated->children;
            }
        }
    } else if (jsHasProperty(ctx, argv[1], "className") || jsHasProperty(ctx, argv[1], "style")) {
        auto parsed = parseStyle(ctx, argv[1]);
        if (g_nativeControlStates.count(id)) {
            // Merge: preserve M3 default dimensions (height/minHeight etc.) set at creation.
            it->second->style = raym3::v2::MergeStyles(it->second->style, parsed);
            enforceNativeControlLayoutDefaults(id, it->second->style);
        } else {
            it->second->style = parsed;
        }
    }
    if (g_nativeControlStates.find(id) != g_nativeControlStates.end()) {
        enforceNativeControlLayoutDefaults(id, it->second->style);
        it->second->style.pointerEvents = raym3::v2::PointerEvents::None;
    }
    bool selected = jsGetBool(ctx, argv[1], "selected", it->second->selected) ||
                    jsGetBool(ctx, argv[1], "checked", false) ||
                    jsGetBool(ctx, argv[1], "indeterminate", false);
    it->second->selected = selected;
    it->second->disabled = jsGetBool(ctx, argv[1], "disabled", it->second->disabled);
    if (auto z = jsGetFloat(ctx, argv[1], "zIndex")) it->second->zIndex = (int)roundf(*z);
    if (it->second->role == raym3::v2::NodeRole::NavItem) {
        Color labelColor = selected ? raym3::Theme::GetColorScheme().onSurface
                                    : raym3::Theme::GetColorScheme().onSurfaceVariant;
        for (auto& child : it->second->children) {
            if (child && child->kind == raym3::v2::NodeKind::Text) {
                child->style.text.color = labelColor;
            }
        }
        syncNavItemIconFill(it->second, selected);
    }
    updateNativeControlState(ctx, id, argv[1]);
    return JS_UNDEFINED;
}

static void appendChildPreservingNavLabel(const raym3::v2::NodePtr& parent,
                                          const raym3::v2::NodePtr& child) {
    auto& children = parent->children;
    if (parent->role == raym3::v2::NodeRole::NavItem &&
        !children.empty() &&
        children.front() && children.front()->kind == raym3::v2::NodeKind::Text &&
        child && child->kind != raym3::v2::NodeKind::Text) {
        children.insert(children.begin(), child);
        return;
    }
    // ExtendedFab/Button created with a `label` keeps it in node->text (drawn
    // centered). When React then appends a leading Icon child, the centered text
    // would overlap the icon. Convert node->text into a trailing Text child so
    // Yoga lays out [icon][label] as a centered row, matching the no-children
    // composed path in MaterialComponent.
    if (parent->kind == raym3::v2::NodeKind::Button && !parent->text.empty() &&
        child && child->kind != raym3::v2::NodeKind::Text) {
        raym3::v2::TextProps textProps;
        textProps.style.text = parent->style.text;
        children.push_back(child);
        children.push_back(raym3::v2::Text(parent->text, textProps));
        parent->text.clear();
        return;
    }
    children.push_back(child);
}

// React moves (re-append / insertBefore of an already-mounted node) arrive
// without an explicit removeChild from the old parent. Detach the child from
// whatever parent currently holds it — otherwise it sits in two children
// vectors and the per-frame Yoga rebuild inserts the same YGNode twice,
// aborting with "Child already has a owner, it must be removed first."
// Tolerant of stale ids for the same reason as JS_removeChild.
static void detachFromCurrentParent(int childId, const raym3::v2::NodePtr& child) {
    auto parentIt = g_nodeParents.find(childId);
    if (parentIt == g_nodeParents.end()) return;
    auto oldPit = g_nodes.find(parentIt->second);
    if (oldPit == g_nodes.end() || !oldPit->second) return;
    auto& oldChildren = oldPit->second->children;
    oldChildren.erase(std::remove(oldChildren.begin(), oldChildren.end(), child),
                      oldChildren.end());
}

JSValue JS_appendChild(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "appendChild: expected (parentId, childId)");
    int parentId, childId;
    JS_ToInt32(ctx, &parentId, argv[0]);
    JS_ToInt32(ctx, &childId,  argv[1]);

    auto pit = g_nodes.find(parentId);
    auto cit = g_nodes.find(childId);
    if (pit == g_nodes.end()) return JS_ThrowTypeError(ctx, "appendChild: invalid parent id");
    if (cit == g_nodes.end()) return JS_ThrowTypeError(ctx, "appendChild: invalid child id");

    detachFromCurrentParent(childId, cit->second);
    appendChildPreservingNavLabel(pit->second, cit->second);
    g_nodeParents[childId] = parentId;
    {
        raym3::Mutation m;
        m.op = raym3::MutationOp::AppendChild;
        m.parentId = (uint32_t)parentId;
        m.childId = (uint32_t)childId;
        rayact::mutationRecorder().record(m);
        rayact::shadowTree().appendChild((uint32_t)parentId, (uint32_t)childId);
    }
    // Sync icon fill to parent nav item's selected state immediately on append.
    if (pit->second->role == raym3::v2::NodeRole::NavItem &&
        g_iconRenderStates.count(childId)) {
        auto iconIt = g_iconRenderStates.find(childId);
        if (iconIt != g_iconRenderStates.end()) {
            bool sel = pit->second->selected;
            if (iconIt->second.filled != sel) {
                iconIt->second.filled = sel;
                if (iconIt->second.codepoint != 0)
                    requireIcon(iconIt->second.codepoint,
                                (int)roundf(iconIt->second.size), sel);
            }
        }
    }
    return JS_UNDEFINED;
}

JSValue JS_removeChild(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "removeChild: expected (parentId, childId)");
    int parentId, childId;
    JS_ToInt32(ctx, &parentId, argv[0]);
    JS_ToInt32(ctx, &childId, argv[1]);

    // Tolerant: node maps are global across screens and React 19 commits
    // async, so an unmount of a popped route can reference an id another
    // screen's commit already removed. Throwing here propagates into React's
    // commit phase and crashes after a few navigations — treat a missing id
    // as a no-op (the node is already detached) and just log it.
    auto pit = g_nodes.find(parentId);
    auto cit = g_nodes.find(childId);
    if (pit == g_nodes.end() || cit == g_nodes.end()) {
        RAYACT_NAV_LOG("removeChild stale id: parent=%d(%s) child=%d(%s) screen=%d",
                       parentId, pit == g_nodes.end() ? "miss" : "ok",
                       childId, cit == g_nodes.end() ? "miss" : "ok",
                       g_currentScreenId);
        if (cit != g_nodes.end()) g_nodeParents.erase(childId);
        return JS_UNDEFINED;
    }

    auto& children = pit->second->children;
    children.erase(std::remove(children.begin(), children.end(), cit->second), children.end());
    g_nodeParents.erase(childId);
    rayact::shadowTree().removeChild((uint32_t)parentId, (uint32_t)childId);
    return JS_UNDEFINED;
}

JSValue JS_insertBefore(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 3) return JS_ThrowTypeError(ctx, "insertBefore: expected (parentId, childId, beforeChildId)");
    int parentId, childId, beforeChildId;
    JS_ToInt32(ctx, &parentId, argv[0]);
    JS_ToInt32(ctx, &childId, argv[1]);
    JS_ToInt32(ctx, &beforeChildId, argv[2]);

    // Tolerant for the same reason as removeChild: a stale parent/child id is
    // a no-op, and a missing beforeChild degrades to append (handled below).
    auto pit = g_nodes.find(parentId);
    auto cit = g_nodes.find(childId);
    auto bit = g_nodes.find(beforeChildId);
    if (pit == g_nodes.end() || cit == g_nodes.end()) {
        RAYACT_NAV_LOG("insertBefore stale id: parent=%d(%s) child=%d(%s) before=%d screen=%d",
                       parentId, pit == g_nodes.end() ? "miss" : "ok",
                       childId, cit == g_nodes.end() ? "miss" : "ok",
                       beforeChildId, g_currentScreenId);
        return JS_UNDEFINED;
    }
    if (bit == g_nodes.end()) {
        RAYACT_NAV_LOG("insertBefore stale beforeChild=%d (append) parent=%d child=%d screen=%d",
                       beforeChildId, parentId, childId, g_currentScreenId);
    }

    detachFromCurrentParent(childId, cit->second);
    auto& children = pit->second->children;
    children.erase(std::remove(children.begin(), children.end(), cit->second), children.end());
    auto beforeIt = (bit == g_nodes.end())
        ? children.end()
        : std::find(children.begin(), children.end(), bit->second);
    if (beforeIt == children.end()) {
        children.push_back(cit->second);
    } else {
        children.insert(beforeIt, cit->second);
    }
    g_nodeParents[childId] = parentId;
    // Shadow tree has no ordered insert; append keeps Yoga ownership and the
    // parent bookkeeping consistent (its layout pass is threaded-mode only).
    rayact::shadowTree().appendChild((uint32_t)parentId, (uint32_t)childId);
    return JS_UNDEFINED;
}

// writeRootThrough: every mutation of g_root is mirrored into
// g_screens[g_currentScreenId].root. This makes the per-screen slot the
// authoritative store: a stray clearRootNode/disposeNode for a non-current
// screen (e.g. an async React unmount of a popped route) can no longer
// null the live root of the currently-rendered screen.
static inline void writeRootThrough(const raym3::v2::NodePtr& node) {
    if (!node) clearTransientInputCapture();
    g_root = node;
    if (!g_screens.count(g_currentScreenId)) {
        g_screens[g_currentScreenId] = ScreenState{};
    }
    g_screens[g_currentScreenId].root = node;
}

JSValue JS_setRootNode(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "setRootNode: expected (nodeId)");
    if (JS_IsNull(argv[0]) || JS_IsUndefined(argv[0])) {
        writeRootThrough(nullptr);
        return JS_UNDEFINED;
    }
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) {
        // Tolerant: a stale root id from an async cross-screen commit is a
        // no-op rather than a fatal throw.
        RAYACT_NAV_LOG("setRootNode stale id=%d screen=%d", id, g_currentScreenId);
        return JS_UNDEFINED;
    }
    writeRootThrough(it->second);
    {
        raym3::Mutation m;
        m.op = raym3::MutationOp::SetRoot;
        m.id = (uint32_t)id;
        rayact::mutationRecorder().record(m);
    }
    return JS_UNDEFINED;
}

JSValue JS_clearRootNode(JSContext*, JSValue, int, JSValueConst*) {
    writeRootThrough(nullptr);
    return JS_UNDEFINED;
}

JSValue JS_setOnPress(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnPress: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnPress: invalid node id");

    auto cit = g_pressCallbacks.find(id);
    if (cit != g_pressCallbacks.end()) JS_FreeValue(ctx, cit->second);
    g_pressCallbacks.erase(id);

    if (!JS_IsFunction(ctx, argv[1])) {
        it->second->onPress = nullptr;
        return JS_UNDEFINED;
    }

    g_pressCallbacks[id] = JS_DupValue(ctx, argv[1]);
    it->second->onPress = [id]() { queuePressCallback(id); };
    return JS_UNDEFINED;
}

static JSValue setStoredCallback(JSContext* ctx, int id, JSValueConst fn, std::map<int, JSValue>& callbacks) {
    auto cit = callbacks.find(id);
    if (cit != callbacks.end()) JS_FreeValue(ctx, cit->second);
    callbacks.erase(id);
    if (JS_IsFunction(ctx, fn)) callbacks[id] = JS_DupValue(ctx, fn);
    return JS_UNDEFINED;
}

JSValue JS_setOnChangeText(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnChangeText: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (g_nodes.find(id) == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnChangeText: invalid node id");
    return setStoredCallback(ctx, id, argv[1], g_changeTextCallbacks);
}

JSValue JS_setOnFocus(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnFocus: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (g_nodes.find(id) == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnFocus: invalid node id");
    return setStoredCallback(ctx, id, argv[1], g_focusCallbacks);
}

JSValue JS_setOnBlur(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnBlur: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (g_nodes.find(id) == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnBlur: invalid node id");
    return setStoredCallback(ctx, id, argv[1], g_blurCallbacks);
}

JSValue JS_setOnSubmitEditing(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnSubmitEditing: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (g_nodes.find(id) == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnSubmitEditing: invalid node id");
    return setStoredCallback(ctx, id, argv[1], g_submitEditingCallbacks);
}

JSValue JS_setOnEndEditing(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnEndEditing: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (g_nodes.find(id) == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnEndEditing: invalid node id");
    return setStoredCallback(ctx, id, argv[1], g_endEditingCallbacks);
}

JSValue JS_setOnSelectionChange(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnSelectionChange: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (g_nodes.find(id) == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnSelectionChange: invalid node id");
    return setStoredCallback(ctx, id, argv[1], g_selectionChangeCallbacks);
}

JSValue JS_setOnChangeValue(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnChangeValue: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (g_nodes.find(id) == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnChangeValue: invalid node id");
    return setStoredCallback(ctx, id, argv[1], g_changeValueCallbacks);
}

JSValue JS_setOnScroll(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnScroll: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnScroll: invalid node id");
    setStoredCallback(ctx, id, argv[1], g_scrollCallbacks);
    if (JS_IsFunction(ctx, argv[1]) && it->second)
        it->second->onScroll = [id]() {
            auto nit = g_nodes.find(id);
            if (nit != g_nodes.end() && nit->second)
                emitScrollEvent(id, nit->second);
        };
    else if (it->second)
        it->second->onScroll = nullptr;
    return JS_UNDEFINED;
}

JSValue JS_setOnRequestClose(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnRequestClose: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnRequestClose: invalid node id");
    setStoredCallback(ctx, id, argv[1], g_requestCloseCallbacks);
    // Core ResolveInput fires this when a scrim/backdrop tap dismisses the
    // overlay (z-order occlusion — no modal special-casing).
    if (JS_IsFunction(ctx, argv[1]) && it->second)
        it->second->onRequestClose = [id]() { queueRequestCloseCallback(id); };
    else if (it->second)
        it->second->onRequestClose = nullptr;
    return JS_UNDEFINED;
}

static void invokeDragCallback(int id, const std::map<int, JSValue>& callbacks, float x, float y) {
    auto it = callbacks.find(id);
    if (it == callbacks.end() || !g_bridge_ctx) return;
    JSValue event = JS_NewObject(g_bridge_ctx);
    JS_SetPropertyStr(g_bridge_ctx, event, "x", JS_NewFloat64(g_bridge_ctx, x));
    JS_SetPropertyStr(g_bridge_ctx, event, "y", JS_NewFloat64(g_bridge_ctx, y));
    JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 1, &event);
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(g_bridge_ctx);
        const char* s = JS_ToCString(g_bridge_ctx, exc);
        fprintf(stderr, "drag callback error: %s\n", s ? s : "(unknown)");
        if (s) JS_FreeCString(g_bridge_ctx, s);
        JS_FreeValue(g_bridge_ctx, exc);
    }
    JS_FreeValue(g_bridge_ctx, result);
    JS_FreeValue(g_bridge_ctx, event);
}

JSValue JS_setOnDragStart(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnDragStart: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnDragStart: invalid node id");
    setStoredCallback(ctx, id, argv[1], g_dragStartCallbacks);
    if (JS_IsFunction(ctx, argv[1]) && it->second)
        it->second->onDragStart = [id](Vector2 pt) {
            invokeDragCallback(id, g_dragStartCallbacks, pt.x, pt.y);
        };
    else if (it->second)
        it->second->onDragStart = nullptr;
    return JS_UNDEFINED;
}

JSValue JS_setOnDragMove(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnDragMove: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnDragMove: invalid node id");
    setStoredCallback(ctx, id, argv[1], g_dragMoveCallbacks);
    if (JS_IsFunction(ctx, argv[1]) && it->second)
        it->second->onDragMove = [id](Vector2 delta) {
            invokeDragCallback(id, g_dragMoveCallbacks, delta.x, delta.y);
        };
    else if (it->second)
        it->second->onDragMove = nullptr;
    return JS_UNDEFINED;
}

JSValue JS_setOnDragEnd(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnDragEnd: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnDragEnd: invalid node id");
    setStoredCallback(ctx, id, argv[1], g_dragEndCallbacks);
    if (JS_IsFunction(ctx, argv[1]) && it->second)
        it->second->onDragEnd = [id](Vector2 delta) {
            invokeDragCallback(id, g_dragEndCallbacks, delta.x, delta.y);
        };
    else if (it->second)
        it->second->onDragEnd = nullptr;
    return JS_UNDEFINED;
}

static void invokeLayoutCallback(int id, const Rectangle& r) {
    auto it = g_layoutCallbacks.find(id);
    if (it == g_layoutCallbacks.end() || !g_bridge_ctx) return;
    JSValue event = JS_NewObject(g_bridge_ctx);
    JSValue nativeEvent = JS_NewObject(g_bridge_ctx);
    JSValue layout = JS_NewObject(g_bridge_ctx);
    JS_SetPropertyStr(g_bridge_ctx, layout, "x", JS_NewFloat64(g_bridge_ctx, r.x));
    JS_SetPropertyStr(g_bridge_ctx, layout, "y", JS_NewFloat64(g_bridge_ctx, r.y));
    JS_SetPropertyStr(g_bridge_ctx, layout, "width", JS_NewFloat64(g_bridge_ctx, r.width));
    JS_SetPropertyStr(g_bridge_ctx, layout, "height", JS_NewFloat64(g_bridge_ctx, r.height));
    JS_SetPropertyStr(g_bridge_ctx, nativeEvent, "layout", layout);
    JS_SetPropertyStr(g_bridge_ctx, event, "nativeEvent", nativeEvent);
    JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 1, &event);
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(g_bridge_ctx);
        const char* s = JS_ToCString(g_bridge_ctx, exc);
        fprintf(stderr, "onLayout error: %s\n", s ? s : "(unknown)");
        if (s) JS_FreeCString(g_bridge_ctx, s);
        JS_FreeValue(g_bridge_ctx, exc);
    }
  // Only free the root event object; nested nativeEvent/layout are owned by it.
    JS_FreeValue(g_bridge_ctx, result);
    JS_FreeValue(g_bridge_ctx, event);
}

JSValue JS_setOnLayout(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnLayout: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnLayout: invalid node id");
    setStoredCallback(ctx, id, argv[1], g_layoutCallbacks);
    if (JS_IsFunction(ctx, argv[1]) && it->second) {
        it->second->reportedLayoutValid = false;
        it->second->onLayout = [id](Rectangle r) { invokeLayoutCallback(id, r); };
    } else if (it->second) {
        it->second->onLayout = nullptr;
    }
    return JS_UNDEFINED;
}

JSValue JS_setStyle(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setStyle: expected (nodeId, styleObj)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setStyle: invalid node id");
    raym3::v2::Style parsed = parseStyle(ctx, argv[1]);
    // Material components carry layout defaults (flexDirection, gap, alignItems,
    // ...) that aren't expressed in CSS. updateNode applies the className via
    // setMaterialComponentProps (which merges those defaults) and *then* calls
    // setStyle with the same CSS — so a plain replace here would wipe the
    // defaults and collapse e.g. the search bar's row into a column. Merge the
    // CSS over the existing style for material nodes; plain views replace.
    raym3::v2::Style target;
    if (g_safeAreaBaseStyles.find(id) != g_safeAreaBaseStyles.end()) {
        g_safeAreaBaseStyles[id] = parsed;
        target = applySafeAreaPadding(parsed);
    } else if (g_nativeControlStates.find(id) != g_nativeControlStates.end()) {
        target = raym3::v2::MergeStyles(it->second->style, parsed);
        enforceNativeControlLayoutDefaults(id, target);
        target.pointerEvents = raym3::v2::PointerEvents::None;
    } else if (jsHasProperty(ctx, argv[1], "className") &&
               g_materialComponentKinds.find(id) == g_materialComponentKinds.end()) {
        // A className change is a new class-derived base. Replacing here clears
        // properties that are no longer present, e.g. bg-indigo-600 -> no bg.
        target = parsed;
    } else {
        // Style-only updates merge so partial animation/layout updates preserve
        // the current class-derived base.
        target = raym3::v2::MergeStyles(it->second->style, parsed);
    }
    // Starts/retargets CSS transitions for properties explicitly set in
    // `parsed` when the target carries a transition spec; plain assignment
    // otherwise.
    raym3::v2::ApplyStyleWithTransitions(it->second, target, parsed);
    if (jsHasProperty(ctx, argv[1], "capturesInput"))
        it->second->capturesInput = jsGetBool(ctx, argv[1], "capturesInput", false);
    captureNodeClassName(ctx, id, argv[1]);
    return JS_UNDEFINED;
}

JSValue JS_setText(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setText: expected (nodeId, text)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setText: invalid node id");

    const char* text = JS_ToCString(ctx, argv[1]);
    if (!text) return JS_ThrowTypeError(ctx, "setText: text must be a string");
    it->second->text = text;
    it->second->preparedTextCache.reset();
    it->second->preparedTextKey.clear();
    JS_FreeCString(ctx, text);
    return JS_UNDEFINED;
}

JSValue JS_setValue(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setValue: expected (nodeId, value)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setValue: invalid node id");
    const char* value = JS_ToCString(ctx, argv[1]);
    if (!value) return JS_ThrowTypeError(ctx, "setValue: value must be a string");
    // While focused, native buffer is authoritative — ignore stale React
    // reconcile props until blur (onChange may not have committed yet).
    if (it->second->kind == raym3::v2::NodeKind::TextInput &&
        raym3::v2::GetFocusedId() == raym3::v2::IdOf(it->second) &&
        it->second->inputScratch != value) {
        JS_FreeCString(ctx, value);
        return JS_UNDEFINED;
    }
    it->second->inputScratch = value;
    if (it->second->inputBuffer.empty()) it->second->inputBuffer.assign(1024, '\0');
    std::fill(it->second->inputBuffer.begin(), it->second->inputBuffer.end(), '\0');
    std::strncpy(it->second->inputBuffer.data(), value, it->second->inputBuffer.size() - 1);
    it->second->textInput.buffer = it->second->inputBuffer.data();
    it->second->textInput.bufferSize = (int)it->second->inputBuffer.size();
    it->second->textInput.value = &it->second->inputScratch;
    JS_FreeCString(ctx, value);
    return JS_UNDEFINED;
}

// Called from Android JNI when the soft keyboard updates the editable state.
void rayactSetTextInputContent(int nodeId, const char* text, int selectionStart,
                               int selectionEnd, int composingStart,
                               int composingEnd) {
    auto it = g_nodes.find(nodeId);
    if (it == g_nodes.end() || !text) return;
    // Flutter's active-client check: IME editing state may only land on the
    // currently focused text input. A stale update racing a focus change is
    // discarded rather than overwriting a non-focused field's value.
    if (it->second->kind == raym3::v2::NodeKind::TextInput &&
        raym3::v2::GetFocusedId() != raym3::v2::IdOf(it->second)) {
        RAYACT_IME_LOG("rayactSetTextInputContent node=%d DROPPED (not focused) text='%s'",
                       nodeId, text);
        return;
    }
    // react-native maxLength: the IME (Android/macOS) sets text through here,
    // bypassing the desktop key path's enforcement, so clamp by codepoint count.
    std::string clamped;
    int maxLen = it->second->textInput.maxLength;
    if (maxLen > 0) {
        int cp = 0;
        const char* p = text;
        while (*p) {
            if (((unsigned char)*p & 0xC0) != 0x80) {
                if (cp == maxLen) break;
                cp++;
            }
            p++;
        }
        if (*p) {
            clamped.assign(text, static_cast<size_t>(p - text));
            text = clamped.c_str();
        }
    }
    it->second->inputScratch = text;
    if (it->second->inputBuffer.empty()) it->second->inputBuffer.assign(1024, '\0');
    std::fill(it->second->inputBuffer.begin(), it->second->inputBuffer.end(), '\0');
    std::strncpy(it->second->inputBuffer.data(), text, it->second->inputBuffer.size() - 1);
    it->second->textInput.buffer = it->second->inputBuffer.data();
    it->second->textInput.bufferSize = (int)it->second->inputBuffer.size();
    it->second->textInput.value = &it->second->inputScratch;
    int len = static_cast<int>(std::strlen(text));
    it->second->textEdit.cursor = (selectionEnd < 0) ? len : std::min(selectionEnd, len);
    it->second->textEdit.selectionStart = selectionStart;
    it->second->textEdit.selectionEnd = selectionEnd;
    it->second->textEdit.composingStart = composingStart;
    it->second->textEdit.composingEnd = composingEnd;
    raym3::v2::ResyncTextInputBuffer(nodeId, it->second->textEdit.cursor);
    auto cbIt = g_changeTextCallbacks.find(nodeId);
    if (cbIt != g_changeTextCallbacks.end() && g_bridge_ctx) {
        JSValue arg = JS_NewString(g_bridge_ctx, text);
        JSValue result = JS_Call(g_bridge_ctx, cbIt->second, JS_UNDEFINED, 1, &arg);
        if (JS_IsException(result)) JS_FreeValue(g_bridge_ctx, JS_GetException(g_bridge_ctx));
        JS_FreeValue(g_bridge_ctx, result);
        JS_FreeValue(g_bridge_ctx, arg);
    }
}

JSValue JS_disposeNode(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "disposeNode: expected (nodeId)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    // Drop any input state (hover/active/focus/pending) pointing at this node
    // BEFORE it is freed — input stores raw Node* as NodeId, so a stale ref is a
    // use-after-free on the next input frame (the crash navigating away from a
    // screen whose touched node gets disposed).
    {
        auto nodeIt = g_nodes.find(id);
        if (nodeIt != g_nodes.end() && nodeIt->second)
            raym3::v2::ForgetInputNode(nodeIt->second.get());
    }
    clearAnimatedNode(ctx, id);
    rayact::shadowTree().disposeNode((uint32_t)id);

    auto evIt = g_externalViews.find(id);
    if (evIt != g_externalViews.end()) {
        if (g_externalViewDisposeCb) g_externalViewDisposeCb(id);
        if (!evIt->second.externalTexture &&
            evIt->second.texture.id != 0 && IsWindowReady())
            UnloadTexture(evIt->second.texture);
        g_externalViews.erase(evIt);
    }

    auto cb = g_pressCallbacks.find(id);
    if (cb != g_pressCallbacks.end()) {
        JS_FreeValue(ctx, cb->second);
        g_pressCallbacks.erase(cb);
    }
    auto changeCb = g_changeTextCallbacks.find(id);
    if (changeCb != g_changeTextCallbacks.end()) {
        JS_FreeValue(ctx, changeCb->second);
        g_changeTextCallbacks.erase(changeCb);
    }
    auto focusCb = g_focusCallbacks.find(id);
    if (focusCb != g_focusCallbacks.end()) {
        JS_FreeValue(ctx, focusCb->second);
        g_focusCallbacks.erase(focusCb);
    }
    auto blurCb = g_blurCallbacks.find(id);
    if (blurCb != g_blurCallbacks.end()) {
        JS_FreeValue(ctx, blurCb->second);
        g_blurCallbacks.erase(blurCb);
    }
    for (auto* m : {&g_submitEditingCallbacks, &g_endEditingCallbacks, &g_selectionChangeCallbacks}) {
        auto cb = m->find(id);
        if (cb != m->end()) { JS_FreeValue(ctx, cb->second); m->erase(cb); }
    }
    auto changeValCb = g_changeValueCallbacks.find(id);
    if (changeValCb != g_changeValueCallbacks.end()) {
        JS_FreeValue(ctx, changeValCb->second);
        g_changeValueCallbacks.erase(changeValCb);
    }
    auto scrollCb = g_scrollCallbacks.find(id);
    if (scrollCb != g_scrollCallbacks.end()) {
        JS_FreeValue(ctx, scrollCb->second);
        g_scrollCallbacks.erase(scrollCb);
    }
    auto closeCb = g_requestCloseCallbacks.find(id);
    if (closeCb != g_requestCloseCallbacks.end()) {
        JS_FreeValue(ctx, closeCb->second);
        g_requestCloseCallbacks.erase(closeCb);
    }
    auto dragStartCb = g_dragStartCallbacks.find(id);
    if (dragStartCb != g_dragStartCallbacks.end()) {
        JS_FreeValue(ctx, dragStartCb->second);
        g_dragStartCallbacks.erase(dragStartCb);
    }
    auto dragMoveCb = g_dragMoveCallbacks.find(id);
    if (dragMoveCb != g_dragMoveCallbacks.end()) {
        JS_FreeValue(ctx, dragMoveCb->second);
        g_dragMoveCallbacks.erase(dragMoveCb);
    }
    auto dragEndCb = g_dragEndCallbacks.find(id);
    if (dragEndCb != g_dragEndCallbacks.end()) {
        JS_FreeValue(ctx, dragEndCb->second);
        g_dragEndCallbacks.erase(dragEndCb);
    }
    auto layoutCb = g_layoutCallbacks.find(id);
    if (layoutCb != g_layoutCallbacks.end()) {
        JS_FreeValue(ctx, layoutCb->second);
        g_layoutCallbacks.erase(layoutCb);
    }
    g_nativeControlStates.erase(id);
    g_materialComponentKinds.erase(id);
    g_safeAreaBaseStyles.erase(id);
    g_scrollViewIds.erase(id);
    g_iconRenderStates.erase(id);
    g_nodeClassNames.erase(id);
    g_nodeParents.erase(id);
    for (auto it = g_nodeParents.begin(); it != g_nodeParents.end();) {
        if (it->second == id) it = g_nodeParents.erase(it);
        else ++it;
    }

    auto it = g_nodes.find(id);
    if (it != g_nodes.end()) {
        if (g_root == it->second) {
            // Dispose of the current screen's root. Mirror the null into
            // g_screens[g_currentScreenId].root (write-through) so the
            // per-screen slot stays consistent with the global mirror.
            writeRootThrough(nullptr);
        }
        g_nodes.erase(it);
    }
    return JS_UNDEFINED;
}

// createIcon(char, size, colorUint, styleObj?)
// Renders a single Unicode character using the system symbol font.
// Use for arrows, gear, checkmarks, etc. that Roboto doesn't cover.
JSValue JS_createIcon(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "createIcon: expected (char, size?, color?, style?)");

    // Parse size first — needed for requireIcon(cp, size) sprite sheet registration.
    float size = 16.0f;
    if (argc >= 2 && !JS_IsUndefined(argv[1])) {
        double d; JS_ToFloat64(ctx, &d, argv[1]); size = (float)d;
    }

    std::string variantStr = "rounded";
    if (argc >= 5 && !JS_IsUndefined(argv[4]) && !JS_IsNull(argv[4])) {
        const char* v = JS_ToCString(ctx, argv[4]);
        if (v) { variantStr = v; JS_FreeCString(ctx, v); }
    }
    // argv[5]: explicit filled bool; default true
    bool filled = true;
    if (argc >= 6 && !JS_IsUndefined(argv[5]) && !JS_IsNull(argv[5])) {
        int b = 0;
        if (JS_ToInt32(ctx, &b, argv[5]) == 0) filled = (b != 0);
    }

    const char* glyph = JS_ToCString(ctx, argv[0]);
    if (!glyph) return JS_ThrowTypeError(ctx, "createIcon: first arg must be string");
    std::string glyphStr(glyph);
    JS_FreeCString(ctx, glyph);

    // Resolved codepoint (0 = raw UTF-8 glyph, no sprite sheet entry needed).
    int resolvedCp = 0;

    // If the string looks like an icon name (all ASCII, no spaces), look it up
    // in the global Icons map loaded from material_icons.js.
    bool looksLikeName = !glyphStr.empty();
    for (unsigned char c : glyphStr) {
        if (c > 127) { looksLikeName = false; break; }
    }
    if (looksLikeName) {
        JSValue globalObj = JS_GetGlobalObject(ctx);
        JSValue iconsMap  = JS_GetPropertyStr(ctx, globalObj, "Icons");
        if (JS_IsObject(iconsMap)) {
            JSValue cpVal = JS_GetPropertyStr(ctx, iconsMap, glyphStr.c_str());
            uint32_t cp = 0;
            if (!JS_IsUndefined(cpVal) && JS_ToUint32(ctx, &cp, cpVal) == 0 && cp > 0) {
                resolvedCp = (int)cp;
                requireIcon(resolvedCp, (int)roundf(size), filled);
                // Convert codepoint to UTF-8
                char utf8[5] = {};
                if (cp < 0x80) {
                    utf8[0] = (char)cp;
                } else if (cp < 0x800) {
                    utf8[0] = (char)(0xC0 | (cp >> 6));
                    utf8[1] = (char)(0x80 | (cp & 0x3F));
                } else if (cp < 0x10000) {
                    utf8[0] = (char)(0xE0 | (cp >> 12));
                    utf8[1] = (char)(0x80 | ((cp >> 6) & 0x3F));
                    utf8[2] = (char)(0x80 | (cp & 0x3F));
                } else {
                    utf8[0] = (char)(0xF0 | (cp >> 18));
                    utf8[1] = (char)(0x80 | ((cp >> 12) & 0x3F));
                    utf8[2] = (char)(0x80 | ((cp >> 6) & 0x3F));
                    utf8[3] = (char)(0x80 | (cp & 0x3F));
                }
                glyphStr = std::string(utf8);
            }
            JS_FreeValue(ctx, cpVal);
        }
        JS_FreeValue(ctx, iconsMap);
        JS_FreeValue(ctx, globalObj);
    }

    // M3 default icon color is onSurfaceVariant (contrasts surface containers),
    // not WHITE — a white default vanishes on the light surfaces most icons sit
    // on (e.g. the search bar). Callers that need a specific color still pass one.
    Color color = raym3::Theme::GetColorScheme().onSurfaceVariant;
    if (argc >= 3 && !JS_IsUndefined(argv[2])) {
        if (auto c = jsToColor(ctx, argv[2])) color = *c;
    }

    raym3::v2::ViewProps props;
    if (argc >= 4) props.style = parseStyle(ctx, argv[3]);

    // Material icons occupy a square slot. Use the requested size for layout
    // instead of font ink bounds so pills and controls center around the icon
    // slot, not around asymmetric glyph metrics. Pin the slot so flex parents
    // (e.g. the bottom nav bar item) can't shrink it below `size` — a squished
    // box makes the fixed-size glyph overflow and look vertically off-center.
    if (!props.style.width)  props.style.width  = size;
    if (!props.style.height) props.style.height = size;
    if (!props.style.minWidth)  props.style.minWidth  = props.style.width;
    if (!props.style.minHeight) props.style.minHeight = props.style.height;
    if (!props.style.flexShrink) props.style.flexShrink = 0.0f;

    int id = nextNativeNodeId();
    g_iconRenderStates[id] = IconRenderState{glyphStr, resolvedCp, size, color, filled, variantStr};

    auto node = raym3::v2::Custom(props, [id](Rectangle layout) {
        auto stateIt = g_iconRenderStates.find(id);
        if (stateIt == g_iconRenderStates.end()) return;
        const IconRenderState& icon = stateIt->second;
        // Prefer sprite sheet (single GPU batch for all icons).
        if (icon.codepoint != 0 && g_iconSheet.id != 0) {
            IconKey key{icon.codepoint, (int)roundf(icon.size), icon.filled};
            auto it = g_iconSheetRects.find(key);
            if (it != g_iconSheetRects.end()) {
                Rectangle src = it->second;
                // Atlas is a normal top-down texture (LoadTextureFromImage), so
                // no vertical flip needed when sampling.
                Rectangle drawSrc = {src.x, src.y, src.width, src.height};
                float drawSize = icon.size;
                Rectangle dest = {layout.x + (layout.width - drawSize) * 0.5f,
                                  layout.y + (layout.height - drawSize) * 0.5f,
                                  drawSize, drawSize};
                DrawTexturePro(g_iconSheet, drawSrc, dest, {0.0f, 0.0f}, 0.0f, icon.color);
                return;
            }
        }
        if (icon.codepoint != 0) {
            raym3::v2::DrawMaterialIcon(icon.codepoint, layout, icon.color,
                                        (int)roundf(icon.size), icon.filled);
        }
    });

    g_nodes[id] = node;
    if (argc >= 2 && JS_IsObject(argv[1])) captureNodeClassName(ctx, id, argv[1]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_setIconProps(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "setIconProps: expected (nodeId, size?, color?, variant?)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto stateIt = g_iconRenderStates.find(id);
    auto nodeIt = g_nodes.find(id);
    if (stateIt == g_iconRenderStates.end() || nodeIt == g_nodes.end()) {
        return JS_ThrowTypeError(ctx, "setIconProps: invalid icon id");
    }

    IconRenderState& icon = stateIt->second;
    if (argc >= 2 && !JS_IsUndefined(argv[1]) && !JS_IsNull(argv[1])) {
        double d = 0.0;
        if (JS_ToFloat64(ctx, &d, argv[1]) == 0 && d > 0.0) {
            icon.size = (float)d;
            if (icon.codepoint != 0) requireIcon(icon.codepoint, (int)roundf(icon.size), icon.filled);
            auto& style = nodeIt->second->style;
            if (!style.width || *style.width <= 0.0f) style.width = icon.size;
            if (!style.height || *style.height <= 0.0f) style.height = icon.size;
            style.minWidth = style.width;
            style.minHeight = style.height;
        }
    }
    if (argc >= 3 && !JS_IsUndefined(argv[2]) && !JS_IsNull(argv[2])) {
        if (auto c = jsToColor(ctx, argv[2])) icon.color = *c;
    }
    if (argc >= 4 && !JS_IsUndefined(argv[3]) && !JS_IsNull(argv[3])) {
        const char* v = JS_ToCString(ctx, argv[3]);
        if (v) { icon.variant = v; JS_FreeCString(ctx, v); }
    }
    if (argc >= 5 && !JS_IsUndefined(argv[4]) && !JS_IsNull(argv[4])) {
        const char* nameStr = JS_ToCString(ctx, argv[4]);
        if (nameStr) {
            std::string nameS(nameStr);
            JS_FreeCString(ctx, nameStr);
            // Resolve name through the Icons global map (same path as createIcon)
            JSValue globalObj = JS_GetGlobalObject(ctx);
            JSValue iconsMap  = JS_GetPropertyStr(ctx, globalObj, "Icons");
            if (JS_IsObject(iconsMap)) {
                JSValue cpVal = JS_GetPropertyStr(ctx, iconsMap, nameS.c_str());
                uint32_t cp = 0;
                if (!JS_IsUndefined(cpVal) && JS_ToUint32(ctx, &cp, cpVal) == 0 && cp > 0) {
                    icon.codepoint = (int)cp;
                    requireIcon(icon.codepoint, (int)roundf(icon.size), icon.filled);
                    char utf8[5] = {};
                    if (cp < 0x80)        { utf8[0] = (char)cp; }
                    else if (cp < 0x800)  { utf8[0]=(char)(0xC0|(cp>>6)); utf8[1]=(char)(0x80|(cp&0x3F)); }
                    else if (cp < 0x10000){ utf8[0]=(char)(0xE0|(cp>>12)); utf8[1]=(char)(0x80|((cp>>6)&0x3F)); utf8[2]=(char)(0x80|(cp&0x3F)); }
                    else                  { utf8[0]=(char)(0xF0|(cp>>18)); utf8[1]=(char)(0x80|((cp>>12)&0x3F)); utf8[2]=(char)(0x80|((cp>>6)&0x3F)); utf8[3]=(char)(0x80|(cp&0x3F)); }
                    icon.glyph = std::string(utf8);
                }
                JS_FreeValue(ctx, cpVal);
            }
            JS_FreeValue(ctx, iconsMap);
            JS_FreeValue(ctx, globalObj);
        }
    }
    // argv[5]: explicit filled bool override
    if (argc >= 6 && !JS_IsUndefined(argv[5]) && !JS_IsNull(argv[5])) {
        int b = 0;
        if (JS_ToInt32(ctx, &b, argv[5]) == 0) {
            bool nextFilled = (b != 0);
            if (icon.filled != nextFilled) {
                icon.filled = nextFilled;
                if (icon.codepoint != 0) requireIcon(icon.codepoint, (int)roundf(icon.size), icon.filled);
            }
        }
    }
    return JS_UNDEFINED;
}

JSValue JS_createImage(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "createImage: expected (src, styleObj?)");

    const char* src = JS_ToCString(ctx, argv[0]);
    if (!src) return JS_ThrowTypeError(ctx, "createImage: src must be a string");

    Texture2D tex = LoadTexture(src);
    JS_FreeCString(ctx, src);

    if (tex.id == 0) {
        fprintf(stderr, "createImage: failed to load texture\n");
        return JS_NULL;
    }
    g_textures.push_back(tex);
    Texture2D capturedTex = tex;

    raym3::v2::ViewProps props;
    if (argc >= 2) props.style = parseStyle(ctx, argv[1]);

    auto node = raym3::v2::Custom(props, [capturedTex](Rectangle layout) {
        // Draw texture scaled to fill the layout rect, centered
        float scaleX = layout.width  / (float)capturedTex.width;
        float scaleY = layout.height / (float)capturedTex.height;
        float scale  = (scaleX > scaleY) ? scaleX : scaleY;
        float drawW  = capturedTex.width  * scale;
        float drawH  = capturedTex.height * scale;
        float drawX  = layout.x + (layout.width  - drawW) * 0.5f;
        float drawY  = layout.y + (layout.height - drawH) * 0.5f;
        DrawTextureEx(capturedTex, {drawX, drawY}, 0.0f, scale, WHITE);
    });

    int id = nextNativeNodeId();
    g_nodes[id] = node;
    if (argc >= 2 && JS_IsObject(argv[1])) captureNodeClassName(ctx, id, argv[1]);
    return JS_NewInt32(ctx, id);
}

// registerFont(name, path)
// Registers a custom font file under a logical name. Use the name in CSS
// font-family or style.text.fontFamily to render text with that font.
// Example: registerFont("Inter", "./resources/fonts/Inter-Regular.ttf")
JSValue JS_registerFont(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "registerFont: expected (name, path)");
    const char* name = JS_ToCString(ctx, argv[0]);
    const char* path = JS_ToCString(ctx, argv[1]);
    if (!name || !path) {
        JS_FreeCString(ctx, name);
        JS_FreeCString(ctx, path);
        return JS_ThrowTypeError(ctx, "registerFont: name and path must be strings");
    }
    raym3::FontManager::RegisterFont(std::string(name), std::string(path));
    JS_FreeCString(ctx, name);
    JS_FreeCString(ctx, path);
    return JS_UNDEFINED;
}

// ─── screen lifecycle (multi-surface navigation) ─────────────────────────

// Node maps, callbacks and the id counter are GLOBAL (shared across screens),
// NOT per-screen. There is one QuickJS context but N React roots (one per
// navigation screen); React 19 commits asynchronously, so a mutation for a
// node on screen A can run while a different screen is "current". If g_nodes
// were swapped per screen (and node ids restarted per screen), that mutation
// would look up the id in the wrong map and fail ("removeChild: invalid parent
// id"), or hit a colliding id on another screen. Keeping the maps global with
// globally-unique ids makes every node op address the right node regardless of
// the current screen. Only the render ROOT (g_root → the tree to draw) is
// genuinely per-screen, so it is the only thing swapped here.
static void SaveCurrentScreen() {
    if (!g_screens.count(g_currentScreenId)) {
        g_screens[g_currentScreenId] = ScreenState{};
    }
    g_screens[g_currentScreenId].root = g_root;
    g_root = nullptr;
}

// Load a screen's render root from g_screens[id] into g_root. Counterpart of
// SaveCurrentScreen; node maps are global so nothing else is swapped.
static void LoadScreen(int id) {
    if (!g_screens.count(id)) {
        g_screens[id] = ScreenState{};
    }
    g_root = g_screens[id].root;
}

// Switch the "current" screen context. All subsequent bridge calls (createView,
// setRootNode, setOnPress, …) write to this screen's state. Call this once
// per React mount: before mounting screen N's tree, call setCurrentScreen(N);
// after mount completes, the engine renders each visible screen in order.
JSValue JS_setCurrentScreen(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "setCurrentScreen: expected (screenId)");
    int id;
    if (JS_ToInt32(ctx, &id, argv[0]) < 0) return JS_ThrowTypeError(ctx, "setCurrentScreen: invalid id");
    if (id < 0) return JS_ThrowTypeError(ctx, "setCurrentScreen: id must be >= 0");
    if (id == g_currentScreenId) return JS_UNDEFINED;  // no-op

    SaveCurrentScreen();
    g_currentScreenId = id;
    LoadScreen(id);
    return JS_UNDEFINED;
}

// ─── host API (Android multi-surface navigation) ────────────────────────
//
// The @rayact/navigation package, on Android, manages a stack of screens.
// Each new route needs its own EGL surface + engine screen. The C++ engine
// owns the engine-screen bookkeeping; the actual EGL surface (and the
// SurfaceView that hosts it) lives in Kotlin (NavigationHost). These two
// functions bridge JS → JNI → Kotlin so the navigator can request/release
// surfaces without knowing the ViewGroup details.
//
// On desktop, the layered backend uses <View> in a single tree, so the
// functions are no-ops (return 0). The JNI implementations live in
// jni_bridge.cpp (Android-only). On desktop we provide weak stubs here.

#if defined(RAYACT_ANDROID) || defined(RAYACT_IOS)
extern "C" {
extern int  rayactJniRequestNewSurface();
extern void rayactJniReleaseSurface(int surfaceId);
extern void rayactJniOrderSurfaces(const int* ids, int count);
extern int  rayactJniGetRootSurfaceId();
extern void rayactJniReleaseTopSurface();
extern void rayactJniExitApp();
extern void rayactJniPushScreen(int surfaceId);
extern int  rayactJniPopScreen();
}
#else
// Desktop builds: weak stubs so the linker is happy. All return 0 / no-op
// — the layered backend doesn't allocate per-route EGL surfaces.
extern "C" {
int  rayactJniRequestNewSurface()       { return 0; }
void rayactJniReleaseSurface(int)        { (void)0; }
void rayactJniOrderSurfaces(const int*, int) { (void)0; }
int  rayactJniGetRootSurfaceId()         { return 0; }
void rayactJniReleaseTopSurface()        { (void)0; }
void rayactJniExitApp()                  { (void)0; }
void rayactJniPushScreen(int)            { (void)0; }
int  rayactJniPopScreen()                { return 0; }
}
#endif

JSValue JS_rayactHostRequestNewSurface(JSContext* ctx, JSValue, int, JSValueConst*) {
    int id = rayactJniRequestNewSurface();
    return JS_NewInt32(ctx, id);
}

JSValue JS_rayactHostReleaseSurface(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "__rayactHostReleaseSurface: expected (id)");
    int id;
    if (JS_ToInt32(ctx, &id, argv[0]) < 0) return JS_ThrowTypeError(ctx, "__rayactHostReleaseSurface: invalid id");
    rayactJniReleaseSurface(id);
    return JS_UNDEFINED;
}

JSValue JS_rayactHostGetRootSurfaceId(JSContext* ctx, JSValue, int, JSValueConst*) {
    int id = rayactJniGetRootSurfaceId();
    return JS_NewInt32(ctx, id);
}

JSValue JS_rayactHostReleaseTopSurface(JSContext* ctx, JSValue, int, JSValueConst*) {
    rayactJniReleaseTopSurface();
    return JS_UNDEFINED;
}

// __rayactHostExitApp: JS-driven Activity finish (BackHandler.exitApp()).
// On Android the JNI side trips a flag and the render thread schedules
// finishActivityFromHost; on desktop this is a no-op stub.
JSValue JS_rayactHostExitApp(JSContext*, JSValue, int, JSValueConst*) {
    rayactJniExitApp();
    return JS_UNDEFINED;
}

// ─── engine stack (z-order) ─────────────────────────────────────────────────
//
// JS-driven control over which screens the engine renders. The navigator's
// per-route SceneView calls into these to trim the stack to the focused +
// previous screen (so a 20-deep stack only draws 2 surfaces per frame).
//
// On desktop the layered backend doesn't use g_screenStack, so these are
// harmless no-ops there.

JSValue JS_rayactEnginePushScreen(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "__rayactEnginePushScreen: expected (id)");
    int id;
    if (JS_ToInt32(ctx, &id, argv[0]) < 0) return JS_ThrowTypeError(ctx, "__rayactEnginePushScreen: invalid id");
    enginePushScreen(id);
    return JS_UNDEFINED;
}

JSValue JS_rayactEnginePopScreen(JSContext* ctx, JSValue, int, JSValueConst*) {
    bool ok = enginePopScreen();
    return JS_NewBool(ctx, ok);
}

JSValue JS_rayactEngineSetScreenStack(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsArray(argv[0])) {
        return JS_ThrowTypeError(ctx, "__rayactEngineSetScreenStack: expected (number[])");
    }
    JSValue arr = argv[0];
    JSValue lenVal = JS_GetPropertyStr(ctx, arr, "length");
    int64_t len = 0;
    JS_ToInt64(ctx, &len, lenVal);
    JS_FreeValue(ctx, lenVal);
    if (len < 0) len = 0;
    if (len > 1024) len = 1024; // safety cap
    std::vector<int> ids;
    ids.reserve((size_t)len);
    for (int64_t i = 0; i < len; i++) {
        JSValue el = JS_GetPropertyUint32(ctx, arr, (uint32_t)i);
        int id = 0;
        if (JS_ToInt32(ctx, &id, el) >= 0) ids.push_back(id);
        JS_FreeValue(ctx, el);
    }
    engineSetScreenStack(ids);
    if (!ids.empty()) rayactJniOrderSurfaces(ids.data(), (int)ids.size());
    return JS_UNDEFINED;
}

int engineCreateScreen() {
    int id = g_nextScreenId++;
    g_screens[id] = ScreenState{};
    return id;
}

int engineGetCurrentScreenId() {
    return g_currentScreenId;
}

void engineDestroyScreen(int id) {
    if (id == 0) return;  // legacy single-screen can't be destroyed
    auto it = g_screens.find(id);
    if (it == g_screens.end()) return;
    if (g_currentScreenId == id) {
        // Fall back to the screen now on top of the stack (the caller pops
        // before destroying), not the non-existent legacy screen 0 — otherwise
        // g_root goes null and the revealed screen renders black.
        SaveCurrentScreen();
        int fallback = engineGetFocusedScreenId();
        if (fallback == id || g_screens.find(fallback) == g_screens.end()) {
            fallback = g_screenStack.empty() ? 0 : g_screenStack.front();
        }
        g_currentScreenId = fallback;
        LoadScreen(fallback);
    }
    if (g_bridge_ctx) {
        for (auto& [k, v] : it->second.pressCallbacks) JS_FreeValue(g_bridge_ctx, v);
        for (auto& [k, v] : it->second.changeTextCallbacks) JS_FreeValue(g_bridge_ctx, v);
        for (auto& [k, v] : it->second.changeValueCallbacks) JS_FreeValue(g_bridge_ctx, v);
        for (auto& [k, v] : it->second.scrollCallbacks) JS_FreeValue(g_bridge_ctx, v);
        for (auto& [k, v] : it->second.requestCloseCallbacks) JS_FreeValue(g_bridge_ctx, v);
    }
    g_screens.erase(it);
}

void engineBindScreenRoot(int id) {
    auto it = g_screens.find(id);
    if (it == g_screens.end()) return;
    if (g_currentScreenId != id) {
        SaveCurrentScreen();
        g_currentScreenId = id;
        LoadScreen(id);
    }
}

const raym3::v2::NodePtr& engineGetScreenRoot(int id) {
    static raym3::v2::NodePtr nullPtr;
    auto it = g_screens.find(id);
    if (it == g_screens.end()) return nullPtr;
    return it->second.root;
}

void engineForEachScreen(const std::function<void(int, const raym3::v2::NodePtr&)>& fn) {
    for (auto& [id, s] : g_screens) {
        if (s.root) fn(id, s.root);
    }
}

int engineGetNextScreenId() { return g_nextScreenId; }

// ─── z-order stack ────────────────────────────────────────────────────────
//
// The host (Android NavigationHost) pushes/pops screens to manage which
// surfaces are visible. The engine render loop iterates the stack bottom→top
// to compose the frame; input dispatch goes only to the focused (top) screen.
//
// Legacy single-screen mode (g_screenStack empty) behaves exactly as before:
// engineBindScreenRoot(0) is the only "bind" call, the legacy globals stay
// the source of truth, and the render loop falls back to g_root.

bool engineHasScreenStack() { return !g_screenStack.empty(); }

int engineGetFocusedScreenId() {
    return g_screenStack.empty() ? g_currentScreenId : g_screenStack.back();
}

void enginePushScreen(int id) {
    if (g_screens.find(id) == g_screens.end()) return;
    // Dedup: don't push twice.
    for (int s : g_screenStack) if (s == id) return;
    g_screenStack.push_back(id);
}

bool enginePopScreen() {
    if (g_screenStack.size() <= 1) return false; // keep at least the root
    g_screenStack.pop_back();
    return true;
}

void engineClearScreenStack() {
    // Reset to just the platform root screen. Desktop uses the legacy screen
    // 0; Android's visible root is the first host-created surface.
    g_screenStack.clear();
    int rootId = rayactJniGetRootSurfaceId();
    if (rootId <= 0) rootId = 0;
    if (g_screens.count(rootId)) g_screenStack.push_back(rootId);
}

// Rebuild the z-order stack to exactly the supplied ids (in z-order,
// bottom→top). Ids that aren't in the existing stack are pushed (only
// if a corresponding engine screen exists). Ids in the existing stack
// that aren't in the target are popped. The platform root is preserved at the
// bottom regardless of the input — desktop uses 0, Android uses the host root
// surface id.
//
// Called from the JS navigator (render thread, under g_engineMutex via
// enginePumpJS), so no further synchronization is needed.
void engineSetScreenStack(const std::vector<int>& ids) {
    // Build a target order: [root, ...ids, root-removed]. Android's root is
    // not screen 0 once the first SurfaceView is created, so ask the host for
    // the concrete id and fall back to desktop's legacy root.
    int rootId = rayactJniGetRootSurfaceId();
    if (rootId <= 0) rootId = 0;

    std::vector<int> target;
    if (g_screens.count(rootId)) target.push_back(rootId);
    for (int id : ids) {
        if (id == rootId) continue;        // already at the bottom
        if (g_screens.find(id) == g_screens.end()) continue;
        // Avoid duplicates within the input itself.
        bool dup = false;
        for (int t : target) { if (t == id) { dup = true; break; } }
        if (!dup) target.push_back(id);
    }

    // Pop anything in the current stack that's not in the target.
    while (!g_screenStack.empty()) {
        int top = g_screenStack.back();
        if (std::find(target.begin(), target.end(), top) == target.end()) {
            g_screenStack.pop_back();
        } else {
            break;
        }
    }
    // Now the top of the current stack (if any) is a prefix of the target.
    // Push the rest of the target in order.
    size_t cur = 0;
    for (int t : target) {
        if (cur < g_screenStack.size() && g_screenStack[cur] == t) {
            cur++;
        } else {
            g_screenStack.push_back(t);
        }
    }
    // Trim any extras beyond target.size() (defensive — should already be done).
    if (g_screenStack.size() > target.size()) {
        g_screenStack.resize(target.size());
    }
}

// Iterate visible screens in z-order (bottom→top). The legacy global g_root
// is bound to each screen before fn() runs, so the render body can use it
// transparently.
//
// The current screen's live tree is held in the global g_root (it has not
// been flushed into g_screens[id] yet — SaveCurrentScreen only runs when
// switching away). Use g_root for it; other screens use their saved root.
// The defensive fallback to g_screens[id].root is a safety net for the
// case where g_root was nulled by a stray clearRootNode without a
// corresponding SaveCurrentScreen (shouldn't happen with the write-through
// from setRootNode, but the fallback keeps a buggy code path from rendering
// nothing).
void engineForEachVisibleScreen(const std::function<void(int, const raym3::v2::NodePtr&)>& fn) {
    if (g_screenStack.empty()) {
        // Legacy single-screen mode: just draw g_root once.
        fn(g_currentScreenId, g_root);
        return;
    }
    for (int id : g_screenStack) {
        if (id == g_currentScreenId) {
            raym3::v2::NodePtr root = g_root;
            if (!root) {
                auto it = g_screens.find(id);
                if (it != g_screens.end()) root = it->second.root;
            }
            if (root) fn(id, root);
            continue;
        }
        auto it = g_screens.find(id);
        if (it == g_screens.end()) continue;
        if (!it->second.root) continue;
        fn(id, it->second.root);
    }
}

// ─── lifecycle ──────────────────────────────────────────────────────────────

static raym3::v2::Node* focusedRaym3TextInputForIme() {
    raym3::v2::NodeId id = raym3::v2::GetFocusedId();
    if (!id) return nullptr;
    auto* node = reinterpret_cast<raym3::v2::Node*>(id);
    if (!node || node->kind != raym3::v2::NodeKind::TextInput) return nullptr;
    return node;
}

static std::string focusedTextValue(raym3::v2::Node& node) {
    if (node.textInput.value) return *node.textInput.value;
    if (node.textInput.buffer) return std::string(node.textInput.buffer);
    if (!node.inputBuffer.empty()) return std::string(node.inputBuffer.data());
    return {};
}

static void focusedTextInputMoveCursor(int delta) {
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return;
    std::string text = focusedTextValue(*node);
    int cursor = std::clamp(node->textEdit.cursor, 0, (int)text.size());
    int target = delta < 0 ? utf8PrevByteLocal(text, cursor)
                           : utf8NextByteLocal(text, cursor);
    raym3::v2::TextInputSetSelection(*node, target, target, target);
    raym3::v2::TextInputNotifyEditingState(*node, false);
}

static void focusedTextInputMoveBoundary(bool toEnd) {
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return;
    std::string text = focusedTextValue(*node);
    int target = toEnd ? (int)text.size() : 0;
    raym3::v2::TextInputSetSelection(*node, target, target, target);
    raym3::v2::TextInputNotifyEditingState(*node, false);
}

static bool focusedTextInputSelectionRange(raym3::v2::Node& node, int& s, int& e) {
    s = node.textEdit.selectionStart;
    e = node.textEdit.selectionEnd;
    if (s < 0 || e < 0 || s == e) return false;
    if (s > e) std::swap(s, e);
    std::string text = focusedTextValue(node);
    s = std::clamp(s, 0, (int)text.size());
    e = std::clamp(e, 0, (int)text.size());
    return s < e;
}

static void focusedTextInputDeleteBackward() {
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return;
    std::string text = focusedTextValue(*node);
    int cursor = std::clamp(node->textEdit.cursor, 0, (int)text.size());
    int s = 0;
    int e = 0;
    if (focusedTextInputSelectionRange(*node, s, e)) {
        raym3::v2::TextInputSetSelection(*node, s, e, s);
        raym3::v2::TextInputReplaceSelection(*node, "");
        return;
    }
    if (cursor <= 0) return;
    int prev = utf8PrevByteLocal(text, cursor);
    raym3::v2::TextInputSetSelection(*node, prev, cursor, prev);
    raym3::v2::TextInputReplaceSelection(*node, "");
}

static void focusedTextInputDeleteForward() {
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return;
    std::string text = focusedTextValue(*node);
    int cursor = std::clamp(node->textEdit.cursor, 0, (int)text.size());
    int s = 0;
    int e = 0;
    if (focusedTextInputSelectionRange(*node, s, e)) {
        raym3::v2::TextInputSetSelection(*node, s, e, s);
        raym3::v2::TextInputReplaceSelection(*node, "");
        return;
    }
    if (cursor >= (int)text.size()) return;
    int next = utf8NextByteLocal(text, cursor);
    raym3::v2::TextInputSetSelection(*node, cursor, next, cursor);
    raym3::v2::TextInputReplaceSelection(*node, "");
}

extern "C" bool rayactMacImeHasFocusedTextInput() {
    return focusedRaym3TextInputForIme() != nullptr;
}

extern "C" void rayactMacImeInsertText(const char* utf8) {
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node || !utf8) return;
    auto& edit = node->textEdit;
    if (edit.composingStart >= 0 && edit.composingEnd >= edit.composingStart) {
        raym3::v2::TextInputSetSelection(*node, edit.composingStart,
                                         edit.composingEnd, edit.composingEnd);
    }
    raym3::v2::TextInputReplaceSelection(*node, utf8);
}

extern "C" void rayactMacImeMoveCursorLeft() {
    focusedTextInputMoveCursor(-1);
}

extern "C" void rayactMacImeMoveCursorRight() {
    focusedTextInputMoveCursor(+1);
}

extern "C" void rayactMacImeMoveCursorHome() {
    focusedTextInputMoveBoundary(false);
}

extern "C" void rayactMacImeMoveCursorEnd() {
    focusedTextInputMoveBoundary(true);
}

extern "C" void rayactMacImeDeleteBackward() {
    focusedTextInputDeleteBackward();
}

extern "C" void rayactMacImeDeleteForward() {
    focusedTextInputDeleteForward();
}

extern "C" void rayactMacImeSelectAll() {
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return;
    std::string text = focusedTextValue(*node);
    raym3::v2::TextInputSetSelection(*node, 0, (int)text.size(), (int)text.size());
    raym3::v2::TextInputNotifyEditingState(*node, false);
}

extern "C" bool rayactMacImeCopySelection(char* buffer, int capacity) {
    if (!buffer || capacity <= 0) return false;
    buffer[0] = '\0';
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return false;
    int s = 0;
    int e = 0;
    if (!focusedTextInputSelectionRange(*node, s, e)) return false;
    std::string text = focusedTextValue(*node);
    std::string selected = text.substr((size_t)s, (size_t)(e - s));
    int n = std::min((int)selected.size(), capacity - 1);
    std::memcpy(buffer, selected.data(), (size_t)n);
    buffer[n] = '\0';
    return n > 0;
}

extern "C" void rayactMacImeDeleteSelection() {
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return;
    int s = 0;
    int e = 0;
    if (!focusedTextInputSelectionRange(*node, s, e)) return;
    raym3::v2::TextInputSetSelection(*node, s, e, s);
    raym3::v2::TextInputReplaceSelection(*node, "");
}

extern "C" void rayactMacImeSetMarkedText(const char* utf8, int selectedLocation,
                                           int selectedLength) {
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node || !utf8) return;
    auto& edit = node->textEdit;
    if (edit.composingStart >= 0 && edit.composingEnd >= edit.composingStart) {
        raym3::v2::TextInputSetSelection(*node, edit.composingStart,
                                         edit.composingEnd, edit.composingEnd);
    }
    std::string marked = utf8;
    raym3::v2::TextInputReplaceSelection(*node, marked, 0, (int)marked.size());
    int composingStart = node->textEdit.composingStart;
    if (composingStart >= 0) {
        int selStart = composingStart + utf16OffsetToUtf8ByteLocal(marked, selectedLocation);
        int selEnd = composingStart + utf16OffsetToUtf8ByteLocal(
                                      marked, selectedLocation + selectedLength);
        raym3::v2::TextInputSetSelection(*node, selStart, selEnd, selEnd);
        node->textEdit.composingStart = composingStart;
        node->textEdit.composingEnd = composingStart + (int)marked.size();
        raym3::v2::TextInputNotifyEditingState(*node, true);
    }
}

extern "C" void rayactMacImeUnmarkText() {
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return;
    node->textEdit.composingStart = node->textEdit.composingEnd = -1;
    raym3::v2::TextInputNotifyEditingState(*node, false);
}

extern "C" void rayactMacImeSelectedRange(int* location, int* length) {
    if (!location || !length) return;
    *location = 0;
    *length = 0;
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return;
    std::string text = focusedTextValue(*node);
    int start = node->textEdit.selectionStart;
    int end = node->textEdit.selectionEnd;
    if (start < 0 || end < 0) start = end = node->textEdit.cursor;
    if (start > end) std::swap(start, end);
    int u16Start = utf8ByteToUtf16OffsetLocal(text, start);
    int u16End = utf8ByteToUtf16OffsetLocal(text, end);
    *location = std::max(0, u16Start);
    *length = std::max(0, u16End - u16Start);
}

extern "C" void rayactMacImeMarkedRange(int* location, int* length) {
    if (!location || !length) return;
    *location = -1;
    *length = 0;
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return;
    int start = node->textEdit.composingStart;
    int end = node->textEdit.composingEnd;
    if (start < 0 || end < start) return;
    std::string text = focusedTextValue(*node);
    int u16Start = utf8ByteToUtf16OffsetLocal(text, start);
    int u16End = utf8ByteToUtf16OffsetLocal(text, end);
    *location = std::max(0, u16Start);
    *length = std::max(0, u16End - u16Start);
}

extern "C" void rayactMacImeCaretRect(float* x, float* y, float* w, float* h) {
    if (!x || !y || !w || !h) return;
    *x = 0.0f; *y = 0.0f; *w = 1.0f; *h = 18.0f;
    raym3::v2::Node* node = focusedRaym3TextInputForIme();
    if (!node) return;
    Rectangle input = raym3::v2::TextInputInputBounds(*node);
    float caretX = raym3::v2::TextInputByteOffsetX(*node, node->textEdit.cursor);
    *x = caretX;
    *y = (float)GetRenderHeight() - input.y - input.height;
    *w = 1.0f;
    *h = input.height;
}

#if defined(RAYACT_ANDROID) || defined(RAYACT_IOS)
struct Raym3RuntimeStorage {
    std::map<int, ScreenState> screens;
    int currentScreenId = 0;
    int nextScreenId = 1;
    int nextNodeId = 1;
    std::vector<int> screenStack;
    std::map<int, raym3::v2::NodePtr> nodes;
    raym3::v2::NodePtr root;
    std::map<int, JSValue> pressCallbacks;
    std::map<int, std::string> nodeClassNames;
    std::map<int, int> nodeParents;
    std::vector<float> animatedStyleBuffer;
    std::set<int> animatedNodes;
    std::unordered_map<int, StyleAnimation> styleAnimations;
    std::map<int, JSValue> changeTextCallbacks;
    std::map<int, JSValue> focusCallbacks;
    std::map<int, JSValue> blurCallbacks;
    std::map<int, JSValue> submitEditingCallbacks;
    std::map<int, JSValue> endEditingCallbacks;
    std::map<int, JSValue> selectionChangeCallbacks;
    std::map<int, JSValue> scrollCallbacks;
    std::map<int, JSValue> requestCloseCallbacks;
    std::map<int, JSValue> dragStartCallbacks;
    std::map<int, JSValue> dragMoveCallbacks;
    std::map<int, JSValue> dragEndCallbacks;
    std::map<int, JSValue> layoutCallbacks;
    std::map<int, NativeControlState> nativeControlStates;
    std::map<int, raym3::v2::M3Component> materialComponentKinds;
    std::set<int> scrollViewIds;
    SafeAreaInsets safeAreaInsets;
    std::map<int, raym3::v2::Style> safeAreaBaseStyles;
    std::map<int, IconRenderState> iconRenderStates;
    std::set<IconKey> iconRequests;
};

static void raym3UnloadGpuCaches() {
    for (auto& tex : g_textures) UnloadTexture(tex);
    g_textures.clear();
    for (auto& [size, font] : g_iconFonts)
        if (font.texture.id != 0) ::UnloadFont(font);
    g_iconFonts.clear();
    g_iconFontVer.clear();
    g_iconCPSet.clear();
    g_iconCPSetVer = 0;
    g_iconSheetRects.clear();
    if (g_iconSheet.id != 0) { UnloadTexture(g_iconSheet); g_iconSheet = {0}; }
}

Raym3RuntimeStorage* raym3BridgeNewRuntimeStorage() {
    return new Raym3RuntimeStorage();
}

void raym3BridgeDeleteRuntimeStorage(Raym3RuntimeStorage* storage) {
    delete storage;
}

void raym3BridgeExportRuntimeStorage(Raym3RuntimeStorage& out) {
    raym3UnloadGpuCaches();
    out.screens = std::move(g_screens);
    out.currentScreenId = g_currentScreenId;
    out.nextScreenId = g_nextScreenId;
    out.nextNodeId = g_nextNodeId;
    out.screenStack = std::move(g_screenStack);
    out.nodes = std::move(g_nodes);
    out.root = std::move(g_root);
    out.pressCallbacks = std::move(g_pressCallbacks);
    out.nodeClassNames = std::move(g_nodeClassNames);
    out.nodeParents = std::move(g_nodeParents);
    out.animatedStyleBuffer = std::move(g_animatedStyleBuffer);
    out.animatedNodes = std::move(g_animatedNodes);
    out.styleAnimations = std::move(g_styleAnimations);
    out.changeTextCallbacks = std::move(g_changeTextCallbacks);
    out.focusCallbacks = std::move(g_focusCallbacks);
    out.blurCallbacks = std::move(g_blurCallbacks);
    out.submitEditingCallbacks = std::move(g_submitEditingCallbacks);
    out.endEditingCallbacks = std::move(g_endEditingCallbacks);
    out.selectionChangeCallbacks = std::move(g_selectionChangeCallbacks);
    out.scrollCallbacks = std::move(g_scrollCallbacks);
    out.requestCloseCallbacks = std::move(g_requestCloseCallbacks);
    out.dragStartCallbacks = std::move(g_dragStartCallbacks);
    out.dragMoveCallbacks = std::move(g_dragMoveCallbacks);
    out.dragEndCallbacks = std::move(g_dragEndCallbacks);
    out.layoutCallbacks = std::move(g_layoutCallbacks);
    out.nativeControlStates = std::move(g_nativeControlStates);
    out.materialComponentKinds = std::move(g_materialComponentKinds);
    out.scrollViewIds = std::move(g_scrollViewIds);
    out.safeAreaInsets = g_safeAreaInsets;
    out.safeAreaBaseStyles = std::move(g_safeAreaBaseStyles);
    out.iconRenderStates = std::move(g_iconRenderStates);
    out.iconRequests = std::move(g_iconRequests);
    raym3BridgeClearRuntimeGlobals();
}

void raym3BridgeImportRuntimeStorage(const Raym3RuntimeStorage& in) {
    raym3BridgeClearRuntimeGlobals();
    g_screens = in.screens;
    g_currentScreenId = in.currentScreenId;
    g_nextScreenId = in.nextScreenId;
    g_nextNodeId = in.nextNodeId;
    g_screenStack = in.screenStack;
    g_nodes = in.nodes;
    g_root = in.root;
    g_pressCallbacks = in.pressCallbacks;
    g_nodeClassNames = in.nodeClassNames;
    g_nodeParents = in.nodeParents;
    if (!in.animatedStyleBuffer.empty()) {
        g_animatedStyleBuffer = in.animatedStyleBuffer;
    } else {
        g_animatedStyleBuffer.assign(
            (size_t)kAnimatedStyleMaxNodes * (size_t)kAnimatedStyleSlots, 0.0f);
    }
    g_animatedNodes = in.animatedNodes;
    g_styleAnimations = in.styleAnimations;
    g_changeTextCallbacks = in.changeTextCallbacks;
    g_focusCallbacks = in.focusCallbacks;
    g_blurCallbacks = in.blurCallbacks;
    g_submitEditingCallbacks = in.submitEditingCallbacks;
    g_endEditingCallbacks = in.endEditingCallbacks;
    g_selectionChangeCallbacks = in.selectionChangeCallbacks;
    g_scrollCallbacks = in.scrollCallbacks;
    g_requestCloseCallbacks = in.requestCloseCallbacks;
    g_dragStartCallbacks = in.dragStartCallbacks;
    g_dragMoveCallbacks = in.dragMoveCallbacks;
    g_dragEndCallbacks = in.dragEndCallbacks;
    g_layoutCallbacks = in.layoutCallbacks;
    g_nativeControlStates = in.nativeControlStates;
    g_materialComponentKinds = in.materialComponentKinds;
    g_scrollViewIds = in.scrollViewIds;
    g_safeAreaInsets = in.safeAreaInsets;
    g_safeAreaBaseStyles = in.safeAreaBaseStyles;
    g_iconRenderStates = in.iconRenderStates;
    g_iconRequests = in.iconRequests;
}

void raym3BridgeClearRuntimeGlobals() {
    g_screens.clear();
    g_currentScreenId = 0;
    g_nextScreenId = 1;
    g_nextNodeId = 1;
    g_screenStack.clear();
    g_nodes.clear();
    g_root = nullptr;
    g_pressCallbacks.clear();
    g_nodeClassNames.clear();
    g_nodeParents.clear();
    g_animatedStyleBuffer.assign(
        (size_t)kAnimatedStyleMaxNodes * (size_t)kAnimatedStyleSlots, 0.0f);
    g_animatedNodes.clear();
    g_styleAnimations.clear();
    g_changeTextCallbacks.clear();
    g_focusCallbacks.clear();
    g_blurCallbacks.clear();
    g_submitEditingCallbacks.clear();
    g_endEditingCallbacks.clear();
    g_selectionChangeCallbacks.clear();
    g_scrollCallbacks.clear();
    g_requestCloseCallbacks.clear();
    g_dragStartCallbacks.clear();
    g_dragMoveCallbacks.clear();
    g_dragEndCallbacks.clear();
    g_layoutCallbacks.clear();
    g_nativeControlStates.clear();
    g_materialComponentKinds.clear();
    g_scrollViewIds.clear();
    g_safeAreaInsets = SafeAreaInsets{};
    g_safeAreaBaseStyles.clear();
    g_iconRenderStates.clear();
    g_iconRequests.clear();
    raym3UnloadGpuCaches();
}
#endif

void cleanupRaym3Bridge(JSContext* ctx, bool unloadGpuCaches) {
    for (auto& [id, anim] : g_styleAnimations) {
        if (!JS_IsUndefined(anim.onComplete)) JS_FreeValue(ctx, anim.onComplete);
    }
    g_styleAnimations.clear();
    g_animatedNodes.clear();
    std::fill(g_animatedStyleBuffer.begin(), g_animatedStyleBuffer.end(), 0.0f);
    // Free all per-screen callback JSValues before clearing the maps.
    for (auto& [id, s] : g_screens) {
        for (auto& [k, v] : s.pressCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.changeTextCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.focusCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.blurCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.submitEditingCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.endEditingCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.selectionChangeCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.changeValueCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.scrollCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.requestCloseCallbacks) JS_FreeValue(ctx, v);
    }
    for (auto& [id, fn] : g_pressCallbacks) JS_FreeValue(ctx, fn);
    g_pressCallbacks.clear();
    for (auto& [id, fn] : g_dragStartCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_dragMoveCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_dragEndCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_layoutCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_changeTextCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_focusCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_blurCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_submitEditingCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_endEditingCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_selectionChangeCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_changeValueCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_scrollCallbacks) JS_FreeValue(ctx, fn);
    for (auto& [id, fn] : g_requestCloseCallbacks) JS_FreeValue(ctx, fn);
    g_dragStartCallbacks.clear();
    g_dragMoveCallbacks.clear();
    g_dragEndCallbacks.clear();
    g_layoutCallbacks.clear();
    g_changeTextCallbacks.clear();
    g_focusCallbacks.clear();
    g_blurCallbacks.clear();
    g_submitEditingCallbacks.clear();
    g_endEditingCallbacks.clear();
    g_selectionChangeCallbacks.clear();
    g_changeValueCallbacks.clear();
    g_scrollCallbacks.clear();
    g_requestCloseCallbacks.clear();
    g_nodes.clear();
    g_nativeControlStates.clear();
    g_materialComponentKinds.clear();
    g_safeAreaBaseStyles.clear();
    g_scrollViewIds.clear();
    g_safeAreaInsets = SafeAreaInsets{};
    g_iconRenderStates.clear();
    g_nodeClassNames.clear();
    g_changeTextCallbacks.clear();
    g_focusCallbacks.clear();
    g_blurCallbacks.clear();
    g_submitEditingCallbacks.clear();
    g_endEditingCallbacks.clear();
    g_selectionChangeCallbacks.clear();
    g_changeValueCallbacks.clear();
    g_scrollCallbacks.clear();
    g_requestCloseCallbacks.clear();
    g_screens.clear();
    g_screenStack.clear();
    g_root = nullptr;
    g_bridge_ctx = nullptr;
    if (unloadGpuCaches) {
        for (auto& tex : g_textures) UnloadTexture(tex);
        g_textures.clear();
        for (auto& [size, font] : g_iconFonts)
            if (font.texture.id != 0) ::UnloadFont(font);
        g_iconFonts.clear();
        g_iconFontVer.clear();
        g_iconCPSet.clear();
        g_iconCPSetVer = 0;
        g_iconRequests.clear();
        g_iconSheetRects.clear();
        if (g_iconSheet.id != 0) { UnloadTexture(g_iconSheet); g_iconSheet = {0}; }
    }
    // else: the GPU caches stay attached to the live graphics device (owned
    // by another engine instance, or already dropped with the device).
}

static const char* nodeKindLabel(raym3::v2::NodeKind kind) {
    switch (kind) {
        case raym3::v2::NodeKind::View: return "View";
        case raym3::v2::NodeKind::Text: return "Text";
        case raym3::v2::NodeKind::TextInput: return "TextInput";
        case raym3::v2::NodeKind::Button: return "Button";
        case raym3::v2::NodeKind::Custom: return "Custom";
        case raym3::v2::NodeKind::Slider: return "Slider";
        case raym3::v2::NodeKind::RangeSlider: return "RangeSlider";
        case raym3::v2::NodeKind::Switch: return "Switch";
        case raym3::v2::NodeKind::Checkbox: return "Checkbox";
        case raym3::v2::NodeKind::RadioButton: return "RadioButton";
        default: return "Node";
    }
}

static void appendNodeTree(std::ostringstream& ss, int id, const raym3::v2::NodePtr& node, bool first) {
    if (!node) return;
    if (!first) ss << ",";
    ss << "{\"id\":" << id
       << ",\"type\":\"" << nodeKindLabel(node->kind) << "\"";
    if (!node->id.empty()) ss << ",\"name\":\"" << node->id << "\"";
    if (!node->text.empty()) ss << ",\"text\":\"" << node->text << "\"";
    ss << ",\"layout\":{\"x\":" << node->layout.x
       << ",\"y\":" << node->layout.y
       << ",\"width\":" << node->layout.width
       << ",\"height\":" << node->layout.height << "}";
    ss << ",\"children\":[";
    bool childFirst = true;
    for (const auto& child : node->children) {
        int childId = nodeIdFor(child);
        if (childId < 0) continue;
        appendNodeTree(ss, childId, child, childFirst);
        childFirst = false;
    }
    ss << "]}";
}

std::string buildNodeTreeJson() {
    std::ostringstream ss;
    ss << "[";
    bool first = true;
    if (g_root) {
        int rootId = nodeIdFor(g_root);
        if (rootId >= 0) appendNodeTree(ss, rootId, g_root, first);
    } else {
        for (const auto& [id, node] : g_nodes) {
            appendNodeTree(ss, id, node, first);
            first = false;
        }
    }
    ss << "]";
    return ss.str();
}

static int g_inspectorHighlightId = -1;

void setInspectorHighlight(int nodeId) {
    g_inspectorHighlightId = nodeId;
}

void drawInspectorHighlight() {
    if (g_inspectorHighlightId < 0) return;
    auto it = g_nodes.find(g_inspectorHighlightId);
    if (it == g_nodes.end() || !it->second) return;
    const Rectangle& r = it->second->layout;
    if (r.width <= 0 || r.height <= 0) return;
    DrawRectangleLinesEx(r, 2.0f, {255, 0, 255, 255});
}

// ─── Reconciler fast path ─────────────────────────────────────────────────────

static bool fastPathIsSharedValue(JSContext* ctx, JSValue val) {
    if (!JS_IsObject(val)) return false;
    JSValue bind = JS_GetPropertyStr(ctx, val, "bindToNode");
    bool isFn = JS_IsFunction(ctx, bind);
    JS_FreeValue(ctx, bind);
    return isFn;
}

static bool fastPathHasEventPropName(const char* key) {
    static const char* kEventProps[] = {
        "onPress", "onClick", "onChangeText", "onValueChange", "onScroll",
        "onRequestClose", "onFocus", "onBlur", "onLayout",
        "onDragStart", "onDragMove", "onDragEnd", nullptr
    };
    for (int i = 0; kEventProps[i]; ++i) {
        if (strcmp(key, kEventProps[i]) == 0) return true;
    }
    return false;
}

static std::optional<float> fastPathParseAngle(JSContext* ctx, JSValue val) {
    if (JS_IsNumber(val)) {
        double d = 0;
        JS_ToFloat64(ctx, &d, val);
        return (float)d;
    }
    if (!JS_IsString(val)) return std::nullopt;
    const char* s = JS_ToCString(ctx, val);
    if (!s) return std::nullopt;
    std::string str(s);
    JS_FreeCString(ctx, s);
    char* end = nullptr;
    float n = strtof(str.c_str(), &end);
    if (end == str.c_str()) return std::nullopt;
    if (str.find("rad") != std::string::npos) return (float)((n * 180.0) / M_PI);
    return n;
}

static bool fastPathFlattenTransformInto(JSContext* ctx, JSValue styleObj, bool isCreate, bool* unsupported) {
    JSValue transform = JS_GetPropertyStr(ctx, styleObj, "transform");
    if (!JS_IsArray(transform)) {
        JS_FreeValue(ctx, transform);
        return false;
    }
    int len = 0;
    JSValue lenVal = JS_GetPropertyStr(ctx, transform, "length");
    JS_ToInt32(ctx, &len, lenVal);
    JS_FreeValue(ctx, lenVal);

    for (int i = 0; i < len; ++i) {
        JSValue entry = JS_GetPropertyUint32(ctx, transform, (uint32_t)i);
        if (!JS_IsObject(entry)) { JS_FreeValue(ctx, entry); continue; }
        JSPropertyEnum* props = nullptr;
        uint32_t propCount = 0;
        if (JS_GetOwnPropertyNames(ctx, &props, &propCount, entry, JS_GPN_STRING_MASK) != 0) {
            JS_FreeValue(ctx, entry);
            continue;
        }
        for (uint32_t pi = 0; pi < propCount; ++pi) {
            const char* key = props[pi].atom ? JS_AtomToCString(ctx, props[pi].atom) : nullptr;
            if (!key) continue;
            JSValue raw = JS_GetProperty(ctx, entry, props[pi].atom);
            if (strcmp(key, "translateX") == 0 || strcmp(key, "translateY") == 0 || strcmp(key, "scale") == 0) {
                if (fastPathIsSharedValue(ctx, raw)) {
                    if (isCreate) {
                        JSValue sv = JS_GetPropertyStr(ctx, raw, "value");
                        JS_SetPropertyStr(ctx, styleObj, key, sv);
                        JS_FreeValue(ctx, sv);
                    } else if (unsupported) {
                        *unsupported = true;
                    }
                } else if (JS_IsNumber(raw)) {
                    if (isCreate) JS_SetPropertyStr(ctx, styleObj, key, JS_DupValue(ctx, raw));
                }
            } else if (strcmp(key, "rotate") == 0 || strcmp(key, "rotation") == 0) {
                if (fastPathIsSharedValue(ctx, raw)) {
                    if (isCreate) {
                        JSValue sv = JS_GetPropertyStr(ctx, raw, "value");
                        auto deg = fastPathParseAngle(ctx, sv);
                        JS_FreeValue(ctx, sv);
                        if (deg) JS_SetPropertyStr(ctx, styleObj, "rotation", JS_NewFloat64(ctx, *deg));
                    } else if (unsupported) {
                        *unsupported = true;
                    }
                } else {
                    auto deg = fastPathParseAngle(ctx, raw);
                    if (deg && isCreate) JS_SetPropertyStr(ctx, styleObj, "rotation", JS_NewFloat64(ctx, *deg));
                    else if (deg && !isCreate && unsupported) *unsupported = true;
                }
            }
            JS_FreeValue(ctx, raw);
            JS_FreeCString(ctx, key);
        }
        js_free(ctx, props);
        JS_FreeValue(ctx, entry);
    }
    JSAtom transformAtom = JS_NewAtom(ctx, "transform");
    JS_DeleteProperty(ctx, styleObj, transformAtom, 0);
    JS_FreeAtom(ctx, transformAtom);
    JS_FreeValue(ctx, transform);
    return true;
}

static void fastPathMergeStyleInto(JSContext* ctx, JSValue dest, JSValue src, bool isCreate, bool* unsupported) {
    if (JS_IsArray(src)) {
        int len = 0;
        JSValue lenVal = JS_GetPropertyStr(ctx, src, "length");
        JS_ToInt32(ctx, &len, lenVal);
        JS_FreeValue(ctx, lenVal);
        for (int i = 0; i < len; ++i) {
            JSValue item = JS_GetPropertyUint32(ctx, src, (uint32_t)i);
            fastPathMergeStyleInto(ctx, dest, item, isCreate, unsupported);
            JS_FreeValue(ctx, item);
        }
        return;
    }
    if (!JS_IsObject(src)) return;

    JSPropertyEnum* props = nullptr;
    uint32_t propCount = 0;
    if (JS_GetOwnPropertyNames(ctx, &props, &propCount, src, JS_GPN_STRING_MASK) != 0) return;

    for (uint32_t i = 0; i < propCount; ++i) {
        const char* key = props[i].atom ? JS_AtomToCString(ctx, props[i].atom) : nullptr;
        if (!key) continue;
        JSValue value = JS_GetProperty(ctx, src, props[i].atom);
        if (JS_IsNull(value) || JS_IsUndefined(value)) {
            JS_FreeValue(ctx, value);
            JS_FreeCString(ctx, key);
            continue;
        }
        if (strcmp(key, "transform") == 0) {
            JS_SetPropertyStr(ctx, dest, key, JS_DupValue(ctx, value));
        } else if (fastPathIsSharedValue(ctx, value)) {
            if (isCreate) {
                JSValue sv = JS_GetPropertyStr(ctx, value, "value");
                JS_SetPropertyStr(ctx, dest, key, sv);
            } else if (unsupported) {
                *unsupported = true;
            }
        } else if (strcmp(key, "translateX") == 0 || strcmp(key, "translateY") == 0 ||
                   strcmp(key, "scale") == 0 || strcmp(key, "opacity") == 0 ||
                   strcmp(key, "rotation") == 0) {
            if (isCreate) {
                JS_SetPropertyStr(ctx, dest, key, JS_DupValue(ctx, value));
            } else if (JS_IsNumber(value)) {
                if (unsupported) *unsupported = true;
            }
        } else {
            JS_SetPropertyStr(ctx, dest, key, JS_DupValue(ctx, value));
        }
        JS_FreeValue(ctx, value);
        JS_FreeCString(ctx, key);
    }
    js_free(ctx, props);
}

static JSValue fastPathBuildStyleProps(JSContext* ctx, JSValue props, bool isCreate, bool* unsupported) {
    JSValue styleObj = JS_NewObject(ctx);
    JSValue styleVal = JS_GetPropertyStr(ctx, props, "style");
    if (!JS_IsUndefined(styleVal) && !JS_IsNull(styleVal)) {
        fastPathMergeStyleInto(ctx, styleObj, styleVal, isCreate, unsupported);
    }
    JS_FreeValue(ctx, styleVal);
    fastPathFlattenTransformInto(ctx, styleObj, isCreate, unsupported);

    JSValue className = JS_GetPropertyStr(ctx, props, "className");
    if (!JS_IsUndefined(className) && !JS_IsNull(className)) {
        JS_SetPropertyStr(ctx, styleObj, "className", JS_DupValue(ctx, className));
    }
    JS_FreeValue(ctx, className);
    return styleObj;
}

static std::string fastPathGetPropString(JSContext* ctx, JSValue props, const char* key) {
    JSValue val = JS_GetPropertyStr(ctx, props, key);
    std::string out;
    if (!JS_IsUndefined(val) && !JS_IsNull(val)) {
        const char* s = JS_ToCString(ctx, val);
        if (s) { out = s; JS_FreeCString(ctx, s); }
    }
    JS_FreeValue(ctx, val);
    return out;
}

static JSValue fastPathBuildMergedProps(JSContext* ctx, JSValue props, const char* componentType, bool isCreate, bool* unsupported) {
    JSValue merged = fastPathBuildStyleProps(ctx, props, isCreate, unsupported);
    JSPropertyEnum* enumProps = nullptr;
    uint32_t propCount = 0;
    if (JS_GetOwnPropertyNames(ctx, &enumProps, &propCount, props, JS_GPN_STRING_MASK) == 0) {
        for (uint32_t i = 0; i < propCount; ++i) {
            const char* key = enumProps[i].atom ? JS_AtomToCString(ctx, enumProps[i].atom) : nullptr;
            if (!key || strcmp(key, "style") == 0) {
                if (key) JS_FreeCString(ctx, key);
                continue;
            }
            if (JS_IsFunction(ctx, JS_GetProperty(ctx, props, enumProps[i].atom))) {
                if (key) JS_FreeCString(ctx, key);
                continue;
            }
            JSValue value = JS_GetProperty(ctx, props, enumProps[i].atom);
            JS_SetPropertyStr(ctx, merged, key, JS_DupValue(ctx, value));
            JS_FreeValue(ctx, value);
            if (key) JS_FreeCString(ctx, key);
        }
        js_free(ctx, enumProps);
    }
    JS_SetPropertyStr(ctx, merged, "component", JS_NewString(ctx, componentType));
    std::string label = fastPathGetPropString(ctx, props, "label");
    if (label.empty()) label = fastPathGetPropString(ctx, props, "text");
    if (label.empty()) label = fastPathGetPropString(ctx, props, "title");
    if (label.empty()) {
        JSValue children = JS_GetPropertyStr(ctx, props, "children");
        if (JS_IsString(children) || JS_IsNumber(children)) {
            const char* s = JS_ToCString(ctx, children);
            if (s) { label = s; JS_FreeCString(ctx, s); }
        }
        JS_FreeValue(ctx, children);
    }
    if (!label.empty()) JS_SetPropertyStr(ctx, merged, "label", JS_NewString(ctx, label.c_str()));
    return merged;
}

static bool fastPathPropsEqualSemantic(JSContext* ctx, JSValue a, JSValue b) {
    if (JS_IsStrictEqual(ctx, a, b)) return true;
    if (JS_IsNull(a) || JS_IsUndefined(a)) return JS_IsNull(b) || JS_IsUndefined(b);
    if (JS_IsNull(b) || JS_IsUndefined(b)) return false;
    if (JS_IsNumber(a) && JS_IsNumber(b)) {
        double da = 0, db = 0;
        JS_ToFloat64(ctx, &da, a);
        JS_ToFloat64(ctx, &db, b);
        return da == db;
    }
    if (JS_IsString(a) && JS_IsString(b)) {
        const char* sa = JS_ToCString(ctx, a);
        const char* sb = JS_ToCString(ctx, b);
        bool eq = sa && sb && strcmp(sa, sb) == 0;
        if (sa) JS_FreeCString(ctx, sa);
        if (sb) JS_FreeCString(ctx, sb);
        return eq;
    }
    if (JS_IsBool(a) && JS_IsBool(b)) return JS_ToBool(ctx, a) == JS_ToBool(ctx, b);
    if (JS_IsArray(a) || JS_IsArray(b)) {
        if (!JS_IsArray(a) || !JS_IsArray(b)) return false;
        int la = 0, lb = 0;
        JSValue lva = JS_GetPropertyStr(ctx, a, "length");
        JSValue lvb = JS_GetPropertyStr(ctx, b, "length");
        JS_ToInt32(ctx, &la, lva);
        JS_ToInt32(ctx, &lb, lvb);
        JS_FreeValue(ctx, lva);
        JS_FreeValue(ctx, lvb);
        if (la != lb) return false;
        for (int i = 0; i < la; ++i) {
            JSValue ia = JS_GetPropertyUint32(ctx, a, (uint32_t)i);
            JSValue ib = JS_GetPropertyUint32(ctx, b, (uint32_t)i);
            bool eq = fastPathPropsEqualSemantic(ctx, ia, ib);
            JS_FreeValue(ctx, ia);
            JS_FreeValue(ctx, ib);
            if (!eq) return false;
        }
        return true;
    }
    if (!JS_IsObject(a) || !JS_IsObject(b)) return false;
    if (JS_IsFunction(ctx, a) || JS_IsFunction(ctx, b)) return false;

    JSPropertyEnum* props = nullptr;
    uint32_t propCount = 0;
    if (JS_GetOwnPropertyNames(ctx, &props, &propCount, a, JS_GPN_STRING_MASK) != 0) return false;
    for (uint32_t i = 0; i < propCount; ++i) {
        const char* key = props[i].atom ? JS_AtomToCString(ctx, props[i].atom) : nullptr;
        if (!key) continue;
        JSValue av = JS_GetProperty(ctx, a, props[i].atom);
        JSValue bv = JS_GetPropertyStr(ctx, b, key);
        if (JS_IsUndefined(av) || JS_IsNull(av)) {
            JS_FreeValue(ctx, av);
            JS_FreeValue(ctx, bv);
            JS_FreeCString(ctx, key);
            continue;
        }
        bool eq = fastPathPropsEqualSemantic(ctx, av, bv);
        JS_FreeValue(ctx, av);
        JS_FreeValue(ctx, bv);
        JS_FreeCString(ctx, key);
        if (!eq) { js_free(ctx, props); return false; }
    }
    js_free(ctx, props);
    return true;
}

static bool fastPathIsMaterialType(const std::string& type) {
    return materialComponentFromString(type).has_value();
}

static void batchAppendChildTolerant(int parentId, int childId) {
    auto pit = g_nodes.find(parentId);
    auto cit = g_nodes.find(childId);
    if (pit == g_nodes.end() || cit == g_nodes.end()) {
        RAYACT_NAV_LOG("batch appendChild stale id: parent=%d child=%d screen=%d",
                       parentId, childId, g_currentScreenId);
        return;
    }
    detachFromCurrentParent(childId, cit->second);
    appendChildPreservingNavLabel(pit->second, cit->second);
    g_nodeParents[childId] = parentId;
    rayact::shadowTree().appendChild((uint32_t)parentId, (uint32_t)childId);
}

static void batchRemoveChildTolerant(int parentId, int childId) {
    auto pit = g_nodes.find(parentId);
    auto cit = g_nodes.find(childId);
    if (pit == g_nodes.end() || cit == g_nodes.end()) {
        RAYACT_NAV_LOG("batch removeChild stale id: parent=%d child=%d screen=%d",
                       parentId, childId, g_currentScreenId);
        if (cit != g_nodes.end()) g_nodeParents.erase(childId);
        return;
    }
    auto& children = pit->second->children;
    children.erase(std::remove(children.begin(), children.end(), cit->second), children.end());
    g_nodeParents.erase(childId);
    rayact::shadowTree().removeChild((uint32_t)parentId, (uint32_t)childId);
}

static void batchInsertBeforeTolerant(int parentId, int childId, int beforeChildId) {
    auto pit = g_nodes.find(parentId);
    auto cit = g_nodes.find(childId);
    if (pit == g_nodes.end() || cit == g_nodes.end()) {
        RAYACT_NAV_LOG("batch insertBefore stale id: parent=%d child=%d screen=%d",
                       parentId, childId, g_currentScreenId);
        return;
    }
    auto bit = g_nodes.find(beforeChildId);
    if (bit == g_nodes.end()) {
        batchAppendChildTolerant(parentId, childId);
        return;
    }
    detachFromCurrentParent(childId, cit->second);
    auto& children = pit->second->children;
    auto insertIt = std::find(children.begin(), children.end(), bit->second);
    if (insertIt == children.end()) {
        children.push_back(cit->second);
    } else {
        children.insert(insertIt, cit->second);
    }
    g_nodeParents[childId] = parentId;
    rayact::shadowTree().appendChild((uint32_t)parentId, (uint32_t)childId);
}

static void batchDisposeNodeTolerant(int nodeId) {
    JSValueConst argv[1];
    argv[0] = JS_NewInt32(g_bridge_ctx, nodeId);
    JS_disposeNode(g_bridge_ctx, JS_UNDEFINED, 1, argv);
    JS_FreeValue(g_bridge_ctx, argv[0]);
}

static void batchSetRootTolerant(int nodeId) {
    JSValueConst argv[1];
    argv[0] = JS_NewInt32(g_bridge_ctx, nodeId);
    JS_setRootNode(g_bridge_ctx, JS_UNDEFINED, 1, argv);
    JS_FreeValue(g_bridge_ctx, argv[0]);
}

JSValue JS_rayactCreateNodeFast(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "__rayactCreateNodeFast: expected (type, props)");
    const char* typeC = JS_ToCString(ctx, argv[0]);
    if (!typeC) return JS_ThrowTypeError(ctx, "__rayactCreateNodeFast: invalid type");
    std::string type(typeC);
    JS_FreeCString(ctx, typeC);
    if (!JS_IsObject(argv[1])) return JS_ThrowTypeError(ctx, "__rayactCreateNodeFast: props must be object");

    bool unsupported = false;
    JSValue styleObj = fastPathBuildStyleProps(ctx, argv[1], true, &unsupported);
    if (unsupported) {
        JS_FreeValue(ctx, styleObj);
        return JS_ThrowTypeError(ctx, "__rayactCreateNodeFast: unsupported animated props on create");
    }

    JSValue result = JS_EXCEPTION;
    if (type == "view" || type == "root") {
        if (jsHasProperty(ctx, argv[1], "appBarTitle")) {
            JS_SetPropertyStr(ctx, styleObj, "appBarTitle", JS_NewBool(ctx, jsGetBool(ctx, argv[1], "appBarTitle", false)));
        }
        JSValue args[] = { styleObj };
        result = JS_createView(ctx, JS_UNDEFINED, 1, args);
    } else if (type == "text") {
        std::string text = fastPathGetPropString(ctx, argv[1], "text");
        if (text.empty()) text = fastPathGetPropString(ctx, argv[1], "children");
        JSValue args[] = { JS_NewString(ctx, text.c_str()), styleObj };
        result = JS_createText(ctx, JS_UNDEFINED, 2, args);
        JS_FreeValue(ctx, args[0]);
    } else if (type == "button") {
        std::string label = fastPathGetPropString(ctx, argv[1], "label");
        if (label.empty()) label = fastPathGetPropString(ctx, argv[1], "text");
        if (label.empty()) label = fastPathGetPropString(ctx, argv[1], "children");
        JSValue args[] = { JS_NewString(ctx, label.c_str()), styleObj };
        result = JS_createButton(ctx, JS_UNDEFINED, 2, args);
        JS_FreeValue(ctx, args[0]);
    } else if (type == "image") {
        std::string src = fastPathGetPropString(ctx, argv[1], "source");
        if (src.empty()) src = fastPathGetPropString(ctx, argv[1], "src");
        JSValue args[] = { JS_NewString(ctx, src.c_str()), styleObj };
        result = JS_createImage(ctx, JS_UNDEFINED, 2, args);
        JS_FreeValue(ctx, args[0]);
    } else if (type == "icon") {
        std::string name = fastPathGetPropString(ctx, argv[1], "name");
        if (name.empty()) name = fastPathGetPropString(ctx, argv[1], "icon");
        JSValue args[6];
        args[0] = JS_NewString(ctx, name.c_str());
        JSValue sizeVal = JS_GetPropertyStr(ctx, argv[1], "size");
        args[1] = JS_IsNumber(sizeVal) ? JS_DupValue(ctx, sizeVal) : JS_UNDEFINED;
        JS_FreeValue(ctx, sizeVal);
        JSValue colorVal = JS_GetPropertyStr(ctx, argv[1], "color");
        args[2] = (!JS_IsUndefined(colorVal) && !JS_IsNull(colorVal)) ? JS_DupValue(ctx, colorVal) : JS_UNDEFINED;
        JS_FreeValue(ctx, colorVal);
        args[3] = styleObj;
        JSValue variantVal = JS_GetPropertyStr(ctx, argv[1], "variant");
        args[4] = JS_IsString(variantVal) ? JS_DupValue(ctx, variantVal) : JS_UNDEFINED;
        JS_FreeValue(ctx, variantVal);
        JSValue filledVal = JS_GetPropertyStr(ctx, argv[1], "filled");
        args[5] = JS_IsBool(filledVal) ? JS_DupValue(ctx, filledVal) : JS_UNDEFINED;
        JS_FreeValue(ctx, filledVal);
        result = JS_createIcon(ctx, JS_UNDEFINED, 6, args);
        JS_FreeValue(ctx, args[0]);
        if (!JS_IsUndefined(args[1])) JS_FreeValue(ctx, args[1]);
        if (!JS_IsUndefined(args[2])) JS_FreeValue(ctx, args[2]);
        if (!JS_IsUndefined(args[4])) JS_FreeValue(ctx, args[4]);
        if (!JS_IsUndefined(args[5])) JS_FreeValue(ctx, args[5]);
    } else if (type == "textInput") {
        std::string value = fastPathGetPropString(ctx, argv[1], "value");
        if (value.empty()) value = fastPathGetPropString(ctx, argv[1], "defaultValue");
        JSValue merged = fastPathBuildMergedProps(ctx, argv[1], type.c_str(), true, &unsupported);
        JSValue args[] = { JS_NewString(ctx, value.c_str()), merged };
        result = JS_createTextInput(ctx, JS_UNDEFINED, 2, args);
        JS_FreeValue(ctx, args[0]);
        JS_FreeValue(ctx, merged);
    } else if (type == "scrollView" || type == "modal" || type == "safeArea" ||
               type == "statusBar" || type == "activityIndicator") {
        JSValue merged = fastPathBuildMergedProps(ctx, argv[1], type.c_str(), true, &unsupported);
        JSValue args[] = { merged };
        if (type == "scrollView") result = JS_createScrollView(ctx, JS_UNDEFINED, 1, args);
        else if (type == "modal") result = JS_createModal(ctx, JS_UNDEFINED, 1, args);
        else if (type == "safeArea") result = JS_createSafeArea(ctx, JS_UNDEFINED, 1, args);
        else if (type == "statusBar") result = JS_createStatusBar(ctx, JS_UNDEFINED, 1, args);
        else result = JS_createActivityIndicator(ctx, JS_UNDEFINED, 1, args);
        JS_FreeValue(ctx, merged);
    } else if (type == "externalView") {
        std::string kind = fastPathGetPropString(ctx, argv[1], "kind");
        if (kind.empty()) kind = "stub";
        JSValue merged = fastPathBuildMergedProps(ctx, argv[1], type.c_str(), true, &unsupported);
        JSValue args[] = { JS_NewString(ctx, kind.c_str()), merged };
        result = JS_createExternalView(ctx, JS_UNDEFINED, 2, args);
        JS_FreeValue(ctx, args[0]);
        JS_FreeValue(ctx, merged);
    } else if (fastPathIsMaterialType(type)) {
        JSValue merged = fastPathBuildMergedProps(ctx, argv[1], type.c_str(), true, &unsupported);
        JSValue args[] = { JS_NewString(ctx, type.c_str()), merged };
        result = JS_createMaterialComponent(ctx, JS_UNDEFINED, 2, args);
        JS_FreeValue(ctx, args[0]);
        JS_FreeValue(ctx, merged);
    } else {
        JS_FreeValue(ctx, styleObj);
        return JS_ThrowTypeError(ctx, "__rayactCreateNodeFast: unsupported type");
    }

    JS_FreeValue(ctx, styleObj);
    return result;
}

JSValue JS_rayactUpdateNodeFast(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 4) return JS_ThrowTypeError(ctx, "__rayactUpdateNodeFast: expected (nodeId, type, oldProps, newProps)");
    int nodeId = 0;
    JS_ToInt32(ctx, &nodeId, argv[0]);
    if (g_nodes.find(nodeId) == g_nodes.end()) return JS_FALSE;

    const char* typeC = JS_ToCString(ctx, argv[1]);
    if (!typeC) return JS_FALSE;
    std::string type(typeC);
    JS_FreeCString(ctx, typeC);

    if (!JS_IsObject(argv[2]) || !JS_IsObject(argv[3])) return JS_FALSE;

    bool unsupported = false;
    bool styleChanged = false;
    bool textChanged = false;
    bool valueChanged = false;
    bool iconChanged = false;
    bool materialChanged = false;

    JSPropertyEnum* props = nullptr;
    uint32_t propCount = 0;
    if (JS_GetOwnPropertyNames(ctx, &props, &propCount, argv[3], JS_GPN_STRING_MASK) != 0) return JS_FALSE;

    for (uint32_t i = 0; i < propCount; ++i) {
        const char* key = props[i].atom ? JS_AtomToCString(ctx, props[i].atom) : nullptr;
        if (!key) continue;
        if (strcmp(key, "children") == 0 || fastPathHasEventPropName(key)) {
            JS_FreeCString(ctx, key);
            continue;
        }
        JSValue oldVal = JS_GetProperty(ctx, argv[2], props[i].atom);
        JSValue newVal = JS_GetProperty(ctx, argv[3], props[i].atom);
        if (JS_IsFunction(ctx, newVal) || JS_IsFunction(ctx, oldVal)) {
            unsupported = true;
            JS_FreeValue(ctx, oldVal);
            JS_FreeValue(ctx, newVal);
            JS_FreeCString(ctx, key);
            break;
        }
        if (strcmp(key, "style") == 0) {
            if (!fastPathPropsEqualSemantic(ctx, oldVal, newVal)) styleChanged = true;
        } else if (type == "externalView") {
            unsupported = true;
        } else if (strcmp(key, "className") == 0) {
            if (!fastPathPropsEqualSemantic(ctx, oldVal, newVal)) styleChanged = true;
        } else if (!fastPathPropsEqualSemantic(ctx, oldVal, newVal)) {
            if (type == "text" || type == "button") {
                if (strcmp(key, "text") == 0 || strcmp(key, "label") == 0 ||
                    strcmp(key, "title") == 0 || strcmp(key, "children") == 0) {
                    textChanged = true;
                }
            } else if (type == "textInput" && strcmp(key, "value") == 0) {
                valueChanged = true;
            } else if (type == "icon" && (strcmp(key, "name") == 0 || strcmp(key, "icon") == 0 ||
                       strcmp(key, "size") == 0 || strcmp(key, "color") == 0 ||
                       strcmp(key, "variant") == 0 || strcmp(key, "filled") == 0)) {
                iconChanged = true;
            } else if (fastPathIsMaterialType(type)) {
                materialChanged = true;
            } else if (strcmp(key, "style") != 0) {
                unsupported = true;
            }
        }
        JS_FreeValue(ctx, oldVal);
        JS_FreeValue(ctx, newVal);
        JS_FreeCString(ctx, key);
    }
    js_free(ctx, props);

    if (unsupported) return JS_FALSE;
    if (!styleChanged && !textChanged && !valueChanged && !iconChanged && !materialChanged) {
        return JS_TRUE;
    }

    if (styleChanged) {
        bool styleUnsupported = false;
        JSValue styleObj = fastPathBuildStyleProps(ctx, argv[3], false, &styleUnsupported);
        if (styleUnsupported) {
            JS_FreeValue(ctx, styleObj);
            return JS_FALSE;
        }
        JSValue args[] = { JS_NewInt32(ctx, nodeId), styleObj };
        JS_setStyle(ctx, JS_UNDEFINED, 2, args);
        JS_FreeValue(ctx, args[0]);
        JS_FreeValue(ctx, styleObj);
    }

    if (textChanged) {
        std::string text = fastPathGetPropString(ctx, argv[3], "text");
        if (text.empty()) text = fastPathGetPropString(ctx, argv[3], "label");
        if (text.empty()) text = fastPathGetPropString(ctx, argv[3], "title");
        if (text.empty()) text = fastPathGetPropString(ctx, argv[3], "children");
        JSValue args[] = { JS_NewInt32(ctx, nodeId), JS_NewString(ctx, text.c_str()) };
        JS_setText(ctx, JS_UNDEFINED, 2, args);
        JS_FreeValue(ctx, args[0]);
        JS_FreeValue(ctx, args[1]);
    }

    if (valueChanged) {
        std::string value = fastPathGetPropString(ctx, argv[3], "value");
        JSValue args[] = { JS_NewInt32(ctx, nodeId), JS_NewString(ctx, value.c_str()) };
        JS_setValue(ctx, JS_UNDEFINED, 2, args);
        JS_FreeValue(ctx, args[0]);
        JS_FreeValue(ctx, args[1]);
    }

    if (iconChanged) {
        JSValue args[6];
        args[0] = JS_NewInt32(ctx, nodeId);
        JSValue sizeVal = JS_GetPropertyStr(ctx, argv[3], "size");
        args[1] = JS_IsNumber(sizeVal) ? JS_DupValue(ctx, sizeVal) : JS_UNDEFINED;
        JS_FreeValue(ctx, sizeVal);
        JSValue colorVal = JS_GetPropertyStr(ctx, argv[3], "color");
        args[2] = (!JS_IsUndefined(colorVal) && !JS_IsNull(colorVal)) ? JS_DupValue(ctx, colorVal) : JS_UNDEFINED;
        JS_FreeValue(ctx, colorVal);
        args[3] = JS_UNDEFINED;
        JSValue variantVal = JS_GetPropertyStr(ctx, argv[3], "variant");
        args[4] = JS_IsString(variantVal) ? JS_DupValue(ctx, variantVal) : JS_UNDEFINED;
        JS_FreeValue(ctx, variantVal);
        std::string name = fastPathGetPropString(ctx, argv[3], "name");
        if (name.empty()) name = fastPathGetPropString(ctx, argv[3], "icon");
        args[5] = name.empty() ? JS_UNDEFINED : JS_NewString(ctx, name.c_str());
        JSValue filledVal = JS_GetPropertyStr(ctx, argv[3], "filled");
        // setIconProps signature: (nodeId, size?, color?, variant?, name?, filled?)
        JSValue iconArgs[6] = {
            args[0],
            args[1],
            args[2],
            args[4],
            args[5],
            JS_IsBool(filledVal) ? JS_DupValue(ctx, filledVal) : JS_UNDEFINED,
        };
        JS_FreeValue(ctx, filledVal);
        JS_setIconProps(ctx, JS_UNDEFINED, 6, iconArgs);
        if (!JS_IsUndefined(iconArgs[1])) JS_FreeValue(ctx, iconArgs[1]);
        if (!JS_IsUndefined(iconArgs[2])) JS_FreeValue(ctx, iconArgs[2]);
        if (!JS_IsUndefined(iconArgs[3])) JS_FreeValue(ctx, iconArgs[3]);
        if (!JS_IsUndefined(iconArgs[4])) JS_FreeValue(ctx, iconArgs[4]);
        if (!JS_IsUndefined(iconArgs[5])) JS_FreeValue(ctx, iconArgs[5]);
        JS_FreeValue(ctx, iconArgs[0]);
    }

    if (materialChanged || (styleChanged && fastPathIsMaterialType(type))) {
        bool matUnsupported = false;
        JSValue merged = fastPathBuildMergedProps(ctx, argv[3], type.c_str(), false, &matUnsupported);
        if (matUnsupported) {
            JS_FreeValue(ctx, merged);
            return JS_FALSE;
        }
        JSValue args[] = { JS_NewInt32(ctx, nodeId), merged };
        JS_setMaterialComponentProps(ctx, JS_UNDEFINED, 2, args);
        JS_FreeValue(ctx, args[0]);
        JS_FreeValue(ctx, merged);
    }

    return JS_TRUE;
}

JSValue JS_rayactBatchMutations(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsArray(argv[0])) {
        return JS_ThrowTypeError(ctx, "__rayactBatchMutations: expected (ops[])");
    }
    int len = 0;
    JSValue lenVal = JS_GetPropertyStr(ctx, argv[0], "length");
    JS_ToInt32(ctx, &len, lenVal);
    JS_FreeValue(ctx, lenVal);

    for (int i = 0; i < len; ++i) {
        JSValue op = JS_GetPropertyUint32(ctx, argv[0], (uint32_t)i);
        if (!JS_IsObject(op)) {
            JS_FreeValue(ctx, op);
            continue;
        }
        std::string opName = fastPathGetPropString(ctx, op, "op");
        if (opName == "appendChild") {
            int parentId = 0, childId = 0;
            JSValue p = JS_GetPropertyStr(ctx, op, "parentId");
            JSValue c = JS_GetPropertyStr(ctx, op, "childId");
            JS_ToInt32(ctx, &parentId, p);
            JS_ToInt32(ctx, &childId, c);
            JS_FreeValue(ctx, p);
            JS_FreeValue(ctx, c);
            batchAppendChildTolerant(parentId, childId);
        } else if (opName == "removeChild") {
            int parentId = 0, childId = 0;
            JSValue p = JS_GetPropertyStr(ctx, op, "parentId");
            JSValue c = JS_GetPropertyStr(ctx, op, "childId");
            JS_ToInt32(ctx, &parentId, p);
            JS_ToInt32(ctx, &childId, c);
            JS_FreeValue(ctx, p);
            JS_FreeValue(ctx, c);
            batchRemoveChildTolerant(parentId, childId);
        } else if (opName == "insertBefore") {
            int parentId = 0, childId = 0, beforeChildId = 0;
            JSValue p = JS_GetPropertyStr(ctx, op, "parentId");
            JSValue c = JS_GetPropertyStr(ctx, op, "childId");
            JSValue b = JS_GetPropertyStr(ctx, op, "beforeChildId");
            JS_ToInt32(ctx, &parentId, p);
            JS_ToInt32(ctx, &childId, c);
            JS_ToInt32(ctx, &beforeChildId, b);
            JS_FreeValue(ctx, p);
            JS_FreeValue(ctx, c);
            JS_FreeValue(ctx, b);
            batchInsertBeforeTolerant(parentId, childId, beforeChildId);
        } else if (opName == "disposeNode") {
            int nodeId = 0;
            JSValue n = JS_GetPropertyStr(ctx, op, "nodeId");
            JS_ToInt32(ctx, &nodeId, n);
            JS_FreeValue(ctx, n);
            batchDisposeNodeTolerant(nodeId);
        } else if (opName == "setRoot") {
            int nodeId = 0;
            JSValue n = JS_GetPropertyStr(ctx, op, "nodeId");
            JS_ToInt32(ctx, &nodeId, n);
            JS_FreeValue(ctx, n);
            batchSetRootTolerant(nodeId);
        } else if (opName == "setText") {
            int nodeId = 0;
            JSValue n = JS_GetPropertyStr(ctx, op, "nodeId");
            JS_ToInt32(ctx, &nodeId, n);
            std::string text = fastPathGetPropString(ctx, op, "text");
            JS_FreeValue(ctx, n);
            JSValue args[] = { JS_NewInt32(ctx, nodeId), JS_NewString(ctx, text.c_str()) };
            JS_setText(ctx, JS_UNDEFINED, 2, args);
            JS_FreeValue(ctx, args[0]);
            JS_FreeValue(ctx, args[1]);
        } else if (opName == "setValue") {
            int nodeId = 0;
            JSValue n = JS_GetPropertyStr(ctx, op, "nodeId");
            JS_ToInt32(ctx, &nodeId, n);
            std::string value = fastPathGetPropString(ctx, op, "value");
            JS_FreeValue(ctx, n);
            JSValue args[] = { JS_NewInt32(ctx, nodeId), JS_NewString(ctx, value.c_str()) };
            JS_setValue(ctx, JS_UNDEFINED, 2, args);
            JS_FreeValue(ctx, args[0]);
            JS_FreeValue(ctx, args[1]);
        } else if (opName == "setStyle") {
            int nodeId = 0;
            JSValue n = JS_GetPropertyStr(ctx, op, "nodeId");
            JS_ToInt32(ctx, &nodeId, n);
            JSValue style = JS_GetPropertyStr(ctx, op, "style");
            JSValue args[] = { JS_NewInt32(ctx, nodeId), style };
            JS_setStyle(ctx, JS_UNDEFINED, 2, args);
            JS_FreeValue(ctx, args[0]);
            JS_FreeValue(ctx, style);
            JS_FreeValue(ctx, n);
        } else if (opName == "setMaterialProps") {
            int nodeId = 0;
            JSValue n = JS_GetPropertyStr(ctx, op, "nodeId");
            JS_ToInt32(ctx, &nodeId, n);
            JSValue matProps = JS_GetPropertyStr(ctx, op, "props");
            JSValue args[] = { JS_NewInt32(ctx, nodeId), matProps };
            JS_setMaterialComponentProps(ctx, JS_UNDEFINED, 2, args);
            JS_FreeValue(ctx, args[0]);
            JS_FreeValue(ctx, matProps);
            JS_FreeValue(ctx, n);
        }
        JS_FreeValue(ctx, op);
    }
    return JS_UNDEFINED;
}

// === Binary command buffer (structural ops) =============================
// Zero-allocation per-commit mutation stream. JS encodes opcodes + int32 args
// (little-endian) into a shared ArrayBuffer (packages/rayact-react/src/
// commandBuffer.ts) and calls __rayactFlushCommands(byteLen) ONCE per commit.
// We decode it linearly here — no per-field JS property reads, no per-op
// boundary crossing. Opcodes MUST stay in sync with protocol.ts.
namespace {
enum RayactCmdOp : int32_t {
    RCMD_APPEND     = 1,   // parentId, childId
    RCMD_INSERT     = 2,   // parentId, childId, beforeChildId
    RCMD_REMOVE     = 3,   // parentId, childId
    RCMD_DISPOSE    = 4,   // nodeId
    RCMD_SET_ROOT   = 5,   // nodeId
    RCMD_CREATE     = 10,  // nodeId, typeId, styleRun
    RCMD_CREATE_PARAM = 11, // nodeId, typeId, stringId, flags, size, color, variantId, styleRun
    RCMD_SET_STYLE  = 12,  // nodeId, styleRun
    RCMD_NEW_STRING = 13,  // stringId, byteLen, <utf8 padded>
    RCMD_SET_TEXT   = 14,  // nodeId, stringId
};
enum RayactCmdType : int32_t {
    RTYPE_VIEW = 1,
    RTYPE_TEXT = 2,
    RTYPE_BUTTON = 3,
    RTYPE_IMAGE = 4,
    RTYPE_ICON = 5,
    RTYPE_SCROLL_VIEW = 6,
    RTYPE_TEXT_INPUT = 7,
    RTYPE_SAFE_AREA = 8,
    RTYPE_STATUS_BAR = 9,
};
enum RayactCreateParamFlags : int32_t {
    RPARAM_HAS_SIZE = 1 << 0,
    RPARAM_HAS_COLOR = 1 << 1,
    RPARAM_FILLED = 1 << 2,
    RPARAM_HAS_FILLED = 1 << 3,
};

constexpr size_t kCommandArenaBytes = 4u * 1024u * 1024u;  // 1M int32 slots
std::vector<uint8_t> g_commandArena;
std::map<int32_t, std::string> g_cmdStrings;  // interned strings, keyed by JS-assigned id

inline int32_t cmdReadI32(const uint8_t* p) {
    int32_t v;
    std::memcpy(&v, p, sizeof(int32_t));
    return v;
}
inline uint32_t cmdReadU32(const uint8_t* p) {
    uint32_t v;
    std::memcpy(&v, p, sizeof(uint32_t));
    return v;
}
inline float cmdReadF64(const uint8_t* p) {
    double d;
    std::memcpy(&d, p, sizeof(double));
    return (float)d;
}

// Apply one binary style entry to `s`. Returns the value width in bytes (4 or 8)
// or 0 for an unknown key (treated as a stream desync). keyIds MUST match
// packages/rayact-react/src/protocol.ts (SK).
size_t applyStyleEntryBinary(int32_t keyId, const uint8_t* val, raym3::v2::Style& s) {
    switch (keyId) {
        case 1:  s.width      = cmdReadF64(val); return 8;
        case 2:  s.height     = cmdReadF64(val); return 8;
        case 3:  s.minWidth   = cmdReadF64(val); return 8;
        case 4:  s.minHeight  = cmdReadF64(val); return 8;
        case 5:  s.maxWidth   = cmdReadF64(val); return 8;
        case 6:  s.maxHeight  = cmdReadF64(val); return 8;
        case 7:  s.flexGrow   = cmdReadF64(val); return 8;
        case 8:  s.flexShrink = cmdReadF64(val); return 8;
        case 9:  s.flexBasis  = cmdReadF64(val); return 8;
        case 10: { // flex shorthand (mirror applyStyleProps)
            float v = cmdReadF64(val);
            if (v > 0.0f)      { s.flexGrow = v; s.flexShrink = 1.0f; s.flexBasis = 0.0f; }
            else if (v == 0.0f){ s.flexGrow = 0.0f; s.flexShrink = 0.0f; }
            else               { s.flexGrow = 0.0f; s.flexShrink = -v; }
            return 8;
        }
        case 11: s.gap       = cmdReadF64(val); return 8;
        case 12: s.rowGap    = cmdReadF64(val); return 8;
        case 13: s.columnGap = cmdReadF64(val); return 8;
        case 14: s.padding.all        = cmdReadF64(val); return 8;
        case 15: s.padding.top        = cmdReadF64(val); return 8;
        case 16: s.padding.right      = cmdReadF64(val); return 8;
        case 17: s.padding.bottom     = cmdReadF64(val); return 8;
        case 18: s.padding.left       = cmdReadF64(val); return 8;
        case 19: s.padding.horizontal = cmdReadF64(val); return 8;
        case 20: s.padding.vertical   = cmdReadF64(val); return 8;
        case 21: s.margin.all         = cmdReadF64(val); return 8;
        case 22: s.margin.top         = cmdReadF64(val); return 8;
        case 23: s.margin.right       = cmdReadF64(val); return 8;
        case 24: s.margin.bottom      = cmdReadF64(val); return 8;
        case 25: s.margin.left        = cmdReadF64(val); return 8;
        case 26: s.margin.horizontal  = cmdReadF64(val); return 8;
        case 27: s.margin.vertical    = cmdReadF64(val); return 8;
        case 28: s.opacity      = cmdReadF64(val); return 8;
        case 29: s.borderRadius = cmdReadF64(val); return 8;
        case 30: s.borderWidth  = cmdReadF64(val); return 8;
        case 31: s.elevation    = cmdReadF64(val); return 8;
        case 36: s.translateX   = cmdReadF64(val); return 8;
        case 37: s.translateY   = cmdReadF64(val); return 8;
        case 38: s.scale        = cmdReadF64(val); return 8;
        case 39: s.rotation     = cmdReadF64(val); return 8;
        case 40: s.text.fontSize      = cmdReadF64(val); return 8;
        case 41: s.text.lineHeight    = cmdReadF64(val); return 8;
        case 42: s.text.letterSpacing = cmdReadF64(val); return 8;
        case 50: s.backgroundColor = colorFromUint(cmdReadU32(val)); return 4;
        case 51: s.borderColor     = colorFromUint(cmdReadU32(val)); return 4;
        case 52: s.text.color      = colorFromUint(cmdReadU32(val)); return 4;
        case 60: switch (cmdReadI32(val)) {
            case 0: s.flexDirection = raym3::v2::FlexDirection::Row; break;
            case 1: s.flexDirection = raym3::v2::FlexDirection::Column; break;
            case 2: s.flexDirection = raym3::v2::FlexDirection::RowReverse; break;
            case 3: s.flexDirection = raym3::v2::FlexDirection::ColumnReverse; break;
        } return 4;
        case 61: switch (cmdReadI32(val)) {
            case 0: s.justifyContent = raym3::v2::Justify::FlexStart; break;
            case 1: s.justifyContent = raym3::v2::Justify::FlexEnd; break;
            case 2: s.justifyContent = raym3::v2::Justify::Center; break;
            case 3: s.justifyContent = raym3::v2::Justify::SpaceBetween; break;
            case 4: s.justifyContent = raym3::v2::Justify::SpaceAround; break;
            case 5: s.justifyContent = raym3::v2::Justify::SpaceEvenly; break;
        } return 4;
        case 62: switch (cmdReadI32(val)) {
            case 0: s.alignItems = raym3::v2::Align::FlexStart; break;
            case 1: s.alignItems = raym3::v2::Align::FlexEnd; break;
            case 2: s.alignItems = raym3::v2::Align::Center; break;
            case 3: s.alignItems = raym3::v2::Align::Stretch; break;
            case 4: s.alignItems = raym3::v2::Align::Baseline; break;
        } return 4;
        case 63: switch (cmdReadI32(val)) {
            case 0: s.alignSelf = raym3::v2::Align::FlexStart; break;
            case 1: s.alignSelf = raym3::v2::Align::FlexEnd; break;
            case 2: s.alignSelf = raym3::v2::Align::Center; break;
            case 3: s.alignSelf = raym3::v2::Align::Stretch; break;
        } return 4;
        case 64: switch (cmdReadI32(val)) {
            case 0: s.display = raym3::v2::Display::Flex; break;
            case 1: s.display = raym3::v2::Display::None; break;
            case 2: s.display = raym3::v2::Display::Contents; break;
        } return 4;
        case 65: switch (cmdReadI32(val)) {
            case 0: s.position = raym3::v2::PositionType::Absolute; break;
            case 1: s.position = raym3::v2::PositionType::Relative; break;
            case 2: s.position = raym3::v2::PositionType::Fixed; break;
        } return 4;
        case 66: switch (cmdReadI32(val)) {
            case 0: s.overflow = raym3::v2::Overflow::Hidden; break;
            case 1: s.overflow = raym3::v2::Overflow::Scroll; break;
            case 2: s.overflow = raym3::v2::Overflow::Visible; break;
        } return 4;
        case 67: switch (cmdReadI32(val)) {
            case 0: s.pointerEvents = raym3::v2::PointerEvents::None; break;
            case 1: s.pointerEvents = raym3::v2::PointerEvents::Auto; break;
        } return 4;
        default: return 0;  // unknown key — desync guard (JS validates before emit)
    }
}

// Read a style run (count + entries) into `s`. Returns the new offset, or `len`
// on any truncation/desync.
size_t readStyleRun(const uint8_t* base, size_t off, size_t len, raym3::v2::Style& s) {
    if (off + 4 > len) return len;
    int32_t count = cmdReadI32(base + off);
    off += 4;
    for (int32_t i = 0; i < count; ++i) {
        if (off + 4 > len) return len;
        int32_t keyId = cmdReadI32(base + off);
        off += 4;
        size_t vbytes = applyStyleEntryBinary(keyId, base + off, s);
        if (vbytes == 0 || off + vbytes > len) return len;
        off += vbytes;
    }
    return off;
}

void createNodeFromBuffer(int id, int typeId, const raym3::v2::Style& style) {
    if (typeId == RTYPE_TEXT) {
        raym3::v2::TextProps props;
        props.style = style;
        g_nodes[id] = raym3::v2::Text("", props);  // content arrives via RCMD_SET_TEXT
    } else if (typeId == RTYPE_SCROLL_VIEW) {
        raym3::v2::ViewProps props;
        props.style = style;
        props.style.overflow = raym3::v2::Overflow::Scroll;
        auto node = raym3::v2::View(props);
#if defined(RAYACT_ANDROID) || defined(__ANDROID__)
        node->scrollMomentumEnabled = true;
#endif
        g_nodes[id] = node;
        g_scrollViewIds.insert(id);
    } else if (typeId == RTYPE_SAFE_AREA) {
        raym3::v2::ViewProps props;
        g_safeAreaBaseStyles[id] = style;
        props.style = applySafeAreaPadding(style);
        g_nodes[id] = raym3::v2::View(props);
    } else if (typeId == RTYPE_STATUS_BAR) {
        raym3::v2::ViewProps props;
        props.style.display = raym3::v2::Display::None;
        props.style = raym3::v2::MergeStyles(props.style, style);
        g_nodes[id] = raym3::v2::View(props);
    } else {  // RTYPE_VIEW (and root)
        raym3::v2::ViewProps props;
        props.style = style;
        auto node = raym3::v2::View(props);
        g_nodes[id] = node;
        rayact::shadowTree().createNode((uint32_t)id, props.style);
    }
}

static std::string iconGlyphFromNameBinary(const std::string& name, int size, bool filled, int& resolvedCp) {
    resolvedCp = 0;
    bool looksLikeName = !name.empty();
    for (unsigned char c : name) {
        if (c > 127) { looksLikeName = false; break; }
    }
    if (!looksLikeName || !g_bridge_ctx) return name;

    JSValue globalObj = JS_GetGlobalObject(g_bridge_ctx);
    JSValue iconsMap = JS_GetPropertyStr(g_bridge_ctx, globalObj, "Icons");
    if (JS_IsObject(iconsMap)) {
        JSValue cpVal = JS_GetPropertyStr(g_bridge_ctx, iconsMap, name.c_str());
        uint32_t cp = 0;
        if (!JS_IsUndefined(cpVal) && JS_ToUint32(g_bridge_ctx, &cp, cpVal) == 0 && cp > 0) {
            resolvedCp = (int)cp;
            requireIcon(resolvedCp, (int)roundf((float)size), filled);
            char utf8[5] = {};
            if (cp < 0x80) {
                utf8[0] = (char)cp;
            } else if (cp < 0x800) {
                utf8[0] = (char)(0xC0 | (cp >> 6));
                utf8[1] = (char)(0x80 | (cp & 0x3F));
            } else if (cp < 0x10000) {
                utf8[0] = (char)(0xE0 | (cp >> 12));
                utf8[1] = (char)(0x80 | ((cp >> 6) & 0x3F));
                utf8[2] = (char)(0x80 | (cp & 0x3F));
            } else {
                utf8[0] = (char)(0xF0 | (cp >> 18));
                utf8[1] = (char)(0x80 | ((cp >> 12) & 0x3F));
                utf8[2] = (char)(0x80 | ((cp >> 6) & 0x3F));
                utf8[3] = (char)(0x80 | (cp & 0x3F));
            }
            JS_FreeValue(g_bridge_ctx, cpVal);
            JS_FreeValue(g_bridge_ctx, iconsMap);
            JS_FreeValue(g_bridge_ctx, globalObj);
            return std::string(utf8);
        }
        JS_FreeValue(g_bridge_ctx, cpVal);
    }
    JS_FreeValue(g_bridge_ctx, iconsMap);
    JS_FreeValue(g_bridge_ctx, globalObj);
    return name;
}

void createParamNodeFromBuffer(
    int id,
    int typeId,
    const std::string& param,
    int flags,
    float sizeArg,
    uint32_t colorArg,
    const std::string& variant,
    const raym3::v2::Style& style
) {
    if (typeId == RTYPE_BUTTON) {
        raym3::v2::ComponentProps props;
        props.label = param;
        props.style = style;
        g_nodes[id] = raym3::v2::MaterialComponent(raym3::v2::M3Component::Button, props, {});
        g_materialComponentKinds[id] = raym3::v2::M3Component::Button;
    } else if (typeId == RTYPE_IMAGE) {
        Texture2D tex = LoadTexture(param.c_str());
        if (tex.id == 0) {
            raym3::v2::ViewProps props;
            props.style = style;
            g_nodes[id] = raym3::v2::View(props);
            return;
        }
        g_textures.push_back(tex);
        Texture2D capturedTex = tex;
        raym3::v2::ViewProps props;
        props.style = style;
        g_nodes[id] = raym3::v2::Custom(props, [capturedTex](Rectangle layout) {
            float scaleX = layout.width / (float)capturedTex.width;
            float scaleY = layout.height / (float)capturedTex.height;
            float scale = (scaleX > scaleY) ? scaleX : scaleY;
            float drawW = capturedTex.width * scale;
            float drawH = capturedTex.height * scale;
            float drawX = layout.x + (layout.width - drawW) * 0.5f;
            float drawY = layout.y + (layout.height - drawH) * 0.5f;
            DrawTextureEx(capturedTex, {drawX, drawY}, 0.0f, scale, WHITE);
        });
    } else if (typeId == RTYPE_ICON) {
        float iconSize = (flags & RPARAM_HAS_SIZE) ? sizeArg : 16.0f;
        bool filled = (flags & RPARAM_HAS_FILLED) ? ((flags & RPARAM_FILLED) != 0) : true;
        int resolvedCp = 0;
        std::string glyph = iconGlyphFromNameBinary(param, (int)roundf(iconSize), filled, resolvedCp);
        Color color = (flags & RPARAM_HAS_COLOR)
            ? colorFromUint(colorArg)
            : raym3::Theme::GetColorScheme().onSurfaceVariant;
        std::string variantStr = variant.empty() ? "rounded" : variant;
        raym3::v2::ViewProps props;
        props.style = style;
        if (!props.style.width) props.style.width = iconSize;
        if (!props.style.height) props.style.height = iconSize;
        if (!props.style.minWidth) props.style.minWidth = props.style.width;
        if (!props.style.minHeight) props.style.minHeight = props.style.height;
        if (!props.style.flexShrink) props.style.flexShrink = 0.0f;
        g_iconRenderStates[id] = IconRenderState{glyph, resolvedCp, iconSize, color, filled, variantStr};
        g_nodes[id] = raym3::v2::Custom(props, [id](Rectangle layout) {
            auto stateIt = g_iconRenderStates.find(id);
            if (stateIt == g_iconRenderStates.end()) return;
            const IconRenderState& icon = stateIt->second;
            if (icon.codepoint != 0 && g_iconSheet.id != 0) {
                IconKey key{icon.codepoint, (int)roundf(icon.size), icon.filled};
                auto it = g_iconSheetRects.find(key);
                if (it != g_iconSheetRects.end()) {
                    Rectangle src = it->second;
                    Rectangle dest = {layout.x + (layout.width - icon.size) * 0.5f,
                                      layout.y + (layout.height - icon.size) * 0.5f,
                                      icon.size, icon.size};
                    DrawTexturePro(g_iconSheet, src, dest, {0.0f, 0.0f}, 0.0f, icon.color);
                    return;
                }
            }
            if (icon.codepoint != 0) {
                raym3::v2::DrawMaterialIcon(icon.codepoint, layout, icon.color,
                                            (int)roundf(icon.size), icon.filled);
            }
        });
    } else if (typeId == RTYPE_TEXT_INPUT) {
#if defined(__ANDROID__) || defined(RAYACT_IOS)
        registerImeStateCallbackOnce();
#endif
        raym3::v2::TextInputProps props;
        props.value = nullptr;
        props.style = style;
        auto node = raym3::v2::TextInput(props);
        node->inputScratch = param;
        node->inputBuffer.assign(1024, '\0');
        std::strncpy(node->inputBuffer.data(), node->inputScratch.c_str(), node->inputBuffer.size() - 1);
        node->textInput.buffer = node->inputBuffer.data();
        node->textInput.bufferSize = (int)node->inputBuffer.size();
        node->textInput.value = &node->inputScratch;
        node->textInput.onChange = [id](const std::string& text) {
            auto it = g_changeTextCallbacks.find(id);
            if (it == g_changeTextCallbacks.end() || !g_bridge_ctx) return;
            JSValue arg = JS_NewString(g_bridge_ctx, text.c_str());
            JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 1, &arg);
            if (JS_IsException(result)) JS_FreeValue(g_bridge_ctx, JS_GetException(g_bridge_ctx));
            JS_FreeValue(g_bridge_ctx, result);
            JS_FreeValue(g_bridge_ctx, arg);
        };
        node->textInput.onFocus = [id]() {
#if defined(__ANDROID__) || defined(RAYACT_IOS)
            AndroidKeyboard_ShowForNode(id, "", false, false, "");
#endif
            auto it = g_focusCallbacks.find(id);
            if (it == g_focusCallbacks.end() || !g_bridge_ctx) return;
            JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 0, nullptr);
            if (JS_IsException(result)) JS_FreeValue(g_bridge_ctx, JS_GetException(g_bridge_ctx));
            JS_FreeValue(g_bridge_ctx, result);
        };
        node->textInput.onBlur = [id]() {
#if defined(__ANDROID__) || defined(RAYACT_IOS)
            AndroidKeyboard_Hide();
#endif
            auto it = g_blurCallbacks.find(id);
            if (it == g_blurCallbacks.end() || !g_bridge_ctx) return;
            JSValue result = JS_Call(g_bridge_ctx, it->second, JS_UNDEFINED, 0, nullptr);
            if (JS_IsException(result)) JS_FreeValue(g_bridge_ctx, JS_GetException(g_bridge_ctx));
            JS_FreeValue(g_bridge_ctx, result);
        };
        g_nodes[id] = node;
    }
}

void applyCommandBuffer(const uint8_t* base, size_t len) {
    size_t off = 0;
    while (off + 4 <= len) {
        int32_t op = cmdReadI32(base + off);
        off += 4;
        switch (op) {
            case RCMD_APPEND: {
                if (off + 8 > len) return;
                int p = cmdReadI32(base + off);
                int c = cmdReadI32(base + off + 4);
                off += 8;
                batchAppendChildTolerant(p, c);
                break;
            }
            case RCMD_INSERT: {
                if (off + 12 > len) return;
                int p = cmdReadI32(base + off);
                int c = cmdReadI32(base + off + 4);
                int b = cmdReadI32(base + off + 8);
                off += 12;
                batchInsertBeforeTolerant(p, c, b);
                break;
            }
            case RCMD_REMOVE: {
                if (off + 8 > len) return;
                int p = cmdReadI32(base + off);
                int c = cmdReadI32(base + off + 4);
                off += 8;
                batchRemoveChildTolerant(p, c);
                break;
            }
            case RCMD_DISPOSE: {
                if (off + 4 > len) return;
                int n = cmdReadI32(base + off);
                off += 4;
                batchDisposeNodeTolerant(n);
                break;
            }
            case RCMD_SET_ROOT: {
                if (off + 4 > len) return;
                int n = cmdReadI32(base + off);
                off += 4;
                batchSetRootTolerant(n);
                break;
            }
            case RCMD_CREATE: {
                if (off + 8 > len) return;
                int id = cmdReadI32(base + off);
                int typeId = cmdReadI32(base + off + 4);
                off += 8;
                raym3::v2::Style style;
                off = readStyleRun(base, off, len, style);
                createNodeFromBuffer(id, typeId, style);
                break;
            }
            case RCMD_CREATE_PARAM: {
                if (off + 32 > len) return;
                int id = cmdReadI32(base + off);
                int typeId = cmdReadI32(base + off + 4);
                int strId = cmdReadI32(base + off + 8);
                int flags = cmdReadI32(base + off + 12);
                float sizeArg = cmdReadF64(base + off + 16);
                uint32_t colorArg = cmdReadU32(base + off + 24);
                int variantId = cmdReadI32(base + off + 28);
                off += 32;
                raym3::v2::Style style;
                off = readStyleRun(base, off, len, style);
                auto sit = g_cmdStrings.find(strId);
                std::string param = sit != g_cmdStrings.end() ? sit->second : "";
                auto vit = g_cmdStrings.find(variantId);
                std::string variant = vit != g_cmdStrings.end() ? vit->second : "";
                createParamNodeFromBuffer(id, typeId, param, flags, sizeArg, colorArg, variant, style);
                break;
            }
            case RCMD_SET_STYLE: {
                if (off + 4 > len) return;
                int id = cmdReadI32(base + off);
                off += 4;
                raym3::v2::Style delta;
                off = readStyleRun(base, off, len, delta);
                auto it = g_nodes.find(id);
                if (it != g_nodes.end() && it->second) {
                    it->second->style = raym3::v2::MergeStyles(it->second->style, delta);
                    rayact::shadowTree().setStyle((uint32_t)id, it->second->style);
                }
                break;
            }
            case RCMD_NEW_STRING: {
                if (off + 8 > len) return;
                int strId = cmdReadI32(base + off);
                int byteLen = cmdReadI32(base + off + 4);
                off += 8;
                if (byteLen < 0 || off + (size_t)byteLen > len) return;
                g_cmdStrings[strId] = std::string(reinterpret_cast<const char*>(base + off), (size_t)byteLen);
                off += ((size_t)byteLen + 3) & ~size_t(3);  // 4-byte padded
                break;
            }
            case RCMD_SET_TEXT: {
                if (off + 8 > len) return;
                int id = cmdReadI32(base + off);
                int strId = cmdReadI32(base + off + 4);
                off += 8;
                auto it = g_nodes.find(id);
                auto sit = g_cmdStrings.find(strId);
                if (it != g_nodes.end() && it->second && sit != g_cmdStrings.end()) {
                    it->second->text = sit->second;
                    it->second->preparedTextCache.reset();
                }
                break;
            }
            default:
                // Unknown opcode → stream desync; stop rather than misread.
                return;
        }
    }
}
}  // namespace

JSValue JS_rayactFlushCommands(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    int32_t len = 0;
    JS_ToInt32(ctx, &len, argv[0]);
    if (len <= 0 || g_commandArena.empty()) return JS_UNDEFINED;
    if ((size_t)len > g_commandArena.size()) len = (int32_t)g_commandArena.size();
    applyCommandBuffer(g_commandArena.data(), (size_t)len);
    return JS_UNDEFINED;
}

void installCommandBuffer(JSContext* ctx, JSValue global) {
    if (g_commandArena.empty()) g_commandArena.resize(kCommandArenaBytes);
    // External-backed ArrayBuffer over the arena (same pattern as the animated
    // style buffer). The vector is process-lived and never reallocated while the
    // buffer is referenced.
    JSValue buffer = JS_NewArrayBuffer(
        ctx,
        g_commandArena.data(),
        g_commandArena.size(),
        nullptr,
        nullptr,
        false);
    JS_SetPropertyStr(ctx, global, "__rayactCommandBuffer", buffer);
    // Enabled by default; keep an adb/env rollback switch for A/B against the
    // legacy per-op / object-batch path:
    //   desktop → env RAYACT_BINARY=1
    //   android → adb shell setprop debug.rayact.binary 0
    bool enable = true;
    if (const char* env = std::getenv("RAYACT_BINARY")) {
        enable = env[0] != '\0' && env[0] != '0';
    }
#if defined(RAYACT_ANDROID) || defined(__ANDROID__)
    {
        char prop[PROP_VALUE_MAX] = {0};
        if (__system_property_get("debug.rayact.binary", prop) > 0 && prop[0] != '\0') {
            enable = prop[0] != '0';
        }
    }
#endif
    if (enable) {
        JS_SetPropertyStr(ctx, global, "__RAYACT_USE_BINARY", JS_TRUE);
        // Id-space separation is by parity (native odd / JS even), not a base
        // offset — see nextNativeNodeId(). Nothing to set here.
    }
}
