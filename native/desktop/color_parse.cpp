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

std::vector<std::string> splitTrim(const std::string& s, char delim) {
    std::vector<std::string> parts;
    std::istringstream ss(s);
    std::string part;
    while (std::getline(ss, part, delim)) {
        std::string t = trimStr(part);
        if (!t.empty()) parts.push_back(t);
    }
    return parts;
}

float extractVarFallback(const std::string& s) {
    size_t varPos = s.find("var(");
    if (varPos == std::string::npos) {
        try { return std::stof(trimStr(s)); } catch (...) { return 1.0f; }
    }
    size_t commaPos = s.find(',', varPos + 4);
    if (commaPos == std::string::npos) return 1.0f;
    size_t closePos = s.find(')', commaPos);
    if (closePos == std::string::npos) return 1.0f;
    try { return std::stof(trimStr(s.substr(commaPos + 1, closePos - commaPos - 1))); } catch (...) { return 1.0f; }
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

uint32_t parseRgbColor(const std::string& v) {
    size_t lp = v.find('('), rp = v.rfind(')');
    if (lp == std::string::npos || rp == std::string::npos || rp <= lp) return 0x000000FF;

    std::string inner = v.substr(lp + 1, rp - lp - 1);
    uint32_t r = 0, g = 0, b = 0, a = 255;

    size_t slashPos = inner.find('/');
    std::string colorPart = slashPos != std::string::npos ? inner.substr(0, slashPos) : inner;
    bool isModern = (colorPart.find(',') == std::string::npos);

    if (isModern) {
        auto ch = splitTrim(trimStr(colorPart), ' ');
        try { if (ch.size() > 0) r = (uint32_t)std::stoi(ch[0]); } catch (...) {}
        try { if (ch.size() > 1) g = (uint32_t)std::stoi(ch[1]); } catch (...) {}
        try { if (ch.size() > 2) b = (uint32_t)std::stoi(ch[2]); } catch (...) {}
        if (slashPos != std::string::npos) {
            float af = extractVarFallback(trimStr(inner.substr(slashPos + 1)));
            a = (uint32_t)std::clamp(af * 255.0f, 0.0f, 255.0f);
        }
    } else {
        auto parts = splitTrim(inner, ',');
        try { if (parts.size() > 0) r = (uint32_t)std::stoi(parts[0]); } catch (...) {}
        try { if (parts.size() > 1) g = (uint32_t)std::stoi(parts[1]); } catch (...) {}
        try { if (parts.size() > 2) b = (uint32_t)std::stoi(parts[2]); } catch (...) {}
        try { if (parts.size() > 3) a = (uint32_t)std::clamp(std::stof(parts[3]) * 255.0f, 0.0f, 255.0f); } catch (...) {}
    }
    return (r << 24) | (g << 16) | (b << 8) | a;
}

} // namespace

uint32_t ParseCssColor(const std::string& raw) {
    std::string v = toLower(trimStr(raw));
    if (v.empty()) return 0x000000FF;

    if (v[0] == '#') return parseHexColor(v);

    if (v.rfind("rgb", 0) == 0) return parseRgbColor(v);

    auto it = namedColors().find(v);
    return it != namedColors().end() ? it->second : 0x000000FF;
}

Color ParseCssColorToRaylib(const std::string& raw) {
    return packedToRaylib(ParseCssColor(raw));
}
