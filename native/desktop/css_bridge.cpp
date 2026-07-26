#include "css_bridge.hpp"
#include "color_parse.hpp"
#include "raym3_bridge.hpp"
#include "../core/engine.hpp"

#include "cssparser/CSSDeNest.h"
#include "cssparser/CSSParser.h"
#include "cssparser/CSSUtils.h"

#include <raym3/styles/Stylesheet.h>
#include <raym3/styles/Theme.h>
#include <raym3/v2/Animations.h>
#include <raym3/v2/Density.h>

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <functional>
#include <map>
#include <regex>
#include <sstream>
#include <string>
#include <vector>
#if defined(__APPLE__)
#include <TargetConditionals.h>
#endif

// ─── globals ──────────────────────────────────────────────────────────────────

using CSSPropMap = raym3::CSSPropMap;

// Defined in engine_js.cpp — the release/pack asset base dir importCSS resolves against.
namespace rayact { std::string rayactAssetBaseDir(); }

// ─── string helpers ───────────────────────────────────────────────────────────

static std::string trimStr(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return {};
    return s.substr(a, s.find_last_not_of(" \t\r\n") - a + 1);
}

static std::string toLower(std::string s) {
    for (char& c : s) c = (char)tolower((unsigned char)c);
    return s;
}

static std::string camelCase(const std::string& hyphen) {
    std::string out;
    bool cap = false;
    for (char c : hyphen) {
        if (c == '-') { cap = true; continue; }
        out += cap ? (char)toupper((unsigned char)c) : c;
        cap = false;
    }
    return out;
}

static std::vector<std::string> splitTrim(const std::string& s, char delim) {
    std::vector<std::string> parts;
    std::istringstream ss(s);
    std::string part;
    while (std::getline(ss, part, delim)) {
        std::string t = trimStr(part);
        if (!t.empty()) parts.push_back(t);
    }
    return parts;
}

static std::string cleanValue(std::string v) {
    size_t imp = v.find("!important");
    if (imp != std::string::npos) v = v.substr(0, imp);
    return trimStr(v);
}

// ─── value parsers ────────────────────────────────────────────────────────────

static bool isAuto(const std::string& v) {
    return toLower(trimStr(v)) == "auto";
}

float parseCssLengthToLayoutDp(const std::string& v) {
    if (v.empty()) return 0.0f;
    try {
        size_t idx;
        float f = std::stof(v, &idx);
        std::string unit = toLower(trimStr(v.substr(idx)));
        if (unit == "rem") f *= 16.0f;
        if (unit == "px" || unit == "rem")
            return raym3::v2::Density::CssReferencePxToLayoutDp(f);
        return f;
    } catch (...) { return 0.0f; }
}

static float parseLength(const std::string& v) {
    return parseCssLengthToLayoutDp(v);
}

static std::vector<std::string> expandEdgeParts(const std::vector<std::string>& parts) {
    if (parts.empty()) return {};
    if (parts.size() == 1) return {parts[0], parts[0], parts[0], parts[0]};
    if (parts.size() == 2) return {parts[0], parts[1], parts[0], parts[1]};
    if (parts.size() == 3) return {parts[0], parts[1], parts[2], parts[1]};
    return {parts[0], parts[1], parts[2], parts[3]};
}

// Expand any var(--name[, fallback]) against the stylesheet's custom properties,
// honouring the active colour scheme so light/dark variants resolve correctly.
static std::string substituteVars(const std::string& value) {
    return raym3::Stylesheet::Global().SubstituteVars(value, raym3::Theme::IsDarkMode());
}

// ─── calc() ───────────────────────────────────────────────────────────────────
// Tailwind v4 emits calc() constantly (`calc(var(--spacing) * 4)`, unitless
// line-height ratios, …), so every value is folded to a plain number before the
// property parsers see it. Runs AFTER var substitution, so `var()` inside a
// calc is already a literal by this point.
//
// Arithmetic is done in CSS reference px (rem -> 16px); the result keeps `px`
// when any operand carried a length unit and stays unitless otherwise, which is
// what distinguishes `calc(var(--spacing)*4)` from `calc(1.75/1.125)`.
namespace {

struct CalcParser {
    const std::string& s;
    size_t i = 0;
    bool ok = true;
    bool sawUnit = false;

    explicit CalcParser(const std::string& str) : s(str) {}

    void skipSpace() { while (i < s.size() && isspace((unsigned char)s[i])) i++; }

    // number with an optional css unit
    double parsePrimary() {
        skipSpace();
        if (i < s.size() && s[i] == '(') {
            i++;
            double v = parseSum();
            skipSpace();
            if (i < s.size() && s[i] == ')') i++; else ok = false;
            return v;
        }
        if (i < s.size() && (s[i] == '-' || s[i] == '+')) {
            bool neg = s[i] == '-';
            i++;
            double v = parsePrimary();
            return neg ? -v : v;
        }
        size_t start = i;
        while (i < s.size() && (isdigit((unsigned char)s[i]) || s[i] == '.')) i++;
        if (i == start) { ok = false; return 0.0; }
        double v = 0.0;
        try { v = std::stod(s.substr(start, i - start)); } catch (...) { ok = false; }
        size_t unitStart = i;
        while (i < s.size() && isalpha((unsigned char)s[i])) i++;
        if (i > unitStart) {
            std::string unit = toLower(s.substr(unitStart, i - unitStart));
            if (unit == "rem") { v *= 16.0; sawUnit = true; }
            else if (unit == "px") { sawUnit = true; }
            else ok = false;               // unsupported unit (%, vw, …)
        }
        return v;
    }

    double parseProduct() {
        double v = parsePrimary();
        for (;;) {
            skipSpace();
            if (i < s.size() && (s[i] == '*' || s[i] == '/')) {
                char op = s[i++];
                double rhs = parsePrimary();
                if (op == '*') v *= rhs;
                else if (rhs != 0.0) v /= rhs;
                else ok = false;
            } else return v;
        }
    }

    double parseSum() {
        double v = parseProduct();
        for (;;) {
            skipSpace();
            // +/- must be surrounded by whitespace in CSS calc; a bare '-' here
            // would already have been consumed as a sign by parsePrimary.
            if (i < s.size() && (s[i] == '+' || s[i] == '-')) {
                char op = s[i++];
                double rhs = parseProduct();
                v = (op == '+') ? v + rhs : v - rhs;
            } else return v;
        }
    }
};

std::string formatCalcResult(double v, bool hasUnit) {
    char buf[64];
    snprintf(buf, sizeof(buf), "%.4f", v);
    std::string out(buf);
    // trim trailing zeros so downstream parsers see clean numbers
    if (out.find('.') != std::string::npos) {
        out.erase(out.find_last_not_of('0') + 1);
        if (!out.empty() && out.back() == '.') out.pop_back();
    }
    if (hasUnit) out += "px";
    return out;
}

} // namespace

// Replace every calc(...) in `value` with its computed result. Innermost calls
// resolve first, so nested calc() works. An expression we cannot evaluate is
// left untouched rather than zeroed.
static std::string evaluateCalc(const std::string& value) {
    if (value.find("calc(") == std::string::npos) return value;
    std::string cur = value;
    for (int guard = 0; guard < 8; guard++) {
        size_t start = cur.rfind("calc(");   // rfind -> innermost first
        if (start == std::string::npos) break;
        size_t open = start + 4;
        int depth = 0;
        size_t end = std::string::npos;
        for (size_t j = open; j < cur.size(); j++) {
            if (cur[j] == '(') depth++;
            else if (cur[j] == ')') { if (--depth == 0) { end = j; break; } }
        }
        if (end == std::string::npos) break;
        std::string inner = cur.substr(open + 1, end - open - 1);
        CalcParser p(inner);
        double v = p.parseSum();
        p.skipSpace();
        if (!p.ok || p.i != inner.size()) {
            // Unevaluable (percentages, unknown units): drop the calc() wrapper
            // so the plain parsers get a shot at the inner value.
            cur = cur.substr(0, start) + inner + cur.substr(end + 1);
            continue;
        }
        cur = cur.substr(0, start) + formatCalcResult(v, p.sawUnit) + cur.substr(end + 1);
    }
    return cur;
}

static uint32_t parseColor(const std::string& raw) {
    return ParseCssColor(raw);
}

static std::vector<float> parseEdgeShorthand(const std::string& v) {
    auto parts = splitTrim(v, ' ');
    std::vector<float> vals;
    for (auto& p : parts) vals.push_back(parseLength(p));
    if (vals.empty()) return {0,0,0,0};
    if (vals.size() == 1) return {vals[0],vals[0],vals[0],vals[0]};
    if (vals.size() == 2) return {vals[0],vals[1],vals[0],vals[1]};
    if (vals.size() == 3) return {vals[0],vals[1],vals[2],vals[1]};
    return {vals[0],vals[1],vals[2],vals[3]};
}

// ─── transition shorthand ─────────────────────────────────────────────────────

// Split on `delim` at paren depth 0 (commas occur inside var() and
// cubic-bezier()).
static std::vector<std::string> splitTopLevel(const std::string& s, char delim) {
    std::vector<std::string> out;
    int depth = 0;
    std::string cur;
    for (char c : s) {
        if (c == '(') depth++;
        else if (c == ')') depth--;
        if (c == delim && depth == 0) {
            std::string t = trimStr(cur);
            if (!t.empty()) out.push_back(t);
            cur.clear();
        } else {
            cur += c;
        }
    }
    std::string t = trimStr(cur);
    if (!t.empty()) out.push_back(t);
    return out;
}

static std::optional<raym3::v2::TransitionProperty>
transitionPropertyFromName(const std::string& name) {
    using P = raym3::v2::TransitionProperty;
    static const std::map<std::string, P> kMap = {
        {"margin-top", P::MarginTop},       {"margin-right", P::MarginRight},
        {"margin-bottom", P::MarginBottom}, {"margin-left", P::MarginLeft},
        {"top", P::InsetTop},               {"right", P::InsetRight},
        {"bottom", P::InsetBottom},         {"left", P::InsetLeft},
        {"opacity", P::Opacity},
        {"translate-x", P::TranslateX},     {"translate-y", P::TranslateY},
        {"scale", P::Scale},                {"rotation", P::Rotation},
        {"width", P::Width},                {"height", P::Height},
    };
    auto it = kMap.find(name);
    if (it == kMap.end()) return std::nullopt;
    return it->second;
}

// "250ms" → 250, "0.3s" → 300, "-0.5s" → -500, "var(--x, 250ms)" → 250.
// `allowNegative` keeps the sign (animation-delay may be negative = start the
// animation partway through); otherwise negatives clamp to 0 (transition delay).
static std::optional<float> parseCssTimeMs(const std::string& tok, bool allowNegative = false) {
    std::string v = tok;
    if (v.rfind("var(", 0) == 0) {
        size_t comma = v.find(',');
        size_t close = v.rfind(')');
        if (comma == std::string::npos || close == std::string::npos) return std::nullopt;
        v = trimStr(v.substr(comma + 1, close - comma - 1));
    }
    try {
        size_t idx;
        float num = std::stof(v, &idx);
        std::string unit = toLower(trimStr(v.substr(idx)));
        if (unit == "s") num *= 1000.0f;
        else if (unit != "ms" && !unit.empty()) return std::nullopt;
        return allowNegative ? num : std::max(0.0f, num);
    } catch (...) {
        return std::nullopt;
    }
}

static bool parseCssEasing(const std::string& tok, raym3::v2::TransitionEntry& e) {
    if (tok.rfind("cubic-bezier(", 0) == 0) {
        size_t close = tok.rfind(')');
        if (close == std::string::npos) return false;
        auto nums = splitTrim(tok.substr(13, close - 13), ',');
        if (nums.size() != 4) return false;
        try {
            e.x1 = std::stof(nums[0]); e.y1 = std::stof(nums[1]);
            e.x2 = std::stof(nums[2]); e.y2 = std::stof(nums[3]);
        } catch (...) { return false; }
        return true;
    }
    if (tok == "linear")      { e.x1 = 0.0f;  e.y1 = 0.0f; e.x2 = 1.0f;  e.y2 = 1.0f; return true; }
    if (tok == "ease")        { e.x1 = 0.25f; e.y1 = 0.1f; e.x2 = 0.25f; e.y2 = 1.0f; return true; }
    if (tok == "ease-in")     { e.x1 = 0.42f; e.y1 = 0.0f; e.x2 = 1.0f;  e.y2 = 1.0f; return true; }
    if (tok == "ease-out")    { e.x1 = 0.0f;  e.y1 = 0.0f; e.x2 = 0.58f; e.y2 = 1.0f; return true; }
    if (tok == "ease-in-out") { e.x1 = 0.42f; e.y1 = 0.0f; e.x2 = 0.58f; e.y2 = 1.0f; return true; }
    return false;
}

std::optional<std::vector<raym3::v2::TransitionEntry>>
parseTransitionShorthand(const std::string& value) {
    using P = raym3::v2::TransitionProperty;
    std::string v = trimStr(value);
    if (v.empty()) return std::nullopt;
    if (toLower(v) == "none") return std::vector<raym3::v2::TransitionEntry>{};

    std::vector<raym3::v2::TransitionEntry> entries;
    for (const std::string& segment : splitTopLevel(v, ',')) {
        auto tokens = splitTopLevel(segment, ' ');
        if (tokens.empty()) continue;

        std::vector<P> props;
        std::string firstTok = toLower(tokens[0]);
        if (firstTok == "all") {
            for (uint8_t i = 0; i < (uint8_t)P::Count; ++i) props.push_back((P)i);
        } else if (auto p = transitionPropertyFromName(firstTok)) {
            props.push_back(*p);
        } else {
            continue; // unknown / unsupported property — skip segment
        }

        raym3::v2::TransitionEntry proto;
        bool haveDuration = false;
        for (size_t i = 1; i < tokens.size(); ++i) {
            if (parseCssEasing(toLower(tokens[i]), proto)) continue;
            if (auto ms = parseCssTimeMs(tokens[i])) {
                if (!haveDuration) { proto.durationMs = *ms; haveDuration = true; }
                else proto.delayMs = *ms;
            }
        }

        for (P p : props) {
            raym3::v2::TransitionEntry e = proto;
            e.property = p;
            entries.push_back(e);
        }
    }
    if (entries.empty()) return std::nullopt;
    return entries;
}

// Set cubic-bezier control points from a timing-function token. Returns true if
// the token was a recognized easing (so shorthand parsing can consume it).
static bool parseEasingXY(const std::string& tok, float& x1, float& y1, float& x2, float& y2) {
    raym3::v2::TransitionEntry e;
    if (!parseCssEasing(tok, e)) return false;
    x1 = e.x1; y1 = e.y1; x2 = e.x2; y2 = e.y2;
    return true;
}

// Parse the CSS `animation` shorthand into AnimationEntry specs, e.g.
//   "pulse 1s ease-in-out infinite", "spin 2s linear infinite alternate",
//   "fade 300ms 100ms both". Token order is flexible per the CSS grammar; the
//   first time is duration, the second is delay. "none" cancels (empty vector).
std::optional<std::vector<raym3::v2::AnimationEntry>>
parseAnimationShorthand(const std::string& value) {
    using A = raym3::v2::AnimationEntry;
    std::string v = trimStr(value);
    if (v.empty()) return std::nullopt;
    if (toLower(v) == "none") return std::vector<A>{};

    std::vector<A> entries;
    for (const std::string& segment : splitTopLevel(v, ',')) {
        A a;
        bool haveDuration = false, haveName = false, haveIter = false;
        for (const std::string& rawTok : splitTopLevel(segment, ' ')) {
            std::string tok = trimStr(rawTok);
            if (tok.empty()) continue;
            std::string low = toLower(tok);

            if (parseEasingXY(low, a.x1, a.y1, a.x2, a.y2)) continue;
            if (auto ms = parseCssTimeMs(tok, /*allowNegative=*/true)) {
                // First time is duration (clamped ≥0); second is delay, which
                // may be negative (starts the animation partway through — used
                // to stagger many elements out of phase).
                if (!haveDuration) { a.durationMs = std::max(0.0f, *ms); haveDuration = true; }
                else a.delayMs = *ms;
                continue;
            }
            if (low == "infinite") { a.iterationCount = -1.0f; haveIter = true; continue; }
            if (low == "normal")            { a.direction = raym3::v2::AnimationDirection::Normal; continue; }
            if (low == "reverse")           { a.direction = raym3::v2::AnimationDirection::Reverse; continue; }
            if (low == "alternate")         { a.direction = raym3::v2::AnimationDirection::Alternate; continue; }
            if (low == "alternate-reverse") { a.direction = raym3::v2::AnimationDirection::AlternateReverse; continue; }
            if (low == "forwards")  { a.fill = raym3::v2::AnimationFill::Forwards; continue; }
            if (low == "backwards") { a.fill = raym3::v2::AnimationFill::Backwards; continue; }
            if (low == "both")      { a.fill = raym3::v2::AnimationFill::Both; continue; }
            if (low == "none" && !haveName) { /* fill/name 'none' as fill */ a.fill = raym3::v2::AnimationFill::None; continue; }
            // A bare number that isn't a time = iteration-count.
            if (!haveIter) {
                try { size_t idx; float n = std::stof(low, &idx);
                      if (idx == low.size()) { a.iterationCount = std::max(0.0f, n); haveIter = true; continue; }
                } catch (...) {}
            }
            // Anything else is the @keyframes name (first such token wins).
            if (!haveName) { a.name = tok; haveName = true; }
        }
        if (haveName) entries.push_back(std::move(a));
    }
    if (entries.empty()) return std::nullopt;
    return entries;
}

// Parse one @keyframes stop selector ("from"/"to"/"NN%") to an offset in [0,1].
static bool parseKeyframeOffset(const std::string& sel, float& out) {
    std::string s = toLower(trimStr(sel));
    if (s == "from") { out = 0.0f; return true; }
    if (s == "to")   { out = 1.0f; return true; }
    if (!s.empty() && s.back() == '%') {
        try { out = std::clamp(std::stof(s.substr(0, s.size() - 1)) / 100.0f, 0.0f, 1.0f); return true; }
        catch (...) { return false; }
    }
    return false;
}

// Convert one keyframe declaration (prop:value) to a (TransitionProperty,float)
// pair, if the property is animatable. Length props go through parseLength (dp);
// unitless props (opacity/scale/rotation) parse as plain floats.
static bool parseKeyframeValue(const std::string& prop, const std::string& value,
                               std::pair<raym3::v2::TransitionProperty, float>& out) {
    auto p = transitionPropertyFromName(prop);
    if (!p) return false;
    using P = raym3::v2::TransitionProperty;
    bool isLength = (*p == P::TranslateX || *p == P::TranslateY || *p == P::Width ||
                     *p == P::Height || *p == P::MarginTop || *p == P::MarginRight ||
                     *p == P::MarginBottom || *p == P::MarginLeft || *p == P::InsetTop ||
                     *p == P::InsetRight || *p == P::InsetBottom || *p == P::InsetLeft);
    float v;
    if (isLength) v = parseLength(value);
    else { try { v = std::stof(trimStr(value)); } catch (...) { return false; } }
    out = { *p, v };
    return true;
}

// ─── JS object builder ────────────────────────────────────────────────────────

static JSValue buildStyleObject(JSContext* ctx, const CSSPropMap& props) {
    JSValue obj     = JS_NewObject(ctx);
    JSValue textObj = JS_NewObject(ctx);
    bool hasText    = false;

    for (auto& [prop, rawVal] : props) {
        std::string val = evaluateCalc(cleanValue(substituteVars(rawVal)));
        if (val.empty()) continue;

        // ── transition shorthand: pass raw string through; applyStyleProps
        // parses it into Style::transitions ──────────────────────────────
        if (prop == "transition") {
            JS_SetPropertyStr(ctx, obj, "transition", JS_NewString(ctx, val.c_str()));
            continue;
        }
        // ── animation shorthand: pass raw string; parseStyle parses it into
        // Style::animations (looked up against the @keyframes registry) ──────
        if (prop == "animation") {
            JS_SetPropertyStr(ctx, obj, "animation", JS_NewString(ctx, val.c_str()));
            continue;
        }

        // ── text sub-properties ──────────────────────────────────────────
        if (prop == "color")           { JS_SetPropertyStr(ctx, textObj, "color",        JS_NewFloat64(ctx, parseColor(val)));  hasText=true; continue; }
        if (prop == "font-size")       { JS_SetPropertyStr(ctx, textObj, "fontSize",     JS_NewFloat64(ctx, parseLength(val))); hasText=true; continue; }
        if (prop == "line-height")     { JS_SetPropertyStr(ctx, textObj, "lineHeight",   JS_NewFloat64(ctx, parseLength(val))); hasText=true; continue; }
        if (prop == "letter-spacing")  { JS_SetPropertyStr(ctx, textObj, "letterSpacing",JS_NewFloat64(ctx, parseLength(val))); hasText=true; continue; }
        // Passed through as strings; applyStyleProps maps them onto the
        // TextStyle enums (weight accepts both names and numeric 100..900).
        if (prop == "font-weight")     { JS_SetPropertyStr(ctx, textObj, "fontWeight",   JS_NewString(ctx, val.c_str())); hasText=true; continue; }
        if (prop == "font-style")      { JS_SetPropertyStr(ctx, textObj, "fontStyle",    JS_NewString(ctx, toLower(val).c_str())); hasText=true; continue; }
        if (prop == "text-align")      { JS_SetPropertyStr(ctx, textObj, "textAlign",    JS_NewString(ctx, toLower(val).c_str())); hasText=true; continue; }
        if (prop == "font-family") {
            // Strip surrounding quotes: "Roboto" → Roboto, 'My Font' → My Font
            std::string name = val;
            if (name.size() >= 2 && (name.front() == '"' || name.front() == '\''))
                name = name.substr(1, name.size() - 2);
            JS_SetPropertyStr(ctx, textObj, "fontFamily", JS_NewString(ctx, name.c_str()));
            hasText = true;
            continue;
        }

        // ── color properties ─────────────────────────────────────────────
        if (prop == "background-color" || prop == "border-color" ||
            prop == "state-layer-color" || prop == "ripple-color") {
            JS_SetPropertyStr(ctx, obj, camelCase(prop).c_str(), JS_NewFloat64(ctx, parseColor(val)));
            continue;
        }

        if (prop == "background") {
            std::string lower = toLower(val);
            if (lower.find("linear-gradient(") != std::string::npos) {
                JS_SetPropertyStr(ctx, obj, "backgroundGradientCss", JS_NewString(ctx, val.c_str()));
            } else {
                JS_SetPropertyStr(ctx, obj, "backgroundColor", JS_NewFloat64(ctx, parseColor(val)));
            }
            continue;
        }

        if (prop == "backdrop-filter" || prop == "-webkit-backdrop-filter") {
            JS_SetPropertyStr(ctx, obj, "backdropFilterCss", JS_NewString(ctx, val.c_str()));
            continue;
        }

        if (prop == "box-shadow") {
            JS_SetPropertyStr(ctx, obj, "boxShadowCss", JS_NewString(ctx, val.c_str()));
            continue;
        }

        if (prop == "border") {
            auto parts = splitTrim(val, ' ');
            if (!parts.empty()) JS_SetPropertyStr(ctx, obj, "borderWidth", JS_NewFloat64(ctx, parseLength(parts[0])));
            // The colour cannot be taken as "the last space-separated token":
            // functional colours contain spaces (`2px solid oklch(0.6 0.2 25)`).
            // Match the colour token instead.
            static const std::regex borderColorRe(CssColorTokenPattern(), std::regex::icase);
            std::smatch m;
            if (std::regex_search(val, m, borderColorRe))
                JS_SetPropertyStr(ctx, obj, "borderColor", JS_NewFloat64(ctx, parseColor(m.str())));
            continue;
        }
        if (prop == "border-width" || prop == "border-top-width" ||
            prop == "border-right-width" || prop == "border-bottom-width" ||
            prop == "border-left-width") {
            JS_SetPropertyStr(ctx, obj, "borderWidth", JS_NewFloat64(ctx, parseLength(val)));
            continue;
        }

        // ── flex shorthand ────────────────────────────────────────────────
        if (prop == "flex") {
            auto parts = splitTrim(val, ' ');
            if (parts.size() == 1) {
                float grow = 0.0f;
                try { grow = std::stof(parts[0]); } catch (...) {}
                JS_SetPropertyStr(ctx, obj, "flexGrow",   JS_NewFloat64(ctx, grow));
                JS_SetPropertyStr(ctx, obj, "flexShrink", JS_NewFloat64(ctx, 1.0));
                JS_SetPropertyStr(ctx, obj, "flexBasis",  JS_NewFloat64(ctx, 0.0));
            } else if (parts.size() >= 3) {
                JS_SetPropertyStr(ctx, obj, "flexGrow",   JS_NewFloat64(ctx, parseLength(parts[0])));
                JS_SetPropertyStr(ctx, obj, "flexShrink", JS_NewFloat64(ctx, parseLength(parts[1])));
                JS_SetPropertyStr(ctx, obj, "flexBasis",  JS_NewFloat64(ctx, parseLength(parts[2])));
            }
            continue;
        }

        // ── edge shorthand ────────────────────────────────────────────────
        if (prop == "padding" || prop == "margin") {
            auto parts = splitTrim(val, ' ');
            if (prop == "margin") {
                if (parts.size() == 1 && isAuto(parts[0])) {
                    JS_SetPropertyStr(ctx, obj, "margin", JS_NewString(ctx, "auto"));
                    continue;
                }
                bool anyAuto = false;
                for (auto& p : parts) if (isAuto(p)) anyAuto = true;
                if (anyAuto) {
                    auto sides = expandEdgeParts(parts);
                    JSValue ev = JS_NewObject(ctx);
                    const char* keys[] = {"top", "right", "bottom", "left"};
                    for (int i = 0; i < 4; ++i) {
                        if (isAuto(sides[i]))
                            JS_SetPropertyStr(ctx, ev, keys[i], JS_NewString(ctx, "auto"));
                        else
                            JS_SetPropertyStr(ctx, ev, keys[i], JS_NewFloat64(ctx, parseLength(sides[i])));
                    }
                    JS_SetPropertyStr(ctx, obj, "margin", ev);
                    continue;
                }
            }
            auto vals = parseEdgeShorthand(val);
            if (vals[0]==vals[1] && vals[1]==vals[2] && vals[2]==vals[3]) {
                JS_SetPropertyStr(ctx, obj, prop.c_str(), JS_NewFloat64(ctx, vals[0]));
            } else {
                JSValue ev = JS_NewObject(ctx);
                JS_SetPropertyStr(ctx, ev, "top",    JS_NewFloat64(ctx, vals[0]));
                JS_SetPropertyStr(ctx, ev, "right",  JS_NewFloat64(ctx, vals[1]));
                JS_SetPropertyStr(ctx, ev, "bottom", JS_NewFloat64(ctx, vals[2]));
                JS_SetPropertyStr(ctx, ev, "left",   JS_NewFloat64(ctx, vals[3]));
                JS_SetPropertyStr(ctx, obj, prop.c_str(), ev);
            }
            continue;
        }

        // ── individual edge sides ─────────────────────────────────────────
        if (prop.rfind("margin-", 0) == 0) {
            std::string jsKey = camelCase(prop);
            if (isAuto(val))
                JS_SetPropertyStr(ctx, obj, jsKey.c_str(), JS_NewString(ctx, "auto"));
            else
                JS_SetPropertyStr(ctx, obj, jsKey.c_str(), JS_NewFloat64(ctx, parseLength(val)));
            continue;
        }
        if (prop.rfind("padding-", 0) == 0) {
            size_t dash = prop.rfind('-');
            std::string parentKey = prop.substr(0, dash);
            std::string subKey    = prop.substr(dash + 1);
            JSValue existing = JS_GetPropertyStr(ctx, obj, parentKey.c_str());
            JSValue edgeObj = JS_IsObject(existing) ? existing : JS_NewObject(ctx);
            if (!JS_IsObject(existing)) JS_FreeValue(ctx, existing);
            JS_SetPropertyStr(ctx, edgeObj, subKey.c_str(), JS_NewFloat64(ctx, parseLength(val)));
            JS_SetPropertyStr(ctx, obj, parentKey.c_str(), edgeObj);
            continue;
        }

        // ── numeric / length properties ───────────────────────────────────
        static const std::vector<std::string> kLength = {
            "width","height","min-width","min-height","max-width","max-height",
            "border-radius","flex-grow","flex-shrink","flex-basis",
            "gap","row-gap","column-gap","opacity","elevation","scale",
            "translate-x","translate-y","top","right","bottom","left",
        };
        if (std::find(kLength.begin(), kLength.end(), prop) != kLength.end()) {
            JS_SetPropertyStr(ctx, obj, camelCase(prop).c_str(), JS_NewFloat64(ctx, parseLength(val)));
            continue;
        }

        // ── string / enum properties ──────────────────────────────────────
        static const std::vector<std::string> kString = {
            "flex-direction","flex-wrap","justify-content","align-items","align-self",
            "display","position","overflow","pointer-events",
        };
        if (std::find(kString.begin(), kString.end(), prop) != kString.end()) {
            JS_SetPropertyStr(ctx, obj, camelCase(prop).c_str(), JS_NewString(ctx, val.c_str()));
            continue;
        }
    }

    if (hasText) {
        JS_SetPropertyStr(ctx, obj, "text", textObj);
    } else {
        JS_FreeValue(ctx, textObj);
    }
    return obj;
}

// ─── @font-face / URL font loading ────────────────────────────────────────────

static void parseCSSIntoStylesheet(const std::string& css,
                                    const std::string& basePath = ".");

static bool ensureDirExists(const std::string& dir) {
    std::error_code ec;
    std::filesystem::create_directories(dir, ec);
    return std::filesystem::is_directory(dir);
}

static std::string urlCacheKey(const std::string& url) {
    std::size_t h = std::hash<std::string>{}(url);
    char buf[32]; std::snprintf(buf, sizeof(buf), "%016zx", h);
    return std::string(buf);
}

// Download url → outPath via curl. userAgent optional. Returns true on success.
// The URL is interpolated into a shell command below, so anything outside the
// RFC 3986 character set (quotes, $, backticks, ;, whitespace…) is rejected
// rather than escaped — a stylesheet is untrusted input as far as this is
// concerned, and no legitimate font URL needs those characters.
static bool isShellSafeUrl(const std::string& url) {
    if (url.size() > 2048) return false;
    for (unsigned char c : url) {
        bool ok = isalnum(c) || strchr("-._~:/?#[]@!$&'()*+,;=%", c) != nullptr;
        // '$', '&', ';', '\'' and '(' ')' are valid in URLs but dangerous in a
        // shell string; drop them too since fonts never use them.
        if (strchr("$&;'()", c)) ok = false;
        if (!ok) return false;
    }
    return true;
}

static bool curlDownload(const std::string& url, const std::string& outPath,
                         const std::string& userAgent = {}) {
    if (!isShellSafeUrl(url)) {
        fprintf(stderr, "Font: refusing unsafe URL '%s'\n", url.c_str());
        return false;
    }
#if TARGET_OS_IPHONE
    (void)url;
    (void)outPath;
    (void)userAgent;
    return false;
#else
    std::string cmd = "curl -s -L -f";
    if (!userAgent.empty()) cmd += " -A \"" + userAgent + "\"";
    cmd += " -o \"" + outPath + "\" \"" + url + "\" 2>/dev/null";
    return system(cmd.c_str()) == 0 && std::filesystem::exists(outPath);
#endif
}

// Fetch URL contents as string. Uses a temp file internally.
static std::string curlFetch(const std::string& url,
                              const std::string& userAgent = {}) {
    static int seq = 0;
    std::string tmp = "/tmp/rayact_cssfetch_" + std::to_string(seq++) + ".tmp";
    if (!curlDownload(url, tmp, userAgent)) return {};
    std::string out;
    FILE* f = fopen(tmp.c_str(), "rb");
    if (f) {
        fseek(f, 0, SEEK_END); long sz = ftell(f); fseek(f, 0, SEEK_SET);
        out.resize((size_t)sz); fread(&out[0], 1, sz, f); fclose(f);
    }
    std::filesystem::remove(tmp);
    return out;
}

struct FontSrcEntry { std::string url, format; };

// Parse @font-face src: value → list of {url, format} entries.
static std::vector<FontSrcEntry> parseFontSrc(const std::string& src) {
    std::vector<FontSrcEntry> result;
    std::size_t i = 0;
    while (i < src.size()) {
        std::size_t u = src.find("url(", i);
        if (u == std::string::npos) break;
        std::size_t s = u + 4;
        char q = (s < src.size() && (src[s]=='\'' || src[s]=='"')) ? src[s++] : 0;
        std::size_t e = q ? src.find(q, s) : src.find(')', s);
        if (e == std::string::npos) break;
        std::string url = src.substr(s, e - s);
        i = src.find(')', e) + 1;
        // Look for format(...) before the next comma
        std::string fmt;
        std::size_t nextComma = src.find(',', u);
        std::size_t fPos = src.find("format(", i);
        if (fPos != std::string::npos && (nextComma == std::string::npos || fPos < nextComma)) {
            std::size_t fs = fPos + 7;
            if (fs < src.size() && (src[fs]=='\'' || src[fs]=='"')) fs++;
            std::size_t fe = src.find_first_of("'\")", fs);
            if (fe != std::string::npos) { fmt = src.substr(fs, fe - fs); i = src.find(')', fe)+1; }
        }
        result.push_back({url, fmt});
    }
    return result;
}

// Pick best URL for Raylib (prefers TTF/OTF; WOFF2 unsupported).
static std::string pickFontUrl(const std::vector<FontSrcEntry>& entries) {
    for (const auto& e : entries)
        if (e.format == "truetype" || e.format == "opentype") return e.url;
    for (const auto& e : entries)
        if (e.url.find(".ttf") != std::string::npos ||
            e.url.find(".otf") != std::string::npos) return e.url;
    for (const auto& e : entries)
        if (e.format.empty()) return e.url;
    return {};
}

static const std::string kFontCacheDir = "./resources/fonts/cache/";

// Resolve a font URL to a local path — downloading and caching if remote.
static std::string resolveFontUrl(const std::string& url,
                                  const std::string& basePath) {
    if (url.empty()) return {};
    if (url.rfind("http://", 0) == 0 || url.rfind("https://", 0) == 0) {
        ensureDirExists(kFontCacheDir);
        std::string ext = ".ttf";
        for (auto& e : {".ttf", ".otf", ".woff2", ".woff"})
            if (url.find(e) != std::string::npos) { ext = e; break; }
        std::string cachePath = kFontCacheDir + urlCacheKey(url) + ext;
        if (std::filesystem::exists(cachePath)) return cachePath;
        printf("Font: downloading %s\n", url.c_str());
        if (!curlDownload(url, cachePath)) {
            fprintf(stderr, "Font: download failed: %s\n", url.c_str());
            return {};
        }
        return cachePath;
    }
    if (!std::filesystem::path(url).is_absolute())
        return basePath + "/" + url;
    return url;
}

// Process a parsed @font-face block.
static void processFontFace(const std::string& family, const std::string& src,
                             const std::string& basePath) {
    if (family.empty() || src.empty()) return;
    auto entries = parseFontSrc(src);
    std::string chosen = pickFontUrl(entries);
    if (chosen.empty()) {
        fprintf(stderr, "Font: no TTF/OTF source for '%s' (only WOFF2?)\n", family.c_str());
        return;
    }
    std::string local = resolveFontUrl(chosen, basePath);
    if (local.empty() || !std::filesystem::exists(local)) {
        fprintf(stderr, "Font: could not resolve '%s' for '%s'\n", chosen.c_str(), family.c_str());
        return;
    }
    raym3::FontManager::RegisterFont(family, local);
    printf("Font: registered '%s' → %s\n", family.c_str(), local.c_str());
}

// Handle @import url(...) — for Google Fonts / Font Awesome CDN CSS.
static void processImport(const std::string& importVal, const std::string& basePath) {
    // Extract URL from: url('...'), url("..."), or bare 'string'
    std::string url;
    std::size_t u = importVal.find("url(");
    if (u != std::string::npos) {
        std::size_t s = u + 4;
        if (s < importVal.size() && (importVal[s]=='\'' || importVal[s]=='"')) s++;
        std::size_t e = importVal.find_first_of("'\")", s);
        if (e != std::string::npos) url = importVal.substr(s, e - s);
    } else {
        url = importVal;
        if (url.size() >= 2 && (url.front()=='\'' || url.front()=='"'))
            url = url.substr(1, url.size() - 2);
    }
    if (url.empty()) return;

    if (url.rfind("http://", 0) == 0 || url.rfind("https://", 0) == 0) {
        // Google Fonts: request with old user-agent so server returns TTF, not WOFF2
        bool isGoogleFonts = url.find("fonts.googleapis.com") != std::string::npos;
        std::string ua = isGoogleFonts
            ? "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)"
            : std::string{};
        printf("Font: fetching CSS: %s\n", url.c_str());
        std::string css = curlFetch(url, ua);
        if (!css.empty()) parseCSSIntoStylesheet(css, basePath);
        return;
    }
    // Local CSS @import — already handled by JS importCSS, ignore here
}

// ─── CSS parser → raym3::Stylesheet ───────────────────────────────────────────

static void parseCSSIntoStylesheet(const std::string& css,
                                    const std::string& basePath) {
    std::string flat = CSSDeNest::denest_css(css);
    CSSParser parser;
    parser.set_level("CSS3.0");
    parser.parse_css(flat);

    int atDepth = 0;
    bool inFontFace = false;
    std::string fontFaceFamily, fontFaceSrc;
    std::string curSelector, curProp;
    CSSPropMap curProps;
    std::vector<raym3::MediaQuery> mediaStack;

    // @keyframes accumulation
    bool inKeyframes = false;
    std::string keyframesName;
    std::vector<raym3::v2::Keyframe> keyframesStops;
    raym3::v2::Keyframe curStop;
    bool curStopValid = false;

    auto inRuleContext = [&]() {
        if (inFontFace || inKeyframes) return false;
        if (atDepth == 0) return true;
        // Inside an at-block, only emit rules when the block is a real media
        // query we understand (skip==false). Unknown at-rules / unsupported
        // media types push a skipped query and their contents are ignored.
        return !mediaStack.empty() && !mediaStack.back().skip;
    };

    auto currentMedia = [&]() -> raym3::MediaQuery {
        if (mediaStack.empty()) return raym3::MediaQuery{};
        return mediaStack.back();
    };

    CSSParser::token tok = parser.get_next_token();
    while (tok.type != CSSParser::CSS_END) {
        switch (tok.type) {
            case CSSParser::IMPORT:
                processImport(tok.data, basePath);
                break;
            case CSSParser::AT_START: {
                atDepth++;
                std::string header = toLower(trimStr(tok.data));
                // The tokenizer emits font-face without the leading '@' but keeps
                // it for @media/@keyframes — accept both forms defensively.
                bool isKeyframes = header.rfind("keyframes", 0) == 0 ||
                                   header.rfind("@keyframes", 0) == 0 ||
                                   header.rfind("@-webkit-keyframes", 0) == 0;
                if (header == "font-face") {
                    inFontFace = true;
                    fontFaceFamily.clear();
                    fontFaceSrc.clear();
                    mediaStack.push_back(raym3::MediaQuery::Skipped());
                } else if (isKeyframes) {
                    inKeyframes = true;
                    keyframesStops.clear();
                    curStop = raym3::v2::Keyframe{};
                    curStopValid = false;
                    // Name is the last whitespace-separated token of the header.
                    std::string h = trimStr(tok.data);
                    size_t sp = h.find_last_of(" \t");
                    keyframesName = sp == std::string::npos ? h : trimStr(h.substr(sp + 1));
                    mediaStack.push_back(raym3::MediaQuery::Skipped());
                } else if (header.rfind("@media", 0) == 0) {
                    mediaStack.push_back(raym3::Stylesheet::ParseMediaHeader(tok.data));
                } else {
                    mediaStack.push_back(raym3::MediaQuery::Skipped());
                }
                break;
            }
            case CSSParser::AT_END:
                if (atDepth > 0) {
                    atDepth--;
                    if (!mediaStack.empty()) mediaStack.pop_back();
                    if (inFontFace && atDepth == 0) {
                        processFontFace(fontFaceFamily, fontFaceSrc, basePath);
                        inFontFace = false;
                    }
                    if (inKeyframes && atDepth == 0) {
                        if (!keyframesName.empty())
                            raym3::v2::RegisterKeyframes(keyframesName, std::move(keyframesStops));
                        keyframesStops.clear();
                        keyframesName.clear();
                        inKeyframes = false;
                    }
                }
                break;
            case CSSParser::SEL_START:
                if (inKeyframes) {
                    // Stop selector: from / to / NN% (may be comma-separated).
                    curStop = raym3::v2::Keyframe{};
                    curStopValid = parseKeyframeOffset(tok.data, curStop.offset);
                    curProp.clear();
                } else if (inRuleContext()) {
                    curSelector = tok.data;
                    curProps.clear();
                    curProp.clear();
                }
                break;
            case CSSParser::PROPERTY:
                if (inFontFace || inKeyframes) {
                    curProp = toLower(trimStr(tok.data));
                } else if (inRuleContext()) {
                    // Custom property names are case-sensitive (--myVar and
                    // --myvar are distinct), so they keep their original casing;
                    // regular property names are normalised to lower case.
                    std::string rawProp = trimStr(tok.data);
                    curProp = rawProp.rfind("--", 0) == 0 ? rawProp : toLower(rawProp);
                }
                break;
            case CSSParser::VALUE:
                if (inFontFace && !curProp.empty()) {
                    std::string val = trimStr(tok.data);
                    if (curProp == "font-family") {
                        fontFaceFamily = val;
                        if (fontFaceFamily.size() >= 2 &&
                            (fontFaceFamily.front()=='\'' || fontFaceFamily.front()=='"'))
                            fontFaceFamily = fontFaceFamily.substr(1, fontFaceFamily.size()-2);
                    } else if (curProp == "src") {
                        fontFaceSrc = val;
                    }
                    curProp.clear();
                } else if (inKeyframes && !curProp.empty() && curStopValid) {
                    std::pair<raym3::v2::TransitionProperty, float> kv;
                    if (parseKeyframeValue(curProp, trimStr(tok.data), kv))
                        curStop.values.push_back(kv);
                    curProp.clear();
                } else if (inRuleContext() && !curProp.empty()) {
                    curProps[curProp] = trimStr(tok.data);
                    curProp.clear();
                }
                break;
            case CSSParser::SEL_END:
                if (inKeyframes) {
                    if (curStopValid && !curStop.values.empty())
                        keyframesStops.push_back(std::move(curStop));
                    curStop = raym3::v2::Keyframe{};
                    curStopValid = false;
                    curProp.clear();
                } else if (inRuleContext() && !curSelector.empty()) {
                    raym3::Stylesheet::Global().AddRule(curSelector, curProps, currentMedia());
                    curSelector.clear();
                    curProps.clear();
                    curProp.clear();
                }
                break;
            default: break;
        }
        tok = parser.get_next_token();
    }
}

// ─── class name resolution ────────────────────────────────────────────────────

JSValue resolveClassNames(JSContext* ctx, const std::string& classNames) {
    auto& sheet = raym3::Stylesheet::Global();
    const bool dark = raym3::Theme::IsDarkMode();
    JSValue obj = buildStyleObject(ctx, sheet.ResolveClasses(classNames, dark));

    // Pseudo-class rules (`.btn:hover`) become a `stateStyles` object that
    // applyStyleProps turns into v2::StateStyles — the renderer already picks
    // the right variant per frame from the node's interaction state, so hover /
    // press / focus need no extra runtime machinery here.
    struct { raym3::StyleState state; const char* key; } kStates[] = {
        {raym3::StyleState::Hover,    "hovered"},
        {raym3::StyleState::Active,   "pressed"},
        {raym3::StyleState::Focus,    "focused"},
        {raym3::StyleState::Disabled, "disabled"},
    };
    JSValue states = JS_UNDEFINED;
    for (const auto& s : kStates) {
        if (!sheet.HasStateRules(s.state)) continue;   // fast path: no such rules at all
        CSSPropMap props = sheet.ResolveClasses(classNames, dark, s.state);
        if (props.empty()) continue;
        if (JS_IsUndefined(states)) states = JS_NewObject(ctx);
        JS_SetPropertyStr(ctx, states, s.key, buildStyleObject(ctx, props));
    }
    if (!JS_IsUndefined(states))
        JS_SetPropertyStr(ctx, obj, "stateStyles", states);
    return obj;
}

// ─── JS functions ─────────────────────────────────────────────────────────────

JSValue JS_importCSS(JSContext* ctx, JSValue /*this_val*/,
                     int argc, JSValueConst* argv) {
    if (argc < 1)
        return JS_ThrowTypeError(ctx, "importCSS: expected (path)");
    const char* pathCStr = JS_ToCString(ctx, argv[0]);
    if (!pathCStr) return JS_ThrowTypeError(ctx, "importCSS: invalid path");
    std::string path = pathCStr;
    JS_FreeCString(ctx, pathCStr);

    std::vector<std::string> prefixes = {"","./","apps/desktop/","../apps/desktop/"};
    // Release builds (and mounted .rayactpack containers) stage CSS under the
    // asset base dir; consult it so importCSS resolves outside the CWD.
    std::string base = rayact::rayactAssetBaseDir();
    if (!base.empty()) {
        prefixes.push_back(base + "/");
        prefixes.push_back(base + "/runtime/");
    }
    std::string content;
    bool found = false;
    for (auto& pfx : prefixes) {
        std::string full = pfx + path;
        FILE* f = fopen(full.c_str(), "r");
        if (!f) continue;
        fseek(f, 0, SEEK_END); long sz = ftell(f); fseek(f, 0, SEEK_SET);
        content.resize(sz);
        fread(&content[0], 1, sz, f);
        fclose(f);
        path = full;
        found = true;
        break;
    }

    if (!found) {
        fprintf(stderr, "importCSS: file not found: %s\n", path.c_str());
        return JS_UNDEFINED;
    }

    // Pass the CSS file's directory as basePath for relative @font-face src: url() resolution.
    std::string basePath = std::filesystem::path(path).parent_path().string();
    if (basePath.empty()) basePath = ".";
    parseCSSIntoStylesheet(content, basePath);
    printf("CSS loaded: %s (%zu selectors)\n", path.c_str(),
           raym3::Stylesheet::Global().SelectorCount());
    return JS_UNDEFINED;
}

// importCSSText(css[, basePath]) — parse CSS from a string rather than a file.
// Lets JS supply stylesheet text from any source: a `fetch()` off the dev
// server, an inlined bundle string, or generated CSS. On mobile, where project
// files are not on the device filesystem and networking is async, this is how a
// dev/bundled CSS reaches the engine. Returns the resolved class map for the
// (optional) className argument convention used by importCSS callers — here just
// undefined, since callers use it for its side effect on the global stylesheet.
JSValue JS_importCSSText(JSContext* ctx, JSValue /*this_val*/,
                         int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsString(argv[0]))
        return JS_ThrowTypeError(ctx, "importCSSText: expected (cssString)");
    const char* cssC = JS_ToCString(ctx, argv[0]);
    if (!cssC) return JS_EXCEPTION;
    std::string css = cssC;
    JS_FreeCString(ctx, cssC);

    // Optional base path for relative @font-face url() resolution; defaults to
    // the asset base dir (or cwd) since string CSS has no file location.
    std::string basePath = rayact::rayactAssetBaseDir();
    if (argc >= 2 && JS_IsString(argv[1])) {
        const char* bpC = JS_ToCString(ctx, argv[1]);
        if (bpC) { basePath = bpC; JS_FreeCString(ctx, bpC); }
    }
    if (basePath.empty()) basePath = ".";

    parseCSSIntoStylesheet(css, basePath);
    printf("CSS loaded from text (%zu bytes, %zu selectors)\n", css.size(),
           raym3::Stylesheet::Global().SelectorCount());
    return JS_UNDEFINED;
}

// ─── CSS custom properties ────────────────────────────────────────────────────

// Custom property names are used verbatim, but callers may pass either
// "--brand" or "brand"; normalise to the leading-dashes form.
static std::string normalizeVarName(const std::string& name) {
    std::string n = trimStr(name);
    if (n.rfind("--", 0) != 0) n = "--" + n;
    return n;
}

// After variables change, re-resolve className-derived styles so already-mounted
// nodes pick up the new values, wake a frame, and let JS re-render.
static void notifyCSSVariablesChanged(JSContext* ctx) {
    refreshClassNameStyles(ctx);
    rayact::engineRequestFrame();

    JSValue global = JS_GetGlobalObject(ctx);
    JSValue cb = JS_GetPropertyStr(ctx, global, "onCSSVariablesChange");
    JS_FreeValue(ctx, global);
    if (!JS_IsFunction(ctx, cb)) {
        JS_FreeValue(ctx, cb);
        return;
    }
    JSValue result = JS_Call(ctx, cb, JS_UNDEFINED, 0, nullptr);
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(ctx);
        const char* s = JS_ToCString(ctx, exc);
        fprintf(stderr, "[css] onCSSVariablesChange error: %s\n", s ? s : "?");
        if (s) JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, exc);
    }
    JS_FreeValue(ctx, result);
    JS_FreeValue(ctx, cb);
}

// __rayactSetCSSVariable(name, value) — value null/undefined clears the override.
static JSValue JS_setCSSVariable(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsString(argv[0]))
        return JS_ThrowTypeError(ctx, "setCSSVariable: expected (name, value)");
    const char* nameC = JS_ToCString(ctx, argv[0]);
    if (!nameC) return JS_EXCEPTION;
    std::string name = normalizeVarName(nameC);
    JS_FreeCString(ctx, nameC);

    if (argc < 2 || JS_IsUndefined(argv[1]) || JS_IsNull(argv[1])) {
        raym3::Stylesheet::Global().ClearVariableOverride(name);
    } else {
        const char* valC = JS_ToCString(ctx, argv[1]);
        if (!valC) return JS_EXCEPTION;
        raym3::Stylesheet::Global().SetVariableOverride(name, trimStr(valC));
        JS_FreeCString(ctx, valC);
    }
    notifyCSSVariablesChanged(ctx);
    return JS_UNDEFINED;
}

// __rayactSetCSSVariables({ '--a': '1px', b: 'red' }) — batched, one restyle.
static JSValue JS_setCSSVariables(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsObject(argv[0]))
        return JS_ThrowTypeError(ctx, "setCSSVariables: expected an object");

    JSPropertyEnum* props = nullptr;
    uint32_t count = 0;
    if (JS_GetOwnPropertyNames(ctx, &props, &count, argv[0], JS_GPN_STRING_MASK | JS_GPN_ENUM_ONLY) != 0)
        return JS_EXCEPTION;

    for (uint32_t i = 0; i < count; i++) {
        const char* keyC = JS_AtomToCString(ctx, props[i].atom);
        if (!keyC) continue;
        std::string name = normalizeVarName(keyC);
        JS_FreeCString(ctx, keyC);

        JSValue v = JS_GetProperty(ctx, argv[0], props[i].atom);
        if (JS_IsUndefined(v) || JS_IsNull(v)) {
            raym3::Stylesheet::Global().ClearVariableOverride(name);
        } else {
            const char* valC = JS_ToCString(ctx, v);
            if (valC) {
                raym3::Stylesheet::Global().SetVariableOverride(name, trimStr(valC));
                JS_FreeCString(ctx, valC);
            }
        }
        JS_FreeValue(ctx, v);
    }
    JS_FreePropertyEnum(ctx, props, count);

    notifyCSSVariablesChanged(ctx);
    return JS_UNDEFINED;
}

// __rayactGetCSSVariable(name) — resolved value for the active colour scheme,
// or undefined when the variable is not declared.
static JSValue JS_getCSSVariable(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsString(argv[0]))
        return JS_ThrowTypeError(ctx, "getCSSVariable: expected (name)");
    const char* nameC = JS_ToCString(ctx, argv[0]);
    if (!nameC) return JS_EXCEPTION;
    std::string name = normalizeVarName(nameC);
    JS_FreeCString(ctx, nameC);

    std::string value = raym3::Stylesheet::Global().GetVariable(name, raym3::Theme::IsDarkMode());
    if (value.empty()) return JS_UNDEFINED;
    // Resolve chained references so callers get a usable literal value.
    value = substituteVars(value);
    return JS_NewString(ctx, value.c_str());
}

// __rayactResetCSSVariables() — drop every runtime override, back to the
// values declared in the stylesheet.
static JSValue JS_resetCSSVariables(JSContext* ctx, JSValue, int, JSValueConst*) {
    raym3::Stylesheet::Global().ClearVariableOverrides();
    notifyCSSVariablesChanged(ctx);
    return JS_UNDEFINED;
}

void registerCSSVariableBindings(JSContext* ctx) {
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "__rayactSetCSSVariable",
        JS_NewCFunction(ctx, JS_setCSSVariable, "__rayactSetCSSVariable", 2));
    JS_SetPropertyStr(ctx, global, "__rayactSetCSSVariables",
        JS_NewCFunction(ctx, JS_setCSSVariables, "__rayactSetCSSVariables", 1));
    JS_SetPropertyStr(ctx, global, "__rayactGetCSSVariable",
        JS_NewCFunction(ctx, JS_getCSSVariable, "__rayactGetCSSVariable", 1));
    JS_SetPropertyStr(ctx, global, "__rayactResetCSSVariables",
        JS_NewCFunction(ctx, JS_resetCSSVariables, "__rayactResetCSSVariables", 0));
    JS_FreeValue(ctx, global);
}

// ─── lifecycle ────────────────────────────────────────────────────────────────

void cleanupCSSBridge(JSContext* /*ctx*/) {
    raym3::Stylesheet::Global().Clear();
    raym3::v2::ClearKeyframes();
}
