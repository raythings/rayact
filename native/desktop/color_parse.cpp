#include "color_parse.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <map>
#include <sstream>
#include <string>
#include <vector>

namespace {

std::string trimStr(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return {};
    return s.substr(a, s.find_last_not_of(" \t\r\n") - a + 1);
}

std::string toLower(std::string s) {
    for (char& c : s) c = (char)tolower((unsigned char)c);
    return s;
}

Color packedToRaylib(uint32_t c) {
    return {
        (unsigned char)((c >> 24) & 0xFF),
        (unsigned char)((c >> 16) & 0xFF),
        (unsigned char)((c >>  8) & 0xFF),
        (unsigned char)( c        & 0xFF)
    };
}

const std::map<std::string, uint32_t>& namedColors() {
    static const std::map<std::string, uint32_t> named = {
        {"transparent", 0x00000000},
        {"aliceblue", 0xF0F8FFFF},
        {"antiquewhite", 0xFAEBD7FF},
        {"aqua", 0x00FFFFFF},
        {"aquamarine", 0x7FFFD4FF},
        {"azure", 0xF0FFFFFF},
        {"beige", 0xF5F5DCFF},
        {"bisque", 0xFFE4C4FF},
        {"black", 0x000000FF},
        {"blanchedalmond", 0xFFEBCDFF},
        {"blue", 0x0000FFFF},
        {"blueviolet", 0x8A2BE2FF},
        {"brown", 0xA52A2AFF},
        {"burlywood", 0xDEB887FF},
        {"cadetblue", 0x5F9EA0FF},
        {"chartreuse", 0x7FFF00FF},
        {"chocolate", 0xD2691EFF},
        {"coral", 0xFF7F50FF},
        {"cornflowerblue", 0x6495EDFF},
        {"cornsilk", 0xFFF8DCFF},
        {"crimson", 0xDC143CFF},
        {"cyan", 0x00FFFFFF},
        {"darkblue", 0x00008BFF},
        {"darkcyan", 0x008B8BFF},
        {"darkgoldenrod", 0xB8860BFF},
        {"darkgray", 0xA9A9A9FF},
        {"darkgreen", 0x006400FF},
        {"darkgrey", 0xA9A9A9FF},
        {"darkkhaki", 0xBDB76BFF},
        {"darkmagenta", 0x8B008BFF},
        {"darkolivegreen", 0x556B2FFF},
        {"darkorange", 0xFF8C00FF},
        {"darkorchid", 0x9932CCFF},
        {"darkred", 0x8B0000FF},
        {"darksalmon", 0xE9967AFF},
        {"darkseagreen", 0x8FBC8FFF},
        {"darkslateblue", 0x483D8BFF},
        {"darkslategray", 0x2F4F4FFF},
        {"darkslategrey", 0x2F4F4FFF},
        {"darkturquoise", 0x00CED1FF},
        {"darkviolet", 0x9400D3FF},
        {"deeppink", 0xFF1493FF},
        {"deepskyblue", 0x00BFFFFF},
        {"dimgray", 0x696969FF},
        {"dimgrey", 0x696969FF},
        {"dodgerblue", 0x1E90FFFF},
        {"firebrick", 0xB22222FF},
        {"floralwhite", 0xFFFAF0FF},
        {"forestgreen", 0x228B22FF},
        {"fuchsia", 0xFF00FFFF},
        {"gainsboro", 0xDCDCDCFF},
        {"ghostwhite", 0xF8F8FFFF},
        {"gold", 0xFFD700FF},
        {"goldenrod", 0xDAA520FF},
        {"gray", 0x808080FF},
        {"green", 0x008000FF},
        {"greenyellow", 0xADFF2FFF},
        {"grey", 0x808080FF},
        {"honeydew", 0xF0FFF0FF},
        {"hotpink", 0xFF69B4FF},
        {"indianred", 0xCD5C5CFF},
        {"indigo", 0x4B0082FF},
        {"ivory", 0xFFFFF0FF},
        {"khaki", 0xF0E68CFF},
        {"lavender", 0xE6E6FAFF},
        {"lavenderblush", 0xFFF0F5FF},
        {"lawngreen", 0x7CFC00FF},
        {"lemonchiffon", 0xFFFACDFF},
        {"lightblue", 0xADD8E6FF},
        {"lightcoral", 0xF08080FF},
        {"lightcyan", 0xE0FFFFFF},
        {"lightgoldenrodyellow", 0xFAFAD2FF},
        {"lightgray", 0xD3D3D3FF},
        {"lightgreen", 0x90EE90FF},
        {"lightgrey", 0xD3D3D3FF},
        {"lightpink", 0xFFB6C1FF},
        {"lightsalmon", 0xFFA07AFF},
        {"lightseagreen", 0x20B2AAFF},
        {"lightskyblue", 0x87CEFAFF},
        {"lightslategray", 0x778899FF},
        {"lightslategrey", 0x778899FF},
        {"lightsteelblue", 0xB0C4DEFF},
        {"lightyellow", 0xFFFFE0FF},
        {"lime", 0x00FF00FF},
        {"limegreen", 0x32CD32FF},
        {"linen", 0xFAF0E6FF},
        {"magenta", 0xFF00FFFF},
        {"maroon", 0x800000FF},
        {"mediumaquamarine", 0x66CDAAFF},
        {"mediumblue", 0x0000CDFF},
        {"mediumorchid", 0xBA55D3FF},
        {"mediumpurple", 0x9370DBFF},
        {"mediumseagreen", 0x3CB371FF},
        {"mediumslateblue", 0x7B68EEFF},
        {"mediumspringgreen", 0x00FA9AFF},
        {"mediumturquoise", 0x48D1CCFF},
        {"mediumvioletred", 0xC71585FF},
        {"midnightblue", 0x191970FF},
        {"mintcream", 0xF5FFFAFF},
        {"mistyrose", 0xFFE4E1FF},
        {"moccasin", 0xFFE4B5FF},
        {"navajowhite", 0xFFDEADFF},
        {"navy", 0x000080FF},
        {"oldlace", 0xFDF5E6FF},
        {"olive", 0x808000FF},
        {"olivedrab", 0x6B8E23FF},
        {"orange", 0xFFA500FF},
        {"orangered", 0xFF4500FF},
        {"orchid", 0xDA70D6FF},
        {"palegoldenrod", 0xEEE8AAFF},
        {"palegreen", 0x98FB98FF},
        {"paleturquoise", 0xAFEEEEFF},
        {"palevioletred", 0xDB7093FF},
        {"papayawhip", 0xFFEFD5FF},
        {"peachpuff", 0xFFDAB9FF},
        {"peru", 0xCD853FFF},
        {"pink", 0xFFC0CBFF},
        {"plum", 0xDDA0DDFF},
        {"powderblue", 0xB0E0E6FF},
        {"purple", 0x800080FF},
        {"rebeccapurple", 0x663399FF},
        {"red", 0xFF0000FF},
        {"rosybrown", 0xBC8F8FFF},
        {"royalblue", 0x4169E1FF},
        {"saddlebrown", 0x8B4513FF},
        {"salmon", 0xFA8072FF},
        {"sandybrown", 0xF4A460FF},
        {"seagreen", 0x2E8B57FF},
        {"seashell", 0xFFF5EEFF},
        {"sienna", 0xA0522DFF},
        {"silver", 0xC0C0C0FF},
        {"skyblue", 0x87CEEBFF},
        {"slateblue", 0x6A5ACDFF},
        {"slategray", 0x708090FF},
        {"slategrey", 0x708090FF},
        {"snow", 0xFFFAFAFF},
        {"springgreen", 0x00FF7FFF},
        {"steelblue", 0x4682B4FF},
        {"tan", 0xD2B48CFF},
        {"teal", 0x008080FF},
        {"thistle", 0xD8BFD8FF},
        {"tomato", 0xFF6347FF},
        {"turquoise", 0x40E0D0FF},
        {"violet", 0xEE82EEFF},
        {"wheat", 0xF5DEB3FF},
        {"white", 0xFFFFFFFF},
        {"whitesmoke", 0xF5F5F5FF},
        {"yellow", 0xFFFF00FF},
        {"yellowgreen", 0x9ACD32FF},
    };
    return named;
}

uint32_t parseHexColor(const std::string& v) {
    std::string hex = v.substr(1);
    if (hex.size() == 3) hex = {hex[0], hex[0], hex[1], hex[1], hex[2], hex[2]};
    if (hex.size() == 4) hex = {hex[0], hex[0], hex[1], hex[1], hex[2], hex[2], hex[3], hex[3]};
    try {
        unsigned long n = std::stoul(hex, nullptr, 16);
        if (hex.size() == 6) return (uint32_t)((n << 8) | 0xFF);
        if (hex.size() == 8) return (uint32_t)n;
    } catch (...) {}
    return 0x000000FF;
}

// ─── float colour pipeline ────────────────────────────────────────────────────
// Everything below works in float RGBA (0..1, sRGB gamma-encoded) so the
// CIE/Oklab conversions compose cleanly; packing happens once at the end.

struct RgbaF {
    float r = 0, g = 0, b = 0, a = 1;
};

uint32_t packRgbaF(const RgbaF& c) {
    auto ch = [](float v) -> uint32_t {
        return (uint32_t)std::lround(std::clamp(v, 0.0f, 1.0f) * 255.0f);
    };
    return (ch(c.r) << 24) | (ch(c.g) << 16) | (ch(c.b) << 8) | ch(c.a);
}

float linearToSrgb(float c) {
    c = std::clamp(c, 0.0f, 1.0f);  // simple gamut clip for out-of-sRGB Lab/Oklch
    return c <= 0.0031308f ? 12.92f * c : 1.055f * std::pow(c, 1.0f / 2.4f) - 0.055f;
}

float srgbToLinear(float c) {
    return c <= 0.04045f ? c / 12.92f : std::pow((c + 0.055f) / 1.055f, 2.4f);
}

// Split a functional colour's inner text into components + optional alpha,
// accepting both legacy `a, b, c, alpha` and modern `a b c / alpha` syntax.
struct Components {
    std::vector<std::string> ch;
    std::string alpha;
    bool hasAlpha = false;
};

std::vector<std::string> splitTopLevel(const std::string& s, char delim) {
    std::vector<std::string> out;
    int depth = 0;
    std::string cur;
    for (char c : s) {
        if (c == '(') depth++;
        else if (c == ')' && depth > 0) depth--;
        if (c == delim && depth == 0) { out.push_back(cur); cur.clear(); }
        else cur += c;
    }
    out.push_back(cur);
    return out;
}

std::vector<std::string> splitWhitespaceTopLevel(const std::string& s) {
    std::vector<std::string> out;
    int depth = 0;
    std::string cur;
    for (char c : s) {
        if (c == '(') depth++;
        else if (c == ')' && depth > 0) depth--;
        if (depth == 0 && isspace((unsigned char)c)) {
            if (!cur.empty()) { out.push_back(cur); cur.clear(); }
        } else cur += c;
    }
    if (!cur.empty()) out.push_back(cur);
    return out;
}

Components splitComponents(const std::string& inner) {
    Components out;
    auto slashParts = splitTopLevel(inner, '/');
    std::string head = slashParts[0];
    if (slashParts.size() > 1) {
        out.alpha = trimStr(slashParts[1]);
        out.hasAlpha = !out.alpha.empty();
    }

    auto commaParts = splitTopLevel(head, ',');
    if (commaParts.size() > 1) {
        // Legacy comma syntax; a 4th component is the alpha.
        for (auto& p : commaParts) out.ch.push_back(trimStr(p));
        if (out.ch.size() >= 4 && !out.hasAlpha) {
            out.alpha = out.ch[3];
            out.hasAlpha = true;
            out.ch.resize(3);
        }
    } else {
        out.ch = splitWhitespaceTopLevel(trimStr(head));
    }
    return out;
}

bool toFloat(const std::string& s, float& out) {
    try { out = std::stof(trimStr(s)); return true; } catch (...) { return false; }
}

// A channel that may be a number, a percentage, or the `none` keyword.
// `pctScale` maps 100% onto the channel's native range; `numScale` does the
// same for plain numbers (255 for rgb, 1 for predefined colour spaces).
float parseChannel(const std::string& raw, float pctScale, float numScale, float fallback = 0.0f) {
    std::string s = trimStr(raw);
    if (s.empty() || s == "none") return 0.0f;
    if (s.back() == '%') {
        float v;
        if (!toFloat(s.substr(0, s.size() - 1), v)) return fallback;
        return v / 100.0f * pctScale;
    }
    float v;
    if (!toFloat(s, v)) return fallback;
    return v / numScale;
}

float parseAlpha(const Components& c) {
    if (!c.hasAlpha) return 1.0f;
    std::string s = trimStr(c.alpha);
    if (s == "none") return 0.0f;
    if (!s.empty() && s.back() == '%') {
        float v;
        if (!toFloat(s.substr(0, s.size() - 1), v)) return 1.0f;
        return std::clamp(v / 100.0f, 0.0f, 1.0f);
    }
    float v;
    if (!toFloat(s, v)) return 1.0f;
    return std::clamp(v, 0.0f, 1.0f);
}

// <angle>: bare number is degrees; deg/grad/rad/turn all accepted.
float parseHueDegrees(const std::string& raw) {
    std::string s = trimStr(raw);
    if (s.empty() || s == "none") return 0.0f;
    float mul = 1.0f;
    if (s.size() > 4 && s.compare(s.size() - 4, 4, "grad") == 0) { s.resize(s.size() - 4); mul = 360.0f / 400.0f; }
    else if (s.size() > 4 && s.compare(s.size() - 4, 4, "turn") == 0) { s.resize(s.size() - 4); mul = 360.0f; }
    else if (s.size() > 3 && s.compare(s.size() - 3, 3, "deg") == 0) { s.resize(s.size() - 3); }
    else if (s.size() > 3 && s.compare(s.size() - 3, 3, "rad") == 0) { s.resize(s.size() - 3); mul = 180.0f / 3.14159265358979323846f; }
    float v;
    if (!toFloat(s, v)) return 0.0f;
    return v * mul;
}

float normalizeHue(float deg) {
    deg = std::fmod(deg, 360.0f);
    return deg < 0 ? deg + 360.0f : deg;
}

RgbaF hslToRgb(float h, float s, float l, float a) {
    h = normalizeHue(h);
    s = std::clamp(s, 0.0f, 1.0f);
    l = std::clamp(l, 0.0f, 1.0f);
    float c = (1.0f - std::fabs(2.0f * l - 1.0f)) * s;
    float hp = h / 60.0f;
    float x = c * (1.0f - std::fabs(std::fmod(hp, 2.0f) - 1.0f));
    float r = 0, g = 0, b = 0;
    if (hp < 1)      { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else             { r = c; b = x; }
    float m = l - c / 2.0f;
    return { r + m, g + m, b + m, a };
}

RgbaF hwbToRgb(float h, float w, float bl, float a) {
    w = std::clamp(w, 0.0f, 1.0f);
    bl = std::clamp(bl, 0.0f, 1.0f);
    if (w + bl >= 1.0f) {
        float gray = w / (w + bl);
        return { gray, gray, gray, a };
    }
    RgbaF base = hslToRgb(h, 1.0f, 0.5f, a);
    auto mix = [&](float c) { return c * (1.0f - w - bl) + w; };
    return { mix(base.r), mix(base.g), mix(base.b), a };
}

RgbaF linearSrgbToRgba(float lr, float lg, float lb, float a) {
    return { linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb), a };
}

// Oklab → linear sRGB (Björn Ottosson).
RgbaF oklabToRgb(float L, float aa, float bb, float alpha) {
    float l_ = L + 0.3963377774f * aa + 0.2158037573f * bb;
    float m_ = L - 0.1055613458f * aa - 0.0638541728f * bb;
    float s_ = L - 0.0894841775f * aa - 1.2914855480f * bb;
    float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    float r = +4.0767416621f * l - 3.3077115913f * m + 0.2309699292f * s;
    float g = -1.2684380046f * l + 2.6097574011f * m - 0.3413193965f * s;
    float b = -0.0041960863f * l - 0.7034186147f * m + 1.7076147010f * s;
    return linearSrgbToRgba(r, g, b, alpha);
}

// CIE Lab (D50, per CSS Color 4) → XYZ → linear sRGB.
RgbaF labToRgb(float L, float aa, float bb, float alpha) {
    const float e = 216.0f / 24389.0f, k = 24389.0f / 27.0f;
    float fy = (L + 16.0f) / 116.0f;
    float fx = fy + aa / 500.0f;
    float fz = fy - bb / 200.0f;
    float fx3 = fx * fx * fx, fz3 = fz * fz * fz;
    float xr = fx3 > e ? fx3 : (116.0f * fx - 16.0f) / k;
    float yr = L > k * e ? std::pow((L + 16.0f) / 116.0f, 3.0f) : L / k;
    float zr = fz3 > e ? fz3 : (116.0f * fz - 16.0f) / k;
    // D50 reference white
    float X = xr * 0.9642956764295677f, Y = yr, Z = zr * 0.8251046025104602f;
    float r = 3.1341359569430038f * X - 1.6173863321612538f * Y - 0.4906619460083532f * Z;
    float g = -0.978795502912089f * X + 1.9161404439181157f * Y + 0.03344273116131949f * Z;
    float b = 0.07195537988411677f * X - 0.2289768264158322f * Y + 1.405386058324125f * Z;
    return linearSrgbToRgba(r, g, b, alpha);
}

RgbaF lchToRgb(float L, float C, float hDeg, float alpha, bool ok) {
    float h = normalizeHue(hDeg) * 3.14159265358979323846f / 180.0f;
    float a = C * std::cos(h), b = C * std::sin(h);
    return ok ? oklabToRgb(L, a, b, alpha) : labToRgb(L, a, b, alpha);
}

uint32_t parseColorValue(const std::string& v, int depth);

// color-mix(in <space>, <color> <pct>?, <color> <pct>?)
uint32_t parseColorMix(const std::string& inner, int depth) {
    auto parts = splitTopLevel(inner, ',');
    if (parts.size() < 3) return 0x000000FF;

    std::string space = toLower(trimStr(parts[0]));
    if (space.rfind("in ", 0) == 0) space = trimStr(space.substr(3));

    auto parseStop = [&](const std::string& raw, float& pct, bool& hasPct) -> uint32_t {
        auto toks = splitWhitespaceTopLevel(trimStr(raw));
        hasPct = false;
        pct = 0.5f;
        std::string colorTok;
        for (auto& t : toks) {
            if (!t.empty() && t.back() == '%') {
                float v;
                if (toFloat(t.substr(0, t.size() - 1), v)) { pct = v / 100.0f; hasPct = true; }
            } else if (colorTok.empty()) colorTok = t;
            else colorTok += " " + t;
        }
        return parseColorValue(colorTok, depth + 1);
    };

    float p1, p2;
    bool h1, h2;
    uint32_t c1 = parseStop(parts[1], p1, h1);
    uint32_t c2 = parseStop(parts[2], p2, h2);
    if (h1 && !h2) p2 = 1.0f - p1;
    else if (!h1 && h2) p1 = 1.0f - p2;
    else if (!h1 && !h2) { p1 = 0.5f; p2 = 0.5f; }
    float sum = p1 + p2;
    if (sum <= 0.0f) return 0x000000FF;
    p1 /= sum; p2 /= sum;

    auto unpack = [](uint32_t c) -> RgbaF {
        return { ((c >> 24) & 0xFF) / 255.0f, ((c >> 16) & 0xFF) / 255.0f,
                 ((c >> 8) & 0xFF) / 255.0f, (c & 0xFF) / 255.0f };
    };
    RgbaF a = unpack(c1), b = unpack(c2);

    // Mix in a linear-light space when asked; sRGB otherwise. Alpha always mixes
    // linearly, and colour channels are alpha-premultiplied per spec.
    bool linearSpace = (space == "srgb-linear" || space == "oklab" || space == "oklch" ||
                        space == "lab" || space == "lch" || space == "xyz");
    auto conv = [&](float c) { return linearSpace ? srgbToLinear(c) : c; };
    auto back = [&](float c) { return linearSpace ? linearToSrgb(c) : c; };

    float outA = a.a * p1 + b.a * p2;
    auto mixCh = [&](float ca, float cb) {
        float pa = conv(ca) * a.a * p1 + conv(cb) * b.a * p2;
        return outA > 0.0f ? back(pa / outA) : 0.0f;
    };
    RgbaF out{ mixCh(a.r, b.r), mixCh(a.g, b.g), mixCh(a.b, b.b), outA };
    return packRgbaF(out);
}

// color(<space> c1 c2 c3 [/ alpha])
uint32_t parsePredefined(const std::string& inner) {
    auto toks = splitComponents(inner);
    if (toks.ch.empty()) return 0x000000FF;
    std::string space = toLower(trimStr(toks.ch[0]));
    std::vector<std::string> ch(toks.ch.begin() + 1, toks.ch.end());
    while (ch.size() < 3) ch.push_back("0");
    float alpha = parseAlpha(toks);
    float c0 = parseChannel(ch[0], 1.0f, 1.0f);
    float c1 = parseChannel(ch[1], 1.0f, 1.0f);
    float c2 = parseChannel(ch[2], 1.0f, 1.0f);

    if (space == "srgb") return packRgbaF({ c0, c1, c2, alpha });
    if (space == "srgb-linear") return packRgbaF(linearSrgbToRgba(c0, c1, c2, alpha));
    if (space == "display-p3") {
        float lr = srgbToLinear(c0), lg = srgbToLinear(c1), lb = srgbToLinear(c2);
        float r = 1.2249401762805756f * lr - 0.2249401762805756f * lg;
        float g = -0.04205697751790908f * lr + 1.0420569775179091f * lg;
        float b = -0.019637554590334f * lr - 0.07863604555063188f * lg + 1.0982736001409658f * lb;
        return packRgbaF(linearSrgbToRgba(r, g, b, alpha));
    }
    // Unknown/unsupported space (rec2020, a98-rgb, prophoto-rgb, xyz…): treat the
    // components as sRGB rather than collapsing to black.
    return packRgbaF({ c0, c1, c2, alpha });
}

uint32_t parseColorValue(const std::string& raw, int depth) {
    if (depth > 8) return 0x000000FF;  // guard against pathological nesting
    std::string v = toLower(trimStr(raw));
    if (v.empty()) return 0x000000FF;

    if (v[0] == '#') return parseHexColor(v);

    size_t lp = v.find('('), rp = v.rfind(')');
    if (lp != std::string::npos && rp != std::string::npos && rp > lp) {
        std::string fn = trimStr(v.substr(0, lp));
        std::string inner = v.substr(lp + 1, rp - lp - 1);

        if (fn == "rgb" || fn == "rgba") {
            auto c = splitComponents(inner);
            while (c.ch.size() < 3) c.ch.push_back("0");
            return packRgbaF({ parseChannel(c.ch[0], 1.0f, 255.0f),
                               parseChannel(c.ch[1], 1.0f, 255.0f),
                               parseChannel(c.ch[2], 1.0f, 255.0f),
                               parseAlpha(c) });
        }
        if (fn == "hsl" || fn == "hsla") {
            auto c = splitComponents(inner);
            while (c.ch.size() < 3) c.ch.push_back("0");
            return packRgbaF(hslToRgb(parseHueDegrees(c.ch[0]),
                                      parseChannel(c.ch[1], 1.0f, 1.0f),
                                      parseChannel(c.ch[2], 1.0f, 1.0f),
                                      parseAlpha(c)));
        }
        if (fn == "hwb") {
            auto c = splitComponents(inner);
            while (c.ch.size() < 3) c.ch.push_back("0");
            return packRgbaF(hwbToRgb(parseHueDegrees(c.ch[0]),
                                      parseChannel(c.ch[1], 1.0f, 1.0f),
                                      parseChannel(c.ch[2], 1.0f, 1.0f),
                                      parseAlpha(c)));
        }
        if (fn == "lab" || fn == "oklab") {
            bool ok = (fn == "oklab");
            auto c = splitComponents(inner);
            while (c.ch.size() < 3) c.ch.push_back("0");
            // L: 0..100 for lab, 0..1 for oklab. a/b percentages map to ±125 / ±0.4.
            float L = parseChannel(c.ch[0], ok ? 1.0f : 100.0f, 1.0f);
            float aa = parseChannel(c.ch[1], ok ? 0.4f : 125.0f, 1.0f);
            float bb = parseChannel(c.ch[2], ok ? 0.4f : 125.0f, 1.0f);
            float alpha = parseAlpha(c);
            return packRgbaF(ok ? oklabToRgb(L, aa, bb, alpha) : labToRgb(L, aa, bb, alpha));
        }
        if (fn == "lch" || fn == "oklch") {
            bool ok = (fn == "oklch");
            auto c = splitComponents(inner);
            while (c.ch.size() < 3) c.ch.push_back("0");
            float L = parseChannel(c.ch[0], ok ? 1.0f : 100.0f, 1.0f);
            float C = parseChannel(c.ch[1], ok ? 0.4f : 150.0f, 1.0f);
            float h = parseHueDegrees(c.ch[2]);
            return packRgbaF(lchToRgb(L, C, h, parseAlpha(c), ok));
        }
        if (fn == "color") return parsePredefined(inner);
        if (fn == "color-mix") return parseColorMix(inner, depth);
        return 0x000000FF;
    }

    auto it = namedColors().find(v);
    return it != namedColors().end() ? it->second : 0x000000FF;
}

} // namespace

uint32_t ParseCssColor(const std::string& raw) {
    return parseColorValue(raw, 0);
}

Color ParseCssColorToRaylib(const std::string& raw) {
    return packedToRaylib(ParseCssColor(raw));
}

const std::string& CssColorTokenPattern() {
    // Matches any CSS colour token: functional forms (one level of nesting, so
    // color-mix(in oklab, …) and var() fallbacks survive), hex, or a named
    // colour. Named colours are alternated longest-first so that e.g. "red"
    // cannot shadow "rebeccapurple".
    static const std::string pattern = [] {
        std::vector<std::string> names;
        names.reserve(namedColors().size());
        for (auto& kv : namedColors()) names.push_back(kv.first);
        std::sort(names.begin(), names.end(), [](const std::string& a, const std::string& b) {
            return a.size() != b.size() ? a.size() > b.size() : a < b;
        });
        std::string named;
        for (size_t i = 0; i < names.size(); i++) {
            if (i) named += "|";
            named += names[i];
        }
        return std::string(
            R"((?:rgba?|hsla?|hwb|oklab|oklch|lab|lch|color-mix|color)\()"
            R"([^()]*(?:\([^()]*\)[^()]*)*\))"
            R"(|#[0-9A-Fa-f]{3,8})"
            R"(|\b(?:)") + named + R"()\b)";
    }();
    return pattern;
}
