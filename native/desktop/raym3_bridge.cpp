#include "raym3_bridge.hpp"
#include "css_bridge.hpp"

#include <raym3/v2/View.h>
#include <raym3/v2/Style.h>
#include <raym3/fonts/FontManager.h>
#include <raylib.h>

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <optional>
#include <set>
#include <string>
#include <vector>

// ─── globals ───────────────────────────────────────────────────────────────

std::map<int, raym3::v2::NodePtr> g_nodes;
raym3::v2::NodePtr g_root;
std::map<int, JSValue> g_pressCallbacks;
JSContext* g_bridge_ctx = nullptr;

static int g_nextNodeId = 1;
static std::vector<Texture2D> g_textures;

// ─── icon sprite sheet ─────────────────────────────────────────────────────
// All icons used by the app are rasterized once into a single RenderTexture.
// Rendering uses DrawTextureRec (one UV copy) instead of DrawTextEx (glyph
// lookup + advance loop). All icons on screen share one texture → Raylib
// batches every icon draw call into a single GPU draw.

struct IconKey {
    int cp;   // Unicode codepoint
    int size; // pixel size (float rounded to int)
    bool operator<(const IconKey& o) const {
        return cp != o.cp ? cp < o.cp : size < o.size;
    }
};

static std::map<int, Font>      g_iconFonts;    // size → Font
static std::set<int>            g_iconCPSet;    // codepoints loaded into fonts
static std::size_t              g_iconCPSetVer = 0;
static std::map<int, std::size_t> g_iconFontVer;

// Sprite sheet state — built once after JS init via buildIconSpriteSheet()
static std::set<IconKey>         g_iconRequests;  // (cp, size) pairs registered during init
static Texture2D                 g_iconSheet = {0};
static std::map<IconKey, Rectangle> g_iconSheetRects; // UV pixel rects in g_iconSheet

// Search order: static Material Icons first (PUA codepoints), then fallbacks.
// Material Symbols Rounded is a variable font — Raylib cannot index its PUA glyphs
// directly, so it must not be the first candidate.
static const char* kIconFontCandidates[] = {
    "./resources/fonts/MaterialIcons-Regular.ttf",
    "./resources/fonts/MaterialSymbolsRounded.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    nullptr
};

static const char* findIconFontPath() {
    for (int i = 0; kIconFontCandidates[i]; i++) {
        FILE* f = fopen(kIconFontCandidates[i], "rb");
        if (f) { fclose(f); return kIconFontCandidates[i]; }
    }
    return nullptr;
}

// Register a (codepoint, size) pair. Also invalidates font cache if new CP.
static void requireIcon(int cp, int size) {
    g_iconRequests.insert({cp, size});
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
static Font getIconFont(int size) {
    auto verIt = g_iconFontVer.find(size);
    if (verIt != g_iconFontVer.end() && verIt->second == g_iconCPSetVer) {
        return g_iconFonts[size]; // cache hit, CP set unchanged
    }

    // Unload stale entry for this size if present
    auto it = g_iconFonts.find(size);
    if (it != g_iconFonts.end() && it->second.texture.id != 0)
        ::UnloadFont(it->second);

    const char* path = findIconFontPath();
    Font font = {0};
    if (path && !g_iconCPSet.empty()) {
        std::vector<int> cps(g_iconCPSet.begin(), g_iconCPSet.end());
        font = LoadFontEx(path, size, cps.data(), (int)cps.size());
        printf("Icon font: loaded %d glyph(s) at size %d\n", (int)cps.size(), size);
    }
    if (font.texture.id == 0) font = GetFontDefault();
    g_iconFonts[size]    = font;
    g_iconFontVer[size]  = g_iconCPSetVer;
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

    // Measure each glyph and plan layout (single row for typical icon counts)
    struct Entry { IconKey key; char utf8[5]; float w, h, x; };
    std::vector<Entry> entries;
    float curX = PAD, maxH = 0;

    for (const auto& key : g_iconRequests) {
        Font font = getIconFont(key.size);
        char u8[5] = {};
        cpToUtf8(key.cp, u8);
        Vector2 sz = MeasureTextEx(font, u8, (float)key.size, 0);
        if (sz.x <= 0 || sz.y <= 0) continue;
        entries.push_back({key, {}, sz.x, sz.y, curX});
        std::memcpy(entries.back().utf8, u8, 5);
        curX += sz.x + PAD * 2;
        maxH = std::max(maxH, sz.y);
    }

    if (entries.empty()) return;

    // Round up to power-of-2 dimensions
    int texW = 1, texH = 1;
    int rawW = (int)curX + PAD, rawH = (int)maxH + PAD * 2;
    while (texW < rawW) texW <<= 1;
    while (texH < rawH) texH <<= 1;

    // Render all glyphs into a RenderTexture (OpenGL y-origin = bottom)
    RenderTexture2D rt = LoadRenderTexture(texW, texH);
    BeginTextureMode(rt);
    ClearBackground({0, 0, 0, 0});
    for (auto& e : entries) {
        Font font = getIconFont(e.key.size);
        float y = PAD; // screen-space y within render target
        DrawTextEx(font, e.utf8, {e.x, y}, (float)e.key.size, 0, WHITE);
        // RenderTexture is y-flipped: screen (x, y, w, h) → texture (x, texH-y-h, w, h)
        g_iconSheetRects[e.key] = {e.x, (float)(texH - (int)y - (int)e.h), e.w, e.h};
    }
    EndTextureMode();

    if (g_iconSheet.id != 0) UnloadTexture(g_iconSheet);
    g_iconSheet = rt.texture;
    // Don't UnloadRenderTexture — that would free the texture. Manage manually.

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
    std::optional<Color> result;
    if (!JS_IsUndefined(v) && !JS_IsNull(v)) {
        uint32_t c;
        if (JS_ToUint32(ctx, &c, v) == 0) result = colorFromUint(c);
    }
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
    if (auto v = jsGetColor(ctx, obj, "borderColor"))     s.borderColor     = v;
    if (auto v = jsGetFloat(ctx, obj, "borderWidth"))     s.borderWidth     = v;
    if (auto v = jsGetFloat(ctx, obj, "borderRadius"))    s.borderRadius    = v;
    if (auto v = jsGetFloat(ctx, obj, "opacity"))         s.opacity         = v;
    if (auto v = jsGetFloat(ctx, obj, "elevation"))       s.elevation       = v;

    // Transforms
    if (auto v = jsGetFloat(ctx, obj, "translateX")) s.translateX = v;
    if (auto v = jsGetFloat(ctx, obj, "translateY")) s.translateY = v;
    if (auto v = jsGetFloat(ctx, obj, "scale"))      s.scale      = v;

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

// ─── JS bridge functions ────────────────────────────────────────────────────

JSValue JS_createView(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    raym3::v2::ViewProps props;
    if (argc >= 1 && JS_IsObject(argv[0]))
        props.style = parseStyle(ctx, argv[0]);

    auto node = raym3::v2::View(props);
    int id = g_nextNodeId++;
    g_nodes[id] = node;
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
    return JS_NewInt32(ctx, id);
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

    pit->second->children.push_back(cit->second);
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
    return JS_UNDEFINED;
}

JSValue JS_setRootNode(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "setRootNode: expected (nodeId)");
    if (JS_IsNull(argv[0]) || JS_IsUndefined(argv[0])) {
        g_root = nullptr;
        return JS_UNDEFINED;
    }
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setRootNode: invalid node id");
    g_root = it->second;
    return JS_UNDEFINED;
}

JSValue JS_clearRootNode(JSContext*, JSValue, int, JSValueConst*) {
    g_root = nullptr;
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
            if (s) JS_FreeCString(g_bridge_ctx, s);
            JS_FreeValue(g_bridge_ctx, exc);
        }
        JS_FreeValue(g_bridge_ctx, result);
    };
    return JS_UNDEFINED;
}

JSValue JS_setStyle(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_ThrowTypeError(ctx, "setStyle: expected (nodeId, styleObj)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = g_nodes.find(id);
    if (it == g_nodes.end()) return JS_ThrowTypeError(ctx, "setStyle: invalid node id");
    it->second->style = parseStyle(ctx, argv[1]);
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

JSValue JS_disposeNode(JSContext* ctx, JSValue /*this_val*/, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_ThrowTypeError(ctx, "disposeNode: expected (nodeId)");
    int id;
    JS_ToInt32(ctx, &id, argv[0]);

    auto cb = g_pressCallbacks.find(id);
    if (cb != g_pressCallbacks.end()) {
        JS_FreeValue(ctx, cb->second);
        g_pressCallbacks.erase(cb);
    }

    auto it = g_nodes.find(id);
    if (it != g_nodes.end()) {
        if (g_root == it->second) g_root = nullptr;
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
                requireIcon(resolvedCp, (int)roundf(size));
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

    Color color = WHITE;
    if (argc >= 3 && !JS_IsUndefined(argv[2])) {
        uint32_t c; JS_ToUint32(ctx, &c, argv[2]);
        color = { (unsigned char)((c>>24)&0xFF), (unsigned char)((c>>16)&0xFF),
                  (unsigned char)((c>>8)&0xFF),  (unsigned char)(c&0xFF) };
    }

    raym3::v2::ViewProps props;
    if (argc >= 4) props.style = parseStyle(ctx, argv[3]);

    // Measure the glyph so Yoga can size the node correctly.
    Font f = getIconFont((int)size);
    Vector2 measured = MeasureTextEx(f, glyphStr.c_str(), size, 0);
    if (!props.style.width)  props.style.width  = measured.x;
    if (!props.style.height) props.style.height = measured.y;

    auto node = raym3::v2::Custom(props, [glyphStr, resolvedCp, size, color](Rectangle layout) {
        // Prefer sprite sheet (single GPU batch for all icons).
        if (resolvedCp != 0 && g_iconSheet.id != 0) {
            IconKey key{resolvedCp, (int)roundf(size)};
            auto it = g_iconSheetRects.find(key);
            if (it != g_iconSheetRects.end()) {
                Rectangle src = it->second;
                float x = layout.x + (layout.width  - src.width)  * 0.5f;
                float y = layout.y + (layout.height - src.height) * 0.5f;
                DrawTextureRec(g_iconSheet, src, {x, y}, color);
                return;
            }
        }
        // Fallback: direct glyph draw (before sprite sheet is built or for raw UTF-8).
        Font f = getIconFont((int)size);
        Vector2 textSize = MeasureTextEx(f, glyphStr.c_str(), size, 0);
        float x = layout.x + (layout.width  - textSize.x) * 0.5f;
        float y = layout.y + (layout.height - textSize.y) * 0.5f;
        DrawTextEx(f, glyphStr.c_str(), {x, y}, size, 0, color);
    });

    int id = g_nextNodeId++;
    g_nodes[id] = node;
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

// ─── lifecycle ──────────────────────────────────────────────────────────────

void cleanupRaym3Bridge(JSContext* ctx) {
    for (auto& [id, fn] : g_pressCallbacks) JS_FreeValue(ctx, fn);
    g_pressCallbacks.clear();
    g_nodes.clear();
    g_root = nullptr;
    g_bridge_ctx = nullptr;
    for (auto& tex : g_textures) UnloadTexture(tex);
    g_textures.clear();
    for (auto& [size, font] : g_iconFonts)
        if (font.texture.id != 0) UnloadFont(font);
    g_iconFonts.clear();
    g_iconFontVer.clear();
    g_iconCPSet.clear();
    g_iconCPSetVer = 0;
    g_iconRequests.clear();
    g_iconSheetRects.clear();
    if (g_iconSheet.id != 0) { UnloadTexture(g_iconSheet); g_iconSheet = {0}; }
}
