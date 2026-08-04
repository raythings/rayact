// @rayact/svg — SVG rendering as a rayact native module.
//
// Registers two things with the host:
//   - the "svg" node kind, so <Svg> is a real render node the engine lays out and
//     the module paints (module ABI 2)
//   - an "svg" bus module for imperative calls (stats, warnings, selftest)
//
// The rendering itself is raysvg, compiled into this plugin. raysvg never links
// raylib; in a dynamic build its rl* symbols come from raylib_gpu_shim.cpp, which
// forwards to the host's GPU table.
//
// Threading, per the ABI contract: create/update/dispose arrive on the engine's JS
// thread, draw/gpu_reset/needs_frame on the render thread. Documents are therefore
// guarded — the engine does not synchronize this for us.

#include "rayact_module_abi.h"
#include "gpu_shim.hpp"
#include "json.hpp"

#include "raysvg.h"
#include "rsvg_scene.hpp" // raysvg's own colour parser, so vars parse like any paint

#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <map>
#include <mutex>
#include <string>
#include <vector>

namespace {

const RayactHost* g_host = nullptr;

struct SvgNode {
    std::string source;
    RaysvgDoc* doc = nullptr;
    // Outlines currently enabled, so the prop stays declarative: an id dropped from
    // the array is switched back off rather than lingering.
    std::vector<std::string> outlineIds;
};

std::mutex g_mtx;
std::map<int32_t, SvgNode> g_nodes;

void logf(int level, const char* fmt, ...) {
    if (!g_host || !g_host->log) return;
    char buf[512];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    g_host->log(level, buf);
}

// Colour values accept the syntaxes raysvg itself parses (#hex, rgb()/rgba(),
// hsl(), named) plus a packed 0xRRGGBBAA integer. Using raysvg's parser rather than
// the engine's keeps a var consistent with every other paint in the same document.
bool valueToColor(const rsvgjson::Value& v, Color* out) {
    if (v.isString()) {
        return rsvg::ParseColor(v.string.c_str(), v.string.size(), out);
    }
    if (v.isNumber()) {
        const uint32_t c = (uint32_t)v.number;
        out->r = (unsigned char)((c >> 24) & 0xFF);
        out->g = (unsigned char)((c >> 16) & 0xFF);
        out->b = (unsigned char)((c >> 8) & 0xFF);
        out->a = (unsigned char)(c & 0xFF);
        return true;
    }
    return false;
}

// Applies the { vars, channels, outline } prop bag. Absent fields leave state alone.
// Returns true when the document ended up needing a repaint.
bool applyProps(SvgNode& node, const rsvgjson::Value& props) {
    RaysvgDoc* doc = node.doc;
    if (!doc || !props.isObject()) return false;

    const rsvgjson::Value& vars = props["vars"];
    if (vars.isObject()) {
        for (const auto& [name, value] : vars.object) {
            Color c{};
            if (valueToColor(value, &c)) RaysvgSetVar(doc, name.c_str(), c);
        }
    }

    // channels: { "element-id": [translateX, translateY, rotationDeg, scaleX, scaleY] }
    const rsvgjson::Value& channels = props["channels"];
    if (channels.isObject()) {
        for (const auto& [id, value] : channels.object) {
            if (!value.isArray()) continue;
            const RaysvgHandle h = RaysvgGetElementById(doc, id.c_str());
            if (h == RAYSVG_INVALID_HANDLE) continue;
            const double defaults[5] = {0.0, 0.0, 0.0, 1.0, 1.0};
            double v[5];
            for (int k = 0; k < 5; k++) {
                v[k] = ((size_t)k < value.array.size()) ? value.array[k].numberOr(defaults[k])
                                                        : defaults[k];
            }
            RaysvgSetTransform(doc, h, (float)v[0], (float)v[1], (float)v[2], (float)v[3],
                               (float)v[4]);
        }
    }

    // outline: array of element ids, or of { id, color?, radius? }.
    const rsvgjson::Value& outline = props["outline"];
    if (outline.isArray()) {
        for (const std::string& prev : node.outlineIds) {
            const RaysvgHandle h = RaysvgGetElementById(doc, prev.c_str());
            if (h != RAYSVG_INVALID_HANDLE) {
                RaysvgSetOutline(doc, h, false, Color{0, 0, 0, 255}, 0.0f);
            }
        }
        node.outlineIds.clear();
        for (const rsvgjson::Value& entry : outline.array) {
            std::string id;
            Color color{26, 26, 26, 255};
            double radius = 4.5;
            if (entry.isString()) {
                id = entry.string;
            } else if (entry.isObject()) {
                const rsvgjson::Value& idVal = entry["id"];
                if (idVal.isString()) id = idVal.string;
                Color parsed{};
                if (valueToColor(entry["color"], &parsed)) color = parsed;
                radius = entry["radius"].numberOr(radius);
            }
            if (id.empty()) continue;
            const RaysvgHandle h = RaysvgGetElementById(doc, id.c_str());
            if (h != RAYSVG_INVALID_HANDLE) {
                RaysvgSetOutline(doc, h, true, color, (float)radius);
                node.outlineIds.push_back(id);
            }
        }
    }

    return RaysvgNeedsRedraw(doc);
}

// ─── Node kind vtable ─────────────────────────────────────────────────────────

int svgCreate(void*, int32_t nodeId, const char* propsJson, size_t propsLen) {
    rsvgjson::Value props;
    const bool haveProps = rsvgjson::parse(propsJson, propsLen, props);
    if (propsLen > 0 && !haveProps) {
        logf(4, "svg: node %d has malformed props JSON", (int)nodeId);
        return -1;
    }

    std::string source;
    if (haveProps && props["source"].isString()) source = props["source"].string;

    // Inline markup is accepted directly so a caller can build SVG at runtime;
    // anything else is a path the caller already resolved through the asset pipeline.
    RaysvgDoc* doc = nullptr;
    if (source.size() > 4 && source.find('<') != std::string::npos) {
        doc = RaysvgLoadFromString(source.c_str(), -1);
    } else if (!source.empty()) {
        doc = RaysvgLoadFromFile(source.c_str());
    }
    if (!doc) {
        logf(4, "svg: load failed for node %d: %s", (int)nodeId, RaysvgGetLastError());
        // Keep the node: an empty document draws nothing but stays updatable, which
        // matches how the engine-side implementation behaved.
    } else {
        const RaysvgStats stats = RaysvgGetStats(doc);
        const int warnings = RaysvgGetWarnings(doc, nullptr, 0);
        logf(3, "svg: node %d loaded — %d elements, %d shapes, %d warnings", (int)nodeId,
             stats.elementCount, stats.shapeCount, warnings);
        const char* messages[8];
        const int shown = RaysvgGetWarnings(doc, messages, 8);
        for (int i = 0; i < shown; i++) logf(4, "svg: %s", messages[i]);
    }

    std::lock_guard<std::mutex> lk(g_mtx);
    SvgNode& node = g_nodes[nodeId];
    node.source = std::move(source);
    node.doc = doc;
    if (haveProps) return applyProps(node, props) ? 1 : 0;
    return 0;
}

int svgUpdate(void*, int32_t nodeId, const char* propsJson, size_t propsLen) {
    rsvgjson::Value props;
    if (!rsvgjson::parse(propsJson, propsLen, props)) return 0;
    std::lock_guard<std::mutex> lk(g_mtx);
    auto it = g_nodes.find(nodeId);
    if (it == g_nodes.end()) return 0;
    return applyProps(it->second, props) ? 1 : 0;
}

void svgDraw(void*, int32_t nodeId, RayactRect layout) {
    // Held across the draw so a concurrent dispose cannot unload the document
    // mid-paint. Drawing is a cached-geometry replay, so the critical section is short.
    std::lock_guard<std::mutex> lk(g_mtx);
    auto it = g_nodes.find(nodeId);
    if (it == g_nodes.end() || !it->second.doc) return;
    RaysvgDraw(it->second.doc, Rectangle{layout.x, layout.y, layout.width, layout.height});
}

void svgDispose(void*, int32_t nodeId) {
    std::lock_guard<std::mutex> lk(g_mtx);
    auto it = g_nodes.find(nodeId);
    if (it == g_nodes.end()) return;
    if (it->second.doc) RaysvgUnload(it->second.doc);
    g_nodes.erase(it);
}

void svgGpuReset(void*) {
    std::lock_guard<std::mutex> lk(g_mtx);
    for (auto& [id, node] : g_nodes) {
        (void)id;
        if (node.doc) RaysvgNotifyGpuReset(node.doc);
    }
}

int svgNeedsFrame(void*) {
    std::lock_guard<std::mutex> lk(g_mtx);
    for (auto& [id, node] : g_nodes) {
        (void)id;
        if (node.doc && RaysvgNeedsRedraw(node.doc)) return 1;
    }
    return 0;
}

// ─── Bus module (imperative calls) ────────────────────────────────────────────

std::string g_invokeResult;

int svgInvoke(void*, const char* method, RayactBytes args, RayactBytes* out) {
    const std::string m = method ? method : "";
    g_invokeResult.clear();

    if (m == "stats") {
        // Aggregate across live documents; enough for a smoke test and for surfacing
        // "is this actually drawing anything" without a debugger.
        int docs = 0, shapes = 0, elements = 0;
        {
            std::lock_guard<std::mutex> lk(g_mtx);
            for (auto& [id, node] : g_nodes) {
                (void)id;
                if (!node.doc) continue;
                const RaysvgStats s = RaysvgGetStats(node.doc);
                docs++;
                shapes += s.shapeCount;
                elements += s.elementCount;
            }
        }
        char buf[160];
        snprintf(buf, sizeof(buf), "{\"documents\":%d,\"shapes\":%d,\"elements\":%d}", docs,
                 shapes, elements);
        g_invokeResult = buf;
    } else if (m == "warnings") {
        std::lock_guard<std::mutex> lk(g_mtx);
        int total = 0;
        for (auto& [id, node] : g_nodes) {
            (void)id;
            if (node.doc) total += RaysvgGetWarnings(node.doc, nullptr, 0);
        }
        g_invokeResult = std::to_string(total);
    } else if (m == "selftest") {
        // Exercises module→module dispatch: write and read back through the built-in
        // kv module, which is the ABI's own example of a module using another.
        if (!g_host || !g_host->invoke) return -1;
        const char* payload = "\x04\x00\x00\x00svg1\x02\x00\x00\x00ok";
        RayactBytes in{(const uint8_t*)payload, 14};
        RayactBytes res{nullptr, 0};
        RayactReleaseFn rel = nullptr;
        void* self = nullptr;
        const int rc = g_host->invoke("kv", "set", in, &res, &rel, &self);
        if (res.ptr && rel) rel(self, res);
        g_invokeResult = (rc == 0) ? "ok" : "kv-unavailable";
    } else {
        return -1;
    }

    if (out) {
        out->ptr = (const uint8_t*)g_invokeResult.data();
        out->len = g_invokeResult.size();
    }
    (void)args;
    return 0;
}

} // namespace

// ─── Registration ─────────────────────────────────────────────────────────────

extern "C" int rayact_svg_register(const RayactHost* host) {
    // Node kinds, the GPU table and shared buffers all arrived in ABI 2; this module
    // cannot do its job without them. Compare with >=, never ==, so a newer host
    // keeps working (see rayact_module_abi.h).
    if (!host || host->abi_version < 2u) return -1;
    g_host = host;

    if (host->gpu) rsvgSetGpuApi(host->gpu());

    RayactModule mod{};
    mod.abi_version = RAYACT_MODULE_ABI_VERSION;
    mod.self = nullptr;
    mod.invoke = svgInvoke;
    mod.release = nullptr; // results live in a static buffer, nothing to free
    if (host->register_module("svg", &mod) != 0) return -1;

    RayactNodeVTable vt{};
    vt.struct_size = sizeof(RayactNodeVTable);
    vt.self = nullptr;
    vt.create = svgCreate;
    vt.update = svgUpdate;
    vt.draw = svgDraw;
    vt.dispose = svgDispose;
    vt.gpu_reset = svgGpuReset;
    vt.needs_frame = svgNeedsFrame;
    if (!host->register_node_kind || host->register_node_kind("svg", &vt) != 0) return -1;

    return 0;
}

// The generic dlopen entry point, omitted on two platforms for opposite reasons:
// iOS links plugins statically into the host, where every module defining this same
// symbol would collide; web is dynamically loaded but declares the entry in its own
// registration file (web_register.cpp), which would otherwise duplicate it here.
#if !defined(RAYACT_IOS) && !defined(RAYACT_WEB)
extern "C" RAYACT_MODULE_EXPORT int rayact_module_register(const RayactHost* host) {
    return rayact_svg_register(host);
}
#endif
