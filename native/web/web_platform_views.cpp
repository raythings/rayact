// Web platform-view host: hybrid composition of DOM elements inside the raym3
// scene.
//
// The browser counterpart of native/android/jni_bridge.cpp's
// AndroidExternalViewEmbedder and apps/ios/RayactPlatformViewHost.swift. raym3
// walks the tree, accumulates the transform/clip/opacity mutator stack, and
// calls CompositeExternalView at each native-view boundary; the JS manager in
// apps/web/shell.html positions the real DOM element from those mutators and
// hands back an overlay <canvas> whose registered rlwg surface becomes the
// render target for everything painted afterwards. That is what makes framework
// content drawn *above* a platform view actually occlude it, rather than the
// element floating on top of the whole scene.
//
// Geometry crosses the boundary in dp. On web CSS pixels are dp (the canvas
// backing store carries the device-pixel ratio), so the JS side applies the
// values unchanged — the same convention iOS uses with points.

#include <emscripten.h>

#include <cstdint>
#include <sstream>
#include <string>

#include <raym3/v2/Density.h>
#include <raym3/v2/ExternalView.h>
#include <raym3/v2/RenderContext.h>

#include "../desktop/raym3_bridge.hpp"

extern "C" {
bool rlwgRegisterSurface(unsigned long long surfaceId, const char* canvasSelector,
                         int width, int height);
void rlwgResizeRegisteredSurface(unsigned long long surfaceId, int width, int height);
bool rlwgSelectSurface(unsigned long long surfaceId);
}

namespace {

std::string jsonEscape(const char* raw) {
    std::string out;
    if (!raw) return out;
    for (const char* p = raw; *p; ++p) {
        switch (*p) {
        case '"':  out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n";  break;
        case '\r': out += "\\r";  break;
        case '\t': out += "\\t";  break;
        default:   out += *p;     break;
        }
    }
    return out;
}

// Serialize a composition the way the Android and iOS hosts do, so the three
// platform-view managers consume one shape.
std::string serializeComposition(const raym3::v2::ExternalViewComposition& composition) {
    std::ostringstream json;
    json << "{\"bounds\":{\"x\":" << composition.bounds.x
         << ",\"y\":" << composition.bounds.y
         << ",\"width\":" << composition.bounds.width
         << ",\"height\":" << composition.bounds.height
         << "},\"preservesFrameworkUnderlay\":"
         << (composition.preservesFrameworkUnderlay ? "true" : "false")
         << ",\"hitTestBehavior\":\"";
    switch (composition.hitTestBehavior) {
    case raym3::v2::ExternalViewHitTestBehavior::Transparent:
        json << "transparent"; break;
    case raym3::v2::ExternalViewHitTestBehavior::Translucent:
        json << "translucent"; break;
    default:
        json << "opaque"; break;
    }
    json << "\",\"mutators\":[";
    for (size_t i = 0; i < composition.mutators.size(); ++i) {
        if (i) json << ',';
        const auto& mutator = composition.mutators[i];
        json << '{';
        switch (mutator.kind) {
        case raym3::v2::ExternalViewMutatorKind::Transform:
            json << "\"kind\":\"transform\",\"matrix\":[";
            for (size_t m = 0; m < mutator.transform.size(); ++m) {
                if (m) json << ',';
                json << mutator.transform[m];
            }
            json << ']';
            break;
        case raym3::v2::ExternalViewMutatorKind::ClipRect:
        case raym3::v2::ExternalViewMutatorKind::ClipRoundedRect:
            json << "\"kind\":\""
                 << (mutator.kind == raym3::v2::ExternalViewMutatorKind::ClipRect
                         ? "clipRect" : "clipRoundedRect")
                 << "\",\"rect\":{\"x\":" << mutator.rect.x
                 << ",\"y\":" << mutator.rect.y
                 << ",\"width\":" << mutator.rect.width
                 << ",\"height\":" << mutator.rect.height
                 << "},\"radius\":" << mutator.radius;
            break;
        case raym3::v2::ExternalViewMutatorKind::Opacity:
            json << "\"kind\":\"opacity\",\"opacity\":" << mutator.opacity;
            break;
        }
        json << '}';
    }
    json << "],\"requiresOverlay\":"
         << (composition.requiresOverlay ? "true" : "false")
         << ",\"occludingRegions\":[";
    for (size_t i = 0; i < composition.occludingRegions.size(); ++i) {
        if (i) json << ',';
        const Rectangle& r = composition.occludingRegions[i];
        json << "{\"x\":" << r.x << ",\"y\":" << r.y
             << ",\"width\":" << r.width << ",\"height\":" << r.height << '}';
    }
    json << "]}";
    return json.str();
}

class WebExternalViewEmbedder final : public raym3::v2::ExternalViewEmbedder {
public:
    void BeginFrame(uint64_t surfaceId, Rectangle bounds, float density) override {
        targetChanged_ = false;
        selectedOverlayId_ = 0;
        EM_ASM({
            var pv = Module.__rayactPlatformViews;
            if (pv) pv.beginFrame($0, $1, $2, $3);
        }, (int)surfaceId, bounds.width, bounds.height, density);
    }

    bool CompositeExternalView(
        const raym3::v2::ExternalViewComposition& composition) override {
        const std::string payload = serializeComposition(composition);
        // JS returns the rlwg surface id of the overlay canvas to draw into
        // from here on, 0 when it could not provide one, and -1 when none was
        // needed (nothing paints over this view).
        const int overlayId = EM_ASM_INT({
            var pv = Module.__rayactPlatformViews;
            if (!pv) return 0;
            return pv.composite($0, $1, UTF8ToString($2)) | 0;
        }, (int)raym3::v2::Ctx().surfaceId, composition.externalViewId,
           payload.c_str());
        // No overlay required: the view is still embedded (so raym3 must not
        // draw its placeholder texture), we simply keep painting into the
        // current target and skip a whole surface.
        if (overlayId < 0) {
            targetChanged_ = false;
            return true;
        }
        if (overlayId == 0) return false;

        const unsigned long long id = (unsigned long long)overlayId;
        targetChanged_ = selectedOverlayId_ != id;
        if (!rlwgSelectSurface(id)) return false;
        selectedOverlayId_ = id;
        return true;
    }

    // Only a genuine target switch invalidates the clip attachments; repeated
    // composites into the same overlay keep the pass state raym3 already built.
    bool RequiresClipReplay() const override { return targetChanged_; }

    void EndFrame(uint64_t surfaceId) override {
        EM_ASM({
            var pv = Module.__rayactPlatformViews;
            if (pv) pv.endFrame($0);
        }, (int)surfaceId);
        // Back to the base canvas so the next screen (and the next frame's
        // accessibility/present work) starts from a known target.
        rlwgSelectSurface(0);
        selectedOverlayId_ = 0;
    }

    void OnGestureDecision(int externalViewId, bool accepted) override {
        EM_ASM({
            var pv = Module.__rayactPlatformViews;
            if (pv) pv.gestureDecision($0, $1, $2 !== 0);
        }, (int)raym3::v2::Ctx().surfaceId, externalViewId, accepted ? 1 : 0);
    }

private:
    unsigned long long selectedOverlayId_ = 0;
    bool targetChanged_ = false;
};

WebExternalViewEmbedder g_embedder;

void webPlatformViewCreate(int surfaceId, int nodeId, const char* kind,
                           const char* propsJson) {
    const std::string k = jsonEscape(kind);
    EM_ASM({
        var pv = Module.__rayactPlatformViews;
        if (pv) pv.create($0, $1, UTF8ToString($2), UTF8ToString($3));
    }, surfaceId, nodeId, k.c_str(), propsJson ? propsJson : "{}");
}

// raym3 pushes layout rects through the embedder's mutator stack, so the rect
// channel is redundant on web exactly as it is on iOS. Kept so the callback
// table stays the shape the bridge expects.
void webPlatformViewRect(int, int, const char*, float, float, float, float) {}

// DOM elements receive their own pointer events; the bridge's forwarded input
// channel is for hosts that render the view offscreen (Android's VirtualDisplay).
void webPlatformViewInput(int, int, int, float, float) {}

void webPlatformViewProps(int surfaceId, int nodeId, const char* propsJson) {
    EM_ASM({
        var pv = Module.__rayactPlatformViews;
        if (pv) pv.setProperties($0, $1, UTF8ToString($2));
    }, surfaceId, nodeId, propsJson ? propsJson : "{}");
}

void webPlatformViewDispose(int surfaceId, int nodeId) {
    EM_ASM({
        var pv = Module.__rayactPlatformViews;
        if (pv) pv.dispose($0, $1);
    }, surfaceId, nodeId);
}

} // namespace

namespace rayact {

void webInstallPlatformViews() {
    ::rayactSetExternalViewHostCallbacks(
        webPlatformViewCreate, webPlatformViewRect, webPlatformViewInput,
        webPlatformViewProps, webPlatformViewDispose);
    engineSetExternalViewEmbedder(&g_embedder);
}

} // namespace rayact

// Overlay-surface registration for the JS manager. These exist so the shell
// never crosses the i64 boundary: rlwg's surface ids are uint64_t for parity
// with rlvk/rlmt, and with -sWASM_BIGINT a plain JS number passed to such a
// parameter throws "Cannot convert N to a BigInt" — inside an EM_ASM callback,
// which kills the whole render loop.
extern "C" EMSCRIPTEN_KEEPALIVE int rayactWebRegisterOverlaySurface(
    int surfaceId, const char* canvasSelector, int width, int height) {
    return rlwgRegisterSurface((unsigned long long)surfaceId, canvasSelector,
                               width, height) ? 1 : 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebResizeOverlaySurface(
    int surfaceId, int width, int height) {
    rlwgResizeRegisteredSurface((unsigned long long)surfaceId, width, height);
}

// Producer-driven events (an <input>'s `input` event, a webview's postMessage)
// re-enter JS through the node's onNativeEvent/onChangeText callback. Called
// from the JS manager with a JSON envelope, matching the mobile hosts.
extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebExternalViewEvent(int nodeId,
                                                               const char* payload) {
    rayactExternalViewEmitText(nodeId, payload ? payload : "");
}
