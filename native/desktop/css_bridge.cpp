#include "css_bridge.hpp"
#include "color_parse.hpp"

#include "cssparser/CSSDeNest.h"
#include "cssparser/CSSParser.h"
#include "cssparser/CSSUtils.h"

#include <raym3/styles/Stylesheet.h>
#include <raym3/styles/Theme.h>

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <functional>
#include <map>
#include <sstream>
#include <string>
#include <vector>

// ─── globals ──────────────────────────────────────────────────────────────────

using CSSPropMap = raym3::CSSPropMap;

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

static float parseLength(const std::string& v) {
    if (v.empty()) return 0.0f;
    try {
        size_t idx;
        float f = std::stof(v, &idx);
        std::string unit = toLower(trimStr(v.substr(idx)));
        if (unit == "rem") f *= 16.0f;
        return f;
    } catch (...) { return 0.0f; }
}

static std::vector<std::string> expandEdgeParts(const std::vector<std::string>& parts) {
    if (parts.empty()) return {};
    if (parts.size() == 1) return {parts[0], parts[0], parts[0], parts[0]};
    if (parts.size() == 2) return {parts[0], parts[1], parts[0], parts[1]};
    if (parts.size() == 3) return {parts[0], parts[1], parts[2], parts[1]};
    return {parts[0], parts[1], parts[2], parts[3]};
}

// Extract the fallback value from var(--name, fallback) or parse as plain float.
static float extractVarFallback(const std::string& s) {
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

// ─── JS object builder ────────────────────────────────────────────────────────

static JSValue buildStyleObject(JSContext* ctx, const CSSPropMap& props) {
    JSValue obj     = JS_NewObject(ctx);
    JSValue textObj = JS_NewObject(ctx);
    bool hasText    = false;

    for (auto& [prop, rawVal] : props) {
        std::string val = cleanValue(rawVal);
        if (val.empty()) continue;

        // ── text sub-properties ──────────────────────────────────────────
        if (prop == "color")           { JS_SetPropertyStr(ctx, textObj, "color",        JS_NewFloat64(ctx, parseColor(val)));  hasText=true; continue; }
        if (prop == "font-size")       { JS_SetPropertyStr(ctx, textObj, "fontSize",     JS_NewFloat64(ctx, parseLength(val))); hasText=true; continue; }
        if (prop == "line-height")     { JS_SetPropertyStr(ctx, textObj, "lineHeight",   JS_NewFloat64(ctx, parseLength(val))); hasText=true; continue; }
        if (prop == "letter-spacing")  { JS_SetPropertyStr(ctx, textObj, "letterSpacing",JS_NewFloat64(ctx, parseLength(val))); hasText=true; continue; }
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
        if (prop == "background-color" || prop == "border-color" || prop == "state-layer-color") {
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
            if (!parts.empty()) JS_SetPropertyStr(ctx, obj, "borderColor", JS_NewFloat64(ctx, parseColor(parts.back())));
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
            "border-radius","border-width","flex-grow","flex-shrink","flex-basis",
            "gap","row-gap","column-gap","opacity","elevation","scale",
            "translate-x","translate-y","top","right","bottom","left",
        };
        if (std::find(kLength.begin(), kLength.end(), prop) != kLength.end()) {
            JS_SetPropertyStr(ctx, obj, camelCase(prop).c_str(), JS_NewFloat64(ctx, parseLength(val)));
            continue;
        }

        // ── string / enum properties ──────────────────────────────────────
        static const std::vector<std::string> kString = {
            "flex-direction","justify-content","align-items","align-self",
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
static bool curlDownload(const std::string& url, const std::string& outPath,
                         const std::string& userAgent = {}) {
    std::string cmd = "curl -s -L -f";
    if (!userAgent.empty()) cmd += " -A \"" + userAgent + "\"";
    cmd += " -o \"" + outPath + "\" \"" + url + "\" 2>/dev/null";
    return system(cmd.c_str()) == 0 && std::filesystem::exists(outPath);
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
    std::vector<raym3::MediaMatch> mediaStack;

    auto inRuleContext = [&]() {
        if (inFontFace) return false;
        if (atDepth == 0) return true;
        return !mediaStack.empty() && mediaStack.back() != raym3::MediaMatch::None;
    };

    auto currentMedia = [&]() -> raym3::MediaMatch {
        if (mediaStack.empty()) return raym3::MediaMatch::None;
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
                if (header == "font-face") {
                    inFontFace = true;
                    fontFaceFamily.clear();
                    fontFaceSrc.clear();
                    mediaStack.push_back(raym3::MediaMatch::None);
                } else if (header.rfind("@media", 0) == 0) {
                    mediaStack.push_back(raym3::Stylesheet::ParseMediaHeader(tok.data));
                } else {
                    mediaStack.push_back(raym3::MediaMatch::None);
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
                }
                break;
            case CSSParser::SEL_START:
                if (inRuleContext()) {
                    curSelector = tok.data;
                    curProps.clear();
                    curProp.clear();
                }
                break;
            case CSSParser::PROPERTY:
                if (inFontFace) {
                    curProp = toLower(trimStr(tok.data));
                } else if (inRuleContext()) {
                    curProp = toLower(trimStr(tok.data));
                    if (curProp.rfind("--", 0) == 0) curProp.clear();
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
                } else if (inRuleContext() && !curProp.empty()) {
                    curProps[curProp] = trimStr(tok.data);
                    curProp.clear();
                }
                break;
            case CSSParser::SEL_END:
                if (inRuleContext() && !curSelector.empty()) {
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
    CSSPropMap merged = raym3::Stylesheet::Global().ResolveClasses(
        classNames, raym3::Theme::IsDarkMode());
    return buildStyleObject(ctx, merged);
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

    static const std::vector<std::string> prefixes = {"","./","apps/desktop/","../apps/desktop/"};
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

// ─── lifecycle ────────────────────────────────────────────────────────────────

void cleanupCSSBridge(JSContext* /*ctx*/) {
    raym3::Stylesheet::Global().Clear();
}
