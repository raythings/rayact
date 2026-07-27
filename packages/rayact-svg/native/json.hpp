// Minimal JSON reader for module props.
//
// The module ABI hands node props across as UTF-8 JSON, and a plugin has no QuickJS
// to parse them with. This is deliberately small: enough for prop bags (objects,
// arrays, strings, numbers, bools, null), no streaming, no comments, no big-number
// handling. Parsing is one pass into an owned tree; on malformed input the parse
// fails rather than guessing.

#pragma once

#include <cstdint>
#include <cstdlib>
#include <map>
#include <string>
#include <vector>

namespace rsvgjson {

struct Value;
using Object = std::map<std::string, Value>;
using Array = std::vector<Value>;

enum class Type { Null, Bool, Number, String, Array, Object };

struct Value {
    Type type = Type::Null;
    bool boolean = false;
    double number = 0.0;
    std::string string;
    Array array;
    Object object;

    bool isNull() const { return type == Type::Null; }
    bool isNumber() const { return type == Type::Number; }
    bool isString() const { return type == Type::String; }
    bool isArray() const { return type == Type::Array; }
    bool isObject() const { return type == Type::Object; }

    // Object lookup; returns a static null value when absent so callers can chain.
    const Value& operator[](const std::string& key) const {
        static const Value kNull;
        if (type != Type::Object) return kNull;
        auto it = object.find(key);
        return it == object.end() ? kNull : it->second;
    }

    double numberOr(double fallback) const { return type == Type::Number ? number : fallback; }
};

namespace detail {

struct Parser {
    const char* p;
    const char* end;

    void skipWs() {
        while (p < end && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')) p++;
    }

    bool literal(const char* text) {
        const size_t n = strlen(text);
        if ((size_t)(end - p) < n || strncmp(p, text, n) != 0) return false;
        p += n;
        return true;
    }

    // Appends one UTF-8 encoding of `cp`.
    static void appendUtf8(std::string& out, uint32_t cp) {
        if (cp <= 0x7f) {
            out.push_back((char)cp);
        } else if (cp <= 0x7ff) {
            out.push_back((char)(0xc0 | (cp >> 6)));
            out.push_back((char)(0x80 | (cp & 0x3f)));
        } else if (cp <= 0xffff) {
            out.push_back((char)(0xe0 | (cp >> 12)));
            out.push_back((char)(0x80 | ((cp >> 6) & 0x3f)));
            out.push_back((char)(0x80 | (cp & 0x3f)));
        } else {
            out.push_back((char)(0xf0 | (cp >> 18)));
            out.push_back((char)(0x80 | ((cp >> 12) & 0x3f)));
            out.push_back((char)(0x80 | ((cp >> 6) & 0x3f)));
            out.push_back((char)(0x80 | (cp & 0x3f)));
        }
    }

    bool hex4(uint32_t& out) {
        if (end - p < 4) return false;
        out = 0;
        for (int i = 0; i < 4; i++) {
            const char c = p[i];
            out <<= 4;
            if (c >= '0' && c <= '9') out |= (uint32_t)(c - '0');
            else if (c >= 'a' && c <= 'f') out |= (uint32_t)(c - 'a' + 10);
            else if (c >= 'A' && c <= 'F') out |= (uint32_t)(c - 'A' + 10);
            else return false;
        }
        p += 4;
        return true;
    }

    bool parseString(std::string& out) {
        if (p >= end || *p != '"') return false;
        p++;
        out.clear();
        while (p < end) {
            const char c = *p++;
            if (c == '"') return true;
            if (c != '\\') {
                out.push_back(c);
                continue;
            }
            if (p >= end) return false;
            const char esc = *p++;
            switch (esc) {
                case '"': out.push_back('"'); break;
                case '\\': out.push_back('\\'); break;
                case '/': out.push_back('/'); break;
                case 'b': out.push_back('\b'); break;
                case 'f': out.push_back('\f'); break;
                case 'n': out.push_back('\n'); break;
                case 'r': out.push_back('\r'); break;
                case 't': out.push_back('\t'); break;
                case 'u': {
                    uint32_t cp = 0;
                    if (!hex4(cp)) return false;
                    // Surrogate pair: the low half follows as a second \u escape.
                    if (cp >= 0xd800 && cp <= 0xdbff && (end - p) >= 6 && p[0] == '\\' && p[1] == 'u') {
                        const char* save = p;
                        p += 2;
                        uint32_t low = 0;
                        if (hex4(low) && low >= 0xdc00 && low <= 0xdfff) {
                            cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
                        } else {
                            p = save;
                        }
                    }
                    appendUtf8(out, cp);
                    break;
                }
                default: return false;
            }
        }
        return false;
    }

    bool parseValue(Value& out, int depth) {
        if (depth > 32) return false; // prop bags are shallow; bail rather than recurse
        skipWs();
        if (p >= end) return false;
        const char c = *p;
        if (c == '{') {
            p++;
            out.type = Type::Object;
            skipWs();
            if (p < end && *p == '}') { p++; return true; }
            while (p < end) {
                skipWs();
                std::string key;
                if (!parseString(key)) return false;
                skipWs();
                if (p >= end || *p != ':') return false;
                p++;
                Value child;
                if (!parseValue(child, depth + 1)) return false;
                out.object[key] = std::move(child);
                skipWs();
                if (p < end && *p == ',') { p++; continue; }
                if (p < end && *p == '}') { p++; return true; }
                return false;
            }
            return false;
        }
        if (c == '[') {
            p++;
            out.type = Type::Array;
            skipWs();
            if (p < end && *p == ']') { p++; return true; }
            while (p < end) {
                Value child;
                if (!parseValue(child, depth + 1)) return false;
                out.array.push_back(std::move(child));
                skipWs();
                if (p < end && *p == ',') { p++; continue; }
                if (p < end && *p == ']') { p++; return true; }
                return false;
            }
            return false;
        }
        if (c == '"') {
            out.type = Type::String;
            return parseString(out.string);
        }
        if (literal("true")) { out.type = Type::Bool; out.boolean = true; return true; }
        if (literal("false")) { out.type = Type::Bool; out.boolean = false; return true; }
        if (literal("null")) { out.type = Type::Null; return true; }

        char* numEnd = nullptr;
        const double n = strtod(p, &numEnd);
        if (numEnd == p) return false;
        p = numEnd;
        out.type = Type::Number;
        out.number = n;
        return true;
    }
};

} // namespace detail

// Parses `text`. Returns false (leaving `out` unspecified) on malformed input.
inline bool parse(const char* text, size_t len, Value& out) {
    if (!text || len == 0) return false;
    detail::Parser parser{text, text + len};
    if (!parser.parseValue(out, 0)) return false;
    parser.skipWs();
    return parser.p == parser.end; // reject trailing garbage
}

} // namespace rsvgjson
