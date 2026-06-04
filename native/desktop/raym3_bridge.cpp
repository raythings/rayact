#include "raym3_bridge.hpp"
#include "css_bridge.hpp"
#include "color_parse.hpp"

#include <raym3/v2/View.h>
#include <raym3/v2/Style.h>
#include <raym3/v2/Components.h>
#include <raym3/fonts/FontManager.h>
#include <raym3/components/Checkbox.h>
#include <raym3/components/ProgressIndicator.h>
#include <raym3/components/RadioButton.h>
#include <raym3/components/Switch.h>
#include <raym3/styles/Theme.h>
#include <raylib.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <optional>
#include <set>
#include <sstream>
#include <string>
#include <vector>
#include <regex>
#include <cstdlib>

// ─── per-screen state ──────────────────────────────────────────────────────
//
// One QJS context, but N React trees (one per navigation screen). All per-node
// state is per-screen. The bridge functions read/write the CURRENT screen's
// state via `g_currentScreenId` — JS code calls `setCurrentScreen(id)` before
// each screen's React mount, and the rest of the bridge transparently operates
// on that screen's node map / press callbacks / etc.
//
struct ScreenState;  // forward decl (defined later with NativeControlState below)

enum class NativeControlKind { Checkbox, Switch, RadioButton, Slider };

struct NativeControlState {
    NativeControlKind kind;
    bool checked = false;
    bool disabled = false;
    std::string label;
    float anim = -1.0f; // eased 0..1 toggle progress; -1 = uninitialized
    // Slider state.
    float value = 0.0f;
    float minValue = 0.0f;
    float maxValue = 1.0f;
    float step = 0.0f;   // 0 = continuous
    bool dragging = false;
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
static int g_nextNodeId = 1;

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
static std::map<int, JSValue> g_scrollCallbacks;
static std::map<int, JSValue> g_requestCloseCallbacks;
static int g_activeScrollNodeId = -1;
static Vector2 g_lastScrollDragMouse = {0.0f, 0.0f};
static float g_scrollDragDistance = 0.0f;

static std::map<int, NativeControlState> g_nativeControlStates;
static std::map<int, raym3::v2::M3Component> g_materialComponentKinds;

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

static std::map<IconFontKey, Font> g_iconFonts; // (size, fill) → Font
static std::set<int>            g_iconCPSet;    // codepoints loaded into fonts
static std::size_t              g_iconCPSetVer = 0;
static std::map<IconFontKey, std::size_t> g_iconFontVer;

// Sprite sheet state — built once after JS init via buildIconSpriteSheet()
static std::set<IconKey>         g_iconRequests;  // (cp, size) pairs registered during init
static Texture2D                 g_iconSheet = {0};
static std::map<IconKey, Rectangle> g_iconSheetRects; // UV pixel rects in g_iconSheet

// Search order: MaterialSymbolsRounded FIRST — material_icons.js (the Icons
// name→codepoint map) is generated from its codepoints, so the loaded font must
// match or glyphs resolve to .notdef. LoadFontEx loads only the specific
// requested codepoints, so the variable font indexes fine here (the historical
// "cannot index PUA" caveat only applied to bulk-loading the whole range).
static const char* kFilledIconFontCandidates[] = {
    "./resources/fonts/MaterialSymbolsRounded-Filled.ttf",
    "./resources/fonts/MaterialSymbolsRounded.ttf",
    "./resources/fonts/MaterialIcons-Regular.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    nullptr
};

static const char* kOutlinedIconFontCandidates[] = {
    "./resources/fonts/MaterialSymbolsRounded.ttf",
    "./resources/fonts/MaterialSymbolsRounded-Filled.ttf",
    "./resources/fonts/MaterialIcons-Regular.ttf",
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

static const char* findIconFontPath(bool filled) {
    const char** candidates = filled ? kFilledIconFontCandidates : kOutlinedIconFontCandidates;
    for (int i = 0; candidates[i]; i++) {
        FILE* f = fopen(candidates[i], "rb");
        if (f) { fclose(f); return candidates[i]; }
    }
    return nullptr;
}

// Register a (codepoint, size) pair. Also invalidates font cache if new CP.
static void requireIcon(int cp, int size, bool filled) {
    g_iconRequests.insert({cp, size, filled});
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
        font = LoadFontEx(path, size, cps.data(), (int)cps.size());
        printf("Icon font: loaded %d %s glyph(s) at size %d\n",
               (int)cps.size(), filled ? "filled" : "outlined", size);
    }
    if (font.texture.id == 0) font = GetFontDefault();
    g_iconFonts[fontKey]    = font;
    g_iconFontVer[fontKey]  = g_iconCPSetVer;
    return font;
}

// Build sprite sheet from all (cp, size) pairs registered during JS init.
// Called once after JS finishes executing, before the render loop starts.
// After this, all icon render lambdas use DrawTextureRec instead of DrawTextEx.
void buildIconSpriteSheet() {
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

    // Each icon gets a SQUARE size x size cell. Font metrics (offsetY, advance,
    // line height) do NOT reliably center the visual glyph — different icons have
    // different ink bearings, so trusting metrics leaves them sitting high/low.
    // Instead build the atlas on the CPU: scan each glyph bitmap for its actual
    // ink bounds (first/last opaque pixel) and blit ONLY the ink, centered, into
    // the cell. This centers every icon by its real pixels, uniformly.
    struct Entry { IconKey key; float x; };
    std::vector<Entry> entries;
    float curX = PAD;
    int maxCell = 0;
    for (const auto& key : g_iconRequests) {
        entries.push_back({key, curX});
        curX += key.size + PAD * 2;
        maxCell = std::max(maxCell, key.size);
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
        float cell = (float)e.key.size;
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
            ImageDraw(&atlas, g, src, dst, WHITE);
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
    {
        std::string layout = jsGetString(ctx, obj, "layout");
        if (layout == "row") {
            props.navigationItemLayout = raym3::v2::NavigationItemLayout::Row;
        } else if (layout == "column") {
            props.navigationItemLayout = raym3::v2::NavigationItemLayout::Column;
        }
    }
    if (auto z = jsGetFloat(ctx, obj, "zIndex")) props.zIndex = (int)roundf(*z);
    if (auto progress = jsGetFloat(ctx, obj, "progress")) props.progress = *progress;
    if (auto wavelength = jsGetFloat(ctx, obj, "wavelength")) props.wavelength = *wavelength;
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
        {"navigationbar", raym3::v2::M3Component::NavigationBar},
        {"navigationbaritem", raym3::v2::M3Component::NavigationBarItem},
        {"navigationdrawer", raym3::v2::M3Component::NavigationDrawer},
        {"navigationrail", raym3::v2::M3Component::NavigationRail},
        {"progressindicator", raym3::v2::M3Component::ProgressIndicator},
        {"radiobutton", raym3::v2::M3Component::RadioButton},
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
    };

    auto it = components.find(key);
    if (it == components.end()) return std::nullopt;
    return it->second;
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
    return std::nullopt;
}

static void invokePressCallback(int id) {
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
    if (state.kind == NativeControlKind::Slider) {
        if (auto v = jsGetFloat(ctx, props, "min")) state.minValue = *v;
        if (auto v = jsGetFloat(ctx, props, "max")) state.maxValue = *v;
        if (auto v = jsGetFloat(ctx, props, "step")) state.step = *v;
        // Don't clobber the in-flight value while the user is dragging.
        if (!state.dragging) {
            if (auto v = jsGetFloat(ctx, props, "value")) state.value = *v;
        }
        return;
    }
    if (state.kind == NativeControlKind::RadioButton) {
        state.checked = jsGetBool(ctx, props, "selected",
                         jsGetBool(ctx, props, "checked", state.checked));
    } else {
        state.checked = jsGetBool(ctx, props, "checked",
                         jsGetBool(ctx, props, "selected", state.checked));
    }
}

static float clampScrollOffset(float value, float contentSize, float viewportSize) {
    float maxValue = std::max(0.0f, contentSize - viewportSize);
    return std::max(0.0f, std::min(value, maxValue));
}

static int nodeIdFor(const raym3::v2::NodePtr& node) {
    for (const auto& [id, candidate] : g_nodes) {
        if (candidate == node) return id;
    }
    return -1;
}

raym3::v2::NodePtr engineFindPressTarget(const raym3::v2::NodePtr& hit) {
    int id = nodeIdFor(hit);
    while (id > 0) {
        auto nodeIt = g_nodes.find(id);
        if (nodeIt != g_nodes.end() && nodeIt->second && nodeIt->second->onPress) {
            return nodeIt->second;
        }
        auto parentIt = g_nodeParents.find(id);
        if (parentIt == g_nodeParents.end()) break;
        id = parentIt->second;
    }
    return nullptr;
}

static raym3::v2::NodePtr findScrollableNodeAt(const raym3::v2::NodePtr& node, Vector2 point) {
    if (!node || node->style.display == raym3::v2::Display::None ||
        node->style.pointerEvents == raym3::v2::PointerEvents::None) {
        return nullptr;
    }

    bool inBounds = CheckCollisionPointRec(point, node->layout);
    bool clipped = node->style.overflow == raym3::v2::Overflow::Hidden ||
                   node->style.overflow == raym3::v2::Overflow::Scroll;
    if (clipped && !inBounds) return nullptr;

    std::vector<raym3::v2::NodePtr> children = node->children;
    std::stable_sort(children.begin(), children.end(),
                     [](const raym3::v2::NodePtr& a, const raym3::v2::NodePtr& b) {
                         return a->zIndex > b->zIndex;
                     });
    for (const auto& child : children) {
        if (auto hit = findScrollableNodeAt(child, point)) return hit;
    }

    if (inBounds && node->style.overflow == raym3::v2::Overflow::Scroll &&
        node->scrollContentHeight > node->layout.height + 0.5f) {
        return node;
    }
    return nullptr;
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

static bool scrollNodeBy(const raym3::v2::NodePtr& node, float deltaX, float deltaY) {
    if (!node) return false;
    float oldX = node->scrollOffsetX;
    float oldY = node->scrollOffsetY;
    node->scrollOffsetX = clampScrollOffset(node->scrollOffsetX + deltaX,
                                            node->scrollContentWidth, node->layout.width);
    node->scrollOffsetY = clampScrollOffset(node->scrollOffsetY + deltaY,
                                            node->scrollContentHeight, node->layout.height);
    bool changed = std::abs(node->scrollOffsetX - oldX) > 0.01f ||
                   std::abs(node->scrollOffsetY - oldY) > 0.01f;
    if (changed) {
        int id = nodeIdFor(node);
        if (id > 0) emitScrollEvent(id, node);
    }
    return changed;
}

bool processRaym3ScrollInput(Vector2 mouse, float wheelY, bool pressed, bool down, bool released) {
    bool consumedPress = false;

    if (std::abs(wheelY) > 0.01f) {
        if (auto target = findScrollableNodeAt(g_root, mouse)) {
            scrollNodeBy(target, 0.0f, -wheelY * 48.0f);
        }
    }

    if (pressed) {
        auto target = findScrollableNodeAt(g_root, mouse);
        g_activeScrollNodeId = target ? nodeIdFor(target) : -1;
        g_lastScrollDragMouse = mouse;
        g_scrollDragDistance = 0.0f;
    }

    if (down && g_activeScrollNodeId > 0) {
        auto it = g_nodes.find(g_activeScrollNodeId);
        if (it != g_nodes.end()) {
            float dx = mouse.x - g_lastScrollDragMouse.x;
            float dy = mouse.y - g_lastScrollDragMouse.y;
            g_scrollDragDistance += std::abs(dx) + std::abs(dy);
            if (std::abs(dx) > 0.01f || std::abs(dy) > 0.01f) {
                scrollNodeBy(it->second, -dx, -dy);
            }
            g_lastScrollDragMouse = mouse;
            consumedPress = g_scrollDragDistance > 4.0f;
        }
    }

    if (released) {
        consumedPress = g_activeScrollNodeId > 0 && g_scrollDragDistance > 4.0f;
        g_activeScrollNodeId = -1;
        g_scrollDragDistance = 0.0f;
    }

    return consumedPress;
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
            nums.push_back(std::strtof(token.c_str(), nullptr));
        }
        if (nums.size() > 0) shadow.offsetX = nums[0];
        if (nums.size() > 1) shadow.offsetY = nums[1];
        if (nums.size() > 2) shadow.blurRadius = nums[2];
        if (nums.size() > 3) shadow.spreadRadius = nums[3];
        shadows.push_back(shadow);
    }
    return shadows;
}

static std::optional<raym3::v2::EdgeValues> jsGetEdgeValues(JSContext* ctx, JSValue obj, const char* key) {
    JSValue v = JS_GetPropertyStr(ctx, obj, key);
    if (JS_IsUndefined(v) || JS_IsNull(v)) { JS_FreeValue(ctx, v); return std::nullopt; }
    raym3::v2::EdgeValues ev;
    if (JS_IsNumber(v)) {
        double d; JS_ToFloat64(ctx, &d, v);
        ev.all = (float)d;
    } else if (JS_IsObject(v)) {
        auto edge = [&](const char* k) -> std::optional<float> {
            JSValue e = JS_GetPropertyStr(ctx, v, k);
            std::optional<float> r;
            if (!JS_IsUndefined(e)) { double d; JS_ToFloat64(ctx, &d, e); r = (float)d; }
            JS_FreeValue(ctx, e);
            return r;
        };
        ev.top = edge("top"); ev.right = edge("right");
        ev.bottom = edge("bottom"); ev.left = edge("left");
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
    if (auto v = jsGetFloat(ctx, obj, "flexGrow"))   s.flexGrow   = v;
    if (auto v = jsGetFloat(ctx, obj, "flexShrink")) s.flexShrink = v;
    if (auto v = jsGetFloat(ctx, obj, "flexBasis"))  s.flexBasis  = v;
    if (auto v = jsGetFloat(ctx, obj, "gap"))        s.gap        = v;
    if (auto v = jsGetFloat(ctx, obj, "rowGap"))     s.rowGap     = v;
    if (auto v = jsGetFloat(ctx, obj, "columnGap"))  s.columnGap  = v;

    // Spacing — shorthand and per-edge
    if (auto v = jsGetEdgeValues(ctx, obj, "margin"))  s.margin  = *v;
    if (auto v = jsGetEdgeValues(ctx, obj, "padding")) s.padding = *v;
    // Per-edge shortcuts (override shorthand if both present)
    auto applyEdge = [&](raym3::v2::EdgeValues& ev, const char* tKey, const char* rKey,
                         const char* bKey, const char* lKey) {
        if (auto v = jsGetFloat(ctx, obj, tKey)) ev.top    = v;
        if (auto v = jsGetFloat(ctx, obj, rKey)) ev.right  = v;
        if (auto v = jsGetFloat(ctx, obj, bKey)) ev.bottom = v;
        if (auto v = jsGetFloat(ctx, obj, lKey)) ev.left   = v;
    };
    applyEdge(s.padding, "paddingTop", "paddingRight", "paddingBottom", "paddingLeft");
    applyEdge(s.margin,  "marginTop",  "marginRight",  "marginBottom",  "marginLeft");

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

    // text sub-object — only override fields that are present
    JSValue textObj = JS_GetPropertyStr(ctx, obj, "text");
    if (JS_IsObject(textObj)) {
        if (auto v = jsGetFloat(ctx, textObj, "fontSize"))     s.text.fontSize     = v;
        if (auto v = jsGetColor(ctx, textObj, "color"))        s.text.color        = v;
        if (auto v = jsGetFloat(ctx, textObj, "lineHeight"))   s.text.lineHeight   = v;
        if (auto v = jsGetFloat(ctx, textObj, "letterSpacing")) s.text.letterSpacing = v;
        JSValue fv = JS_GetPropertyStr(ctx, textObj, "fontFamily");
        if (!JS_IsUndefined(fv)) {
            const char* fname = JS_ToCString(ctx, fv);
            if (fname && fname[0]) s.text.fontFamily = std::string(fname);
            JS_FreeCString(ctx, fname);
        }
        JS_FreeValue(ctx, fv);
    }
    JS_FreeValue(ctx, textObj);
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

void refreshStylesForColorScheme(JSContext* ctx) {
    if (!ctx) return;
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

// ─── JS bridge functions ────────────────────────────────────────────────────

JSValue JS_createView(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    raym3::v2::ViewProps props;
    if (argc >= 1 && JS_IsObject(argv[0])) {
        props.style = parseStyle(ctx, argv[0]);
        if (auto z = jsGetFloat(ctx, argv[0], "zIndex")) props.zIndex = (int)roundf(*z);
    }

    auto node = raym3::v2::View(props);
    int id = g_nextNodeId++;
    g_nodes[id] = node;
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

    int id = g_nextNodeId++;
    g_nodes[id] = node;
    if (argc >= 2 && JS_IsObject(argv[1])) captureNodeClassName(ctx, id, argv[1]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_createButton(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "createButton: expected (label, style?)");
    const char* label = JS_ToCString(ctx, argv[0]);
    if (!label) return JS_ThrowTypeError(ctx, "createButton: invalid label");

    raym3::v2::ButtonProps props;
    props.label = label;
    JS_FreeCString(ctx, label);

    if (argc >= 2 && JS_IsObject(argv[1]))
        props.style = parseStyle(ctx, argv[1]);

    auto node = raym3::v2::Button(props);
    int id = g_nextNodeId++;
    g_nodes[id] = node;
    if (argc >= 2 && JS_IsObject(argv[1])) captureNodeClassName(ctx, id, argv[1]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_createTextInput(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
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
        props.readOnly = jsGetBool(ctx, argv[1], "readOnly", false);
        props.disabled = jsGetBool(ctx, argv[1], "disabled", false);
        props.drawStateLayer = jsGetBool(ctx, argv[1], "drawStateLayer", true);
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

    int id = g_nextNodeId++;
    g_nodes[id] = node;
    if (argc >= 1 && JS_IsObject(argv[0])) captureNodeClassName(ctx, id, argv[0]);
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
    int id = g_nextNodeId++;
    g_nodes[id] = node;
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
    int id = g_nextNodeId++;
    g_nodes[id] = node;
    if (argc >= 1 && JS_IsObject(argv[0])) captureNodeClassName(ctx, id, argv[0]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_createSafeArea(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    return JS_createView(ctx, JS_UNDEFINED, argc, argv);
}

JSValue JS_createStatusBar(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    raym3::v2::ViewProps props;
    props.style.display = raym3::v2::Display::None;
    if (argc >= 1 && JS_IsObject(argv[0]))
        props.style = raym3::v2::MergeStyles(props.style, parseStyle(ctx, argv[0]));
    auto node = raym3::v2::View(props);
    int id = g_nextNodeId++;
    g_nodes[id] = node;
    if (argc >= 1 && JS_IsObject(argv[0])) captureNodeClassName(ctx, id, argv[0]);
    return JS_NewInt32(ctx, id);
}

JSValue JS_createActivityIndicator(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    float size = 48.0f; // M3 spec: circular progress indicator is 48dp
    Color color = BLANK;
    bool wavy = true;
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
                prev = p;
            }
            DrawCircleV(first, capR, c);
            DrawCircleV(prev, capR, c);
        } else {
            DrawRing(center, inner, outer, start, start + sweep, 96, c);
            cap(start, c);
            cap(start + sweep, c);
        }
    });
    int id = g_nextNodeId++;
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
        int id = g_nextNodeId++;
        g_nativeControlStates[id] = {.kind = *nativeControl};
        controlProps.style.pointerEvents = raym3::v2::PointerEvents::None;

        if (argc >= 2 && JS_IsObject(argv[1])) {
            controlProps.style = parseStyle(ctx, argv[1]);
            controlProps.style.pointerEvents = raym3::v2::PointerEvents::None;
            updateNativeControlState(ctx, id, argv[1]);
            captureNodeClassName(ctx, id, argv[1]);
        }

        auto node = raym3::v2::Custom(controlProps, [id](Rectangle layout) {
            auto it = g_nativeControlStates.find(id);
            if (it == g_nativeControlStates.end()) return;

            NativeControlState& state = it->second;
            bool value = state.checked;
            bool changed = false;
            const char* label = state.label.empty() ? nullptr : state.label.c_str();

            // Ease the toggle animation toward the current checked value.
            float target = state.checked ? 1.0f : 0.0f;
            if (state.anim < 0.0f) state.anim = target; // snap on first frame
            float dt = GetFrameTime();
            if (dt <= 0.0f || dt > 0.1f) dt = 0.016f;
            state.anim += (target - state.anim) * std::min(1.0f, dt * 14.0f);

            switch (state.kind) {
            case NativeControlKind::Checkbox: {
                raym3::CheckboxOptions options;
                options.animProgress = state.anim;
                changed = raym3::CheckboxComponent::Render(label, layout, &value, &options);
                break;
            }
            case NativeControlKind::Switch: {
                raym3::SwitchOptions options;
                options.animProgress = state.anim;
                changed = raym3::SwitchComponent::Render(label, layout, &value, &options);
                break;
            }
            case NativeControlKind::RadioButton: {
                raym3::RadioButtonOptions options;
                options.animProgress = state.anim;
                changed = raym3::RadioButtonComponent::Render(label, layout, value, &options);
                if (changed) value = true;
                break;
            }
            case NativeControlKind::Slider: {
                const auto& scheme = raym3::Theme::GetColorScheme();
                float span = (state.maxValue - state.minValue);
                float opacity = state.disabled ? 0.38f : 1.0f;

                // --- drag input (self-contained; no global field-id) ---------
                float trackX = layout.x;
                float trackW = layout.width;
                if (!state.disabled && trackW > 0.0f) {
                    Vector2 m = GetMousePosition();
                    bool over = CheckCollisionPointRec(m, layout);
                    if (IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && over) state.dragging = true;
                    if (!IsMouseButtonDown(MOUSE_BUTTON_LEFT)) state.dragging = false;
                    if (state.dragging) {
                        float n = std::clamp((m.x - trackX) / trackW, 0.0f, 1.0f);
                        float nv = state.minValue + n * span;
                        if (state.step > 0.0f)
                            nv = state.minValue + std::round((nv - state.minValue) / state.step) * state.step;
                        nv = std::clamp(nv, state.minValue, state.maxValue);
                        if (nv != state.value) {
                            state.value = nv;
                            invokeChangeValueCallback(id, nv);
                        }
                    }
                }

                // --- paint (M3 XS track + handle) --------------------------
                float p = span > 0.0f ? std::clamp((state.value - state.minValue) / span, 0.0f, 1.0f) : 0.0f;
                float trackH = 16.0f;
                float handleW = state.dragging ? 2.0f : 4.0f;
                float handleH = 44.0f;
                float cy = layout.y + layout.height * 0.5f;
                float thumbX = trackX + p * trackW;
                thumbX = std::clamp(thumbX, trackX, trackX + trackW);
                float handleGap = 6.0f;
                float activeEnd = std::max(trackX, thumbX - handleW * 0.5f - handleGap);
                float inactiveStart = std::min(trackX + trackW, thumbX + handleW * 0.5f + handleGap);
                float innerRadius = 2.0f;
                if (activeEnd > trackX)
                    DrawSliderTrackSegment({trackX, cy - trackH * 0.5f, activeEnd - trackX, trackH}, trackH * 0.5f, innerRadius, ColorAlpha(scheme.primary, opacity));
                if (inactiveStart < trackX + trackW)
                    DrawSliderTrackSegment({inactiveStart, cy - trackH * 0.5f, trackX + trackW - inactiveStart, trackH}, innerRadius, trackH * 0.5f, ColorAlpha(scheme.secondaryContainer, opacity));
                Vector2 mouse = GetMousePosition();
                if (!state.disabled && CheckCollisionPointRec(mouse, layout))
                    DrawCircle((int)thumbX, (int)cy, 20.0f, ColorAlpha(scheme.primary, 0.12f));
                DrawRectangleRounded({thumbX - handleW * 0.5f, cy - handleH * 0.5f, handleW, handleH}, handleW * 0.5f, 8, ColorAlpha(scheme.primary, opacity));
                break;
            }
            }

            if (changed && !state.disabled) {
                state.checked = value;
                invokePressCallback(id);
            }
        });

        g_nodes[id] = node;
        return JS_NewInt32(ctx, id);
    }

    raym3::v2::ComponentProps props;
    if (argc >= 2 && JS_IsObject(argv[1])) props = parseMaterialProps(ctx, argv[1]);

    int id = g_nextNodeId++;
    props.onPress = [id]() { invokePressCallback(id); };

    g_nodes[id] = raym3::v2::MaterialComponent(*component, props);
    g_materialComponentKinds[id] = *component;
    if (argc >= 2 && JS_IsObject(argv[1])) captureNodeClassName(ctx, id, argv[1]);
    return JS_NewInt32(ctx, id);
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
        props.onPress = it->second->onPress;
        auto updated = raym3::v2::MaterialComponent(materialIt->second, props);
        it->second->style = updated->style;
        it->second->stateStyles = updated->stateStyles;
        it->second->motion = updated->motion;
        it->second->disabled = updated->disabled;
        it->second->zIndex = updated->zIndex;
        it->second->selected = updated->selected;
        it->second->role = updated->role;
    } else if (jsHasProperty(ctx, argv[1], "className") || jsHasProperty(ctx, argv[1], "style")) {
        it->second->style = parseStyle(ctx, argv[1]);
    }
    if (g_nativeControlStates.find(id) != g_nativeControlStates.end()) {
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
    children.push_back(child);
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

    appendChildPreservingNavLabel(pit->second, cit->second);
    g_nodeParents[childId] = parentId;
    return JS_UNDEFINED;
}

JSValue JS_removeChild(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "removeChild: expected (parentId, childId)");
    int parentId, childId;
    JS_ToInt32(ctx, &parentId, argv[0]);
    JS_ToInt32(ctx, &childId, argv[1]);

    auto pit = g_nodes.find(parentId);
    auto cit = g_nodes.find(childId);
    if (pit == g_nodes.end()) return JS_ThrowTypeError(ctx, "removeChild: invalid parent id");
    if (cit == g_nodes.end()) return JS_ThrowTypeError(ctx, "removeChild: invalid child id");

    auto& children = pit->second->children;
    children.erase(std::remove(children.begin(), children.end(), cit->second), children.end());
    g_nodeParents.erase(childId);
    return JS_UNDEFINED;
}

JSValue JS_insertBefore(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 3) return JS_ThrowTypeError(ctx, "insertBefore: expected (parentId, childId, beforeChildId)");
    int parentId, childId, beforeChildId;
    JS_ToInt32(ctx, &parentId, argv[0]);
    JS_ToInt32(ctx, &childId, argv[1]);
    JS_ToInt32(ctx, &beforeChildId, argv[2]);

    auto pit = g_nodes.find(parentId);
    auto cit = g_nodes.find(childId);
    auto bit = g_nodes.find(beforeChildId);
    if (pit == g_nodes.end()) return JS_ThrowTypeError(ctx, "insertBefore: invalid parent id");
    if (cit == g_nodes.end()) return JS_ThrowTypeError(ctx, "insertBefore: invalid child id");
    if (bit == g_nodes.end()) return JS_ThrowTypeError(ctx, "insertBefore: invalid beforeChild id");

    auto& children = pit->second->children;
    children.erase(std::remove(children.begin(), children.end(), cit->second), children.end());
    auto beforeIt = std::find(children.begin(), children.end(), bit->second);
    if (beforeIt == children.end()) {
        children.push_back(cit->second);
    } else {
        children.insert(beforeIt, cit->second);
    }
    g_nodeParents[childId] = parentId;
    return JS_UNDEFINED;
}

// writeRootThrough: every mutation of g_root is mirrored into
// g_screens[g_currentScreenId].root. This makes the per-screen slot the
// authoritative store: a stray clearRootNode/disposeNode for a non-current
// screen (e.g. an async React unmount of a popped route) can no longer
// null the live root of the currently-rendered screen.
static inline void writeRootThrough(const raym3::v2::NodePtr& node) {
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
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setRootNode: invalid node id");
    writeRootThrough(it->second);
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
    it->second->onPress = [id]() {
        auto cit = g_pressCallbacks.find(id);
        if (cit == g_pressCallbacks.end() || !g_bridge_ctx) return;
        JSValue result = JS_Call(g_bridge_ctx, cit->second, JS_UNDEFINED, 0, nullptr);
        if (JS_IsException(result)) {
            JSValue exc = JS_GetException(g_bridge_ctx);
            const char* s = JS_ToCString(g_bridge_ctx, exc);
            fprintf(stderr, "onPress error: %s\n", s ? s : "(unknown)");
            TraceLog(LOG_ERROR, "RAYACT_PRESS_CALLBACK_ERROR node=%d error=%s", id, s ? s : "(unknown)");
            if (s) JS_FreeCString(g_bridge_ctx, s);
            JS_FreeValue(g_bridge_ctx, exc);
        }
        JS_FreeValue(g_bridge_ctx, result);
    };
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
    if (g_nodes.find(id) == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnScroll: invalid node id");
    return setStoredCallback(ctx, id, argv[1], g_scrollCallbacks);
}

JSValue JS_setOnRequestClose(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setOnRequestClose: expected (nodeId, fn)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (g_nodes.find(id) == g_nodes.end()) return JS_ThrowTypeError(ctx, "setOnRequestClose: invalid node id");
    return setStoredCallback(ctx, id, argv[1], g_requestCloseCallbacks);
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
    if (g_materialComponentKinds.find(id) != g_materialComponentKinds.end())
        it->second->style = raym3::v2::MergeStyles(it->second->style, parsed);
    else
        it->second->style = parsed;
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

JSValue JS_disposeNode(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "disposeNode: expected (nodeId)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);

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
    g_nativeControlStates.erase(id);
    g_materialComponentKinds.erase(id);
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

    bool filled = true;
    if (argc >= 5 && !JS_IsUndefined(argv[4])) {
        const char* variant = JS_ToCString(ctx, argv[4]);
        if (variant) {
            std::string variantStr(variant);
            filled = variantStr != "outlined" && variantStr != "outline";
            JS_FreeCString(ctx, variant);
        }
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

    auto node = raym3::v2::Custom(props, [glyphStr, resolvedCp, size, color, filled](Rectangle layout) {
        // Prefer sprite sheet (single GPU batch for all icons).
        if (resolvedCp != 0 && g_iconSheet.id != 0) {
            IconKey key{resolvedCp, (int)roundf(size), filled};
            auto it = g_iconSheetRects.find(key);
            if (it != g_iconSheetRects.end()) {
                Rectangle src = it->second;
                // Atlas is a normal top-down texture (LoadTextureFromImage), so
                // no vertical flip needed when sampling.
                Rectangle drawSrc = {src.x, src.y, src.width, src.height};
                float x = layout.x + (layout.width  - src.width)  * 0.5f;
                float y = layout.y + (layout.height - src.height) * 0.5f;
                DrawTextureRec(g_iconSheet, drawSrc, {x, y}, color);
                return;
            }
        }
        // Fallback: direct glyph draw (before sprite sheet is built or for raw UTF-8).
        Font f = getIconFont((int)size, filled);
        Vector2 textSize = MeasureTextEx(f, glyphStr.c_str(), size, 0);
        float x = layout.x + (layout.width  - textSize.x) * 0.5f;
        float y = layout.y + (layout.height - textSize.y) * 0.5f;
        DrawTextEx(f, glyphStr.c_str(), {x, y}, size, 0, color);
    });

    int id = g_nextNodeId++;
    g_nodes[id] = node;
    if (argc >= 2 && JS_IsObject(argv[1])) captureNodeClassName(ctx, id, argv[1]);
    return JS_NewInt32(ctx, id);
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

    int id = g_nextNodeId++;
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

#if defined(RAYACT_ANDROID)
// Android builds: link against jni_bridge.cpp, which provides these symbols.
extern "C" {
extern int  rayactJniRequestNewSurface();
extern void rayactJniReleaseSurface(int surfaceId);
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

void cleanupRaym3Bridge(JSContext* ctx) {
    // Free all per-screen callback JSValues before clearing the maps.
    for (auto& [id, s] : g_screens) {
        for (auto& [k, v] : s.pressCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.changeTextCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.changeValueCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.scrollCallbacks) JS_FreeValue(ctx, v);
        for (auto& [k, v] : s.requestCloseCallbacks) JS_FreeValue(ctx, v);
    }
    for (auto& [id, fn] : g_pressCallbacks) JS_FreeValue(ctx, fn);
    g_pressCallbacks.clear();
    g_nodes.clear();
    g_nativeControlStates.clear();
    g_materialComponentKinds.clear();
    g_nodeClassNames.clear();
    g_changeTextCallbacks.clear();
    g_changeValueCallbacks.clear();
    g_scrollCallbacks.clear();
    g_requestCloseCallbacks.clear();
    g_screens.clear();
    g_screenStack.clear();
    g_root = nullptr;
    g_bridge_ctx = nullptr;
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
