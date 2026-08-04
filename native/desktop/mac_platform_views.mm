// macOS platform-view host: hybrid composition of AppKit views inside the raym3
// scene.
//
// Direct port of apps/ios/RayactPlatformViewHost.swift (UIView -> NSView). The
// Metal backend already grew the multi-surface API for iOS, so the overlay
// mechanism is identical: raym3 calls CompositeExternalView at each native-view
// boundary, we position the real NSView from the composition and hand back a
// CAMetalLayer-backed overlay whose registered rlmt surface receives everything
// painted afterwards. Framework content drawn above a platform view therefore
// occludes it, which a plain "put the view on top" approach can never do.
//
// Coordinates: raym3 works in top-left dp; AppKit points are dp too (the layer's
// contentsScale carries the backing factor), but its default origin is
// bottom-left — hence the flipped container view below.

#include <TargetConditionals.h>

// This file lives in native/desktop/, which the iOS Xcode project also compiles
// (apps/ios/project.yml excludes it, as it does mac_text_input.mm). The guard is
// belt and braces: a missing exclude would otherwise fail the iOS build on the
// first AppKit symbol, a long way from the cause.
#if defined(__APPLE__) && !TARGET_OS_IPHONE

#import <Cocoa/Cocoa.h>
#import <Metal/Metal.h>
#import <QuartzCore/CAMetalLayer.h>
#import <QuartzCore/CATransaction.h>

#include <cstdint>
#include <map>
#include <string>
#include <vector>

#include <raylib.h>
#include <raym3/v2/ExternalView.h>
#include <raym3/v2/RenderContext.h>

#include "raym3_bridge.hpp"
#include "module_views.hpp"

extern "C" {
bool rlmtRegisterSurface(unsigned long long surfaceId, void* caMetalLayer,
                         int widthPx, int heightPx);
void rlmtResizeRegisteredSurface(unsigned long long surfaceId, int widthPx, int heightPx);
bool rlmtSelectSurface(unsigned long long surfaceId);
void rlmtUnregisterSurface(unsigned long long surfaceId);
}

// ─── views ───────────────────────────────────────────────────────────────────

// Top-left origin so raym3's dp rects can be used as AppKit frames unchanged.
@interface RayactFlippedView : NSView
@end
@implementation RayactFlippedView
- (BOOL)isFlipped { return YES; }
// The container spans the whole window purely to host platform views. If it
// answered hit tests itself it would swallow every click that is not on one of
// them — including all raym3 content, which reaches the engine through GLFW's
// own content view. Same rule as Flutter's FlutterPlatformViewContainer.
- (NSView*)hitTest:(NSPoint)point {
    NSView* hit = [super hitTest:point];
    return hit != self ? hit : nil;
}
@end

// Wrapper that owns a platform view's geometry and pointer policy — the same
// role as Flutter's FlutterMutatorView. Framework content painted above the
// view reports its regions here, and the wrapper declines hits inside them so
// those pixels stay clickable by the engine.
@interface RayactPlatformHitTestView : NSView
- (void)setOccludingRegions:(const std::vector<raym3::v2::ExternalViewOcclusion>&)regions
                     origin:(Rectangle)bounds;
@end

@implementation RayactPlatformHitTestView {
    std::vector<raym3::v2::ExternalViewOcclusion> _ignore;
}
- (BOOL)isFlipped { return YES; }

- (void)setOccludingRegions:(const std::vector<raym3::v2::ExternalViewOcclusion>&)regions
                     origin:(Rectangle)bounds {
    _ignore.clear();
    _ignore.reserve(regions.size());
    for (const auto& occlusion : regions) {
        const Rectangle& r = occlusion.rect;
        _ignore.push_back({
            {r.x - bounds.x, r.y - bounds.y, r.width, r.height},
            occlusion.radius});
    }
}

- (NSView*)hitTest:(NSPoint)point {
    const NSPoint local = [self convertPoint:point fromView:self.superview];
    for (const auto& occlusion : _ignore) {
        const Rectangle& r = occlusion.rect;
        if (local.x >= r.x && local.x <= r.x + r.width &&
            local.y >= r.y && local.y <= r.y + r.height) {
            return nil;
        }
    }
    NSView* hit = [super hitTest:point];
    // Never claim the event for the wrapper itself; only the real platform view.
    return hit != self ? hit : nil;
}
@end

@interface RayactMetalOverlayView : NSView
@property(nonatomic, assign) unsigned long long registeredSurfaceId;
@end
@implementation RayactMetalOverlayView
- (BOOL)isFlipped { return YES; }
- (CALayer*)makeBackingLayer {
    CAMetalLayer* layer = [CAMetalLayer layer];
    // Overlays composite over the platform view beneath them.
    layer.opaque = NO;
    layer.framebufferOnly = YES;
    return layer;
}
- (CAMetalLayer*)metalLayer { return (CAMetalLayer*)self.layer; }
// Overlays are pure output; pointer events belong to the platform view below
// or to the base canvas.
- (NSView*)hitTest:(NSPoint)point { return nil; }
@end

namespace {

// Producer -> JS envelope, the same shape the Android/iOS/web hosts emit.
// RAYACT_PLATFORM_VIEW_TRACE=1 logs each one: platform-view content is
// composited into separate overlay layers, so a screenshot cannot show whether
// a module-owned view or the text editor is actually talking to JS — this can.
void emitEvent(int nodeId, NSDictionary* envelope) {
    NSData* data = [NSJSONSerialization dataWithJSONObject:envelope options:0 error:nil];
    if (!data) return;
    NSString* json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    static const bool trace = getenv("RAYACT_PLATFORM_VIEW_TRACE") != nullptr;
    if (trace) {
        TraceLog(LOG_INFO, "RAYACT_PLATFORM_VIEW emit node=%d %s", nodeId,
                 json.UTF8String);
    }
    rayactExternalViewEmitText(nodeId, json.UTF8String);
}

} // namespace

// Defined after the entry table below; the navigation delegate needs it.
static void rayactMacRunInjectedJavaScript(int nodeId);

// ─── per-kind controllers ────────────────────────────────────────────────────

@interface RayactMacTextEditor : NSTextField <NSTextFieldDelegate>
@property(nonatomic, assign) int rayactNodeId;
@end
@implementation RayactMacTextEditor
- (void)controlTextDidChange:(NSNotification*)note {
    emitEvent(self.rayactNodeId, @{ @"type": @"change", @"text": self.stringValue ?: @"" });
}
- (void)controlTextDidBeginEditing:(NSNotification*)note {
    emitEvent(self.rayactNodeId, @{ @"type": @"focus" });
}
- (void)controlTextDidEndEditing:(NSNotification*)note {
    emitEvent(self.rayactNodeId, @{ @"type": @"blur" });
}
- (BOOL)control:(NSControl*)control
             textView:(NSTextView*)textView
  doCommandBySelector:(SEL)selector {
    if (selector == @selector(insertNewline:)) {
        emitEvent(self.rayactNodeId,
                  @{ @"type": @"submit", @"text": self.stringValue ?: @"" });
        return YES;
    }
    return NO;
}
@end

// ─── host ────────────────────────────────────────────────────────────────────

namespace {

struct Entry {
    NSView* view = nil;                       // the real platform view
    RayactPlatformHitTestView* wrapper = nil; // owns geometry + pointer policy
    std::string kind;
    bool seenThisFrame = false;
    // Set when a native module (ABI 3) owns this kind: the module supplied the
    // view and owns its content, so every per-kind branch below defers to it.
    const RayactViewFactory* moduleFactory = nullptr;
    void* moduleInstance = nullptr;
    // notify_layout's contract is "first call carries the first non-zero bounds";
    // afterwards it fires only on a real size change.
    bool moduleLayoutSent = false;
    CGSize moduleLastSize = CGSizeZero;
    // Text-input only: raym3's editable region inside the node (the chrome —
    // label row, outline strip, horizontal padding — surrounds it). Sent by
    // components.ts as contentHorizontal/contentTop/contentBottom.
    float contentHorizontal = 16;
    float contentTop = 0;
    float contentBottom = 0;
    // AppKit hands out the shared field editor only while the field is first
    // responder, so the caret/selection tints are retained here and reapplied
    // every time editing starts.
    NSColor* caretColor = nil;
    NSColor* selectionColor = nil;
};

RayactFlippedView* g_container = nil;
std::map<int, Entry> g_entries;
std::vector<RayactMetalOverlayView*> g_overlayPool;
int g_overlayCursor = 0;
float g_frameDensity = 1.0f;

NSView* hostContentView() {
    NSWindow* window = (__bridge NSWindow*)GetWindowHandle();
    return window.contentView;
}

// One flipped, layer-backed container over the raylib CAMetalLayer holds every
// platform view and overlay, so ordering is just subview order.
RayactFlippedView* ensureContainer() {
    if (g_container && g_container.superview) return g_container;
    NSView* content = hostContentView();
    if (!content) return nil;
    g_container = [[RayactFlippedView alloc] initWithFrame:content.bounds];
    g_container.wantsLayer = YES;
    g_container.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [content addSubview:g_container];
    return g_container;
}

RayactMetalOverlayView* acquireOverlay(int index) {
    RayactFlippedView* container = ensureContainer();
    if (!container) return nil;
    if (index == (int)g_overlayPool.size()) {
        RayactMetalOverlayView* overlay =
            [[RayactMetalOverlayView alloc] initWithFrame:container.bounds];
        overlay.wantsLayer = YES;
        overlay.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        CAMetalLayer* base = (CAMetalLayer*)hostContentView().layer;
        overlay.metalLayer.device =
            [base isKindOfClass:[CAMetalLayer class]] && base.device
                ? base.device
                : MTLCreateSystemDefaultDevice();
        overlay.registeredSurfaceId = 1000ULL + (unsigned long long)index;
        [container addSubview:overlay];
        g_overlayPool.push_back(overlay);

        const CGFloat scale = g_frameDensity > 0 ? g_frameDensity : 1.0;
        const int w = (int)MAX(1.0, container.bounds.size.width * scale);
        const int h = (int)MAX(1.0, container.bounds.size.height * scale);
        overlay.metalLayer.contentsScale = scale;
        overlay.metalLayer.drawableSize = CGSizeMake(w, h);
        rlmtRegisterSurface(overlay.registeredSurfaceId,
                            (__bridge void*)overlay.metalLayer, w, h);
        if (g_overlayPool.size() > 2) {
            TraceLog(LOG_WARNING,
                     "RAYACT: %zu full-window platform-view overlays",
                     g_overlayPool.size());
        }
    }
    RayactMetalOverlayView* overlay = g_overlayPool[(size_t)index];
    overlay.frame = container.bounds;
    overlay.hidden = NO;

    // Keep the drawable in step with live window resizes.
    const CGFloat scale = g_frameDensity > 0 ? g_frameDensity : 1.0;
    const int w = (int)MAX(1.0, container.bounds.size.width * scale);
    const int h = (int)MAX(1.0, container.bounds.size.height * scale);
    if ((int)overlay.metalLayer.drawableSize.width != w ||
        (int)overlay.metalLayer.drawableSize.height != h) {
        overlay.metalLayer.contentsScale = scale;
        overlay.metalLayer.drawableSize = CGSizeMake(w, h);
        rlmtResizeRegisteredSurface(overlay.registeredSurfaceId, w, h);
    }
    return overlay;
}

// Mirrors applyMutators in the iOS host: bounds does the positioning, mutators
// contribute opacity, clipping and authored transforms only.
void applyMutators(const raym3::v2::ExternalViewComposition& composition, NSView* view) {
    CGFloat opacity = 1.0;
    bool hasClip = false;
    CGRect clip = CGRectZero;
    CGFloat clipRadius = 0.0;
    CATransform3D transform = CATransform3DIdentity;
    bool hasTransform = false;

    for (const auto& mutator : composition.mutators) {
        switch (mutator.kind) {
        case raym3::v2::ExternalViewMutatorKind::Opacity:
            opacity *= mutator.opacity;
            break;
        case raym3::v2::ExternalViewMutatorKind::ClipRect:
        case raym3::v2::ExternalViewMutatorKind::ClipRoundedRect: {
            CGRect local = CGRectMake(mutator.rect.x - composition.bounds.x,
                                      mutator.rect.y - composition.bounds.y,
                                      mutator.rect.width, mutator.rect.height);
            clip = hasClip ? CGRectIntersection(clip, local) : local;
            hasClip = true;
            clipRadius = MAX(clipRadius, mutator.radius);
            break;
        }
        case raym3::v2::ExternalViewMutatorKind::Transform: {
            const auto& t = mutator.transform;
            const float a = t[0], b = t[3], c = t[1], d = t[4], tx = t[2], ty = t[5];
            // Skip the ambient dp->pixel density scale raym3 pushes at the root:
            // AppKit points already are dp, exactly as on iOS.
            const bool densityScale =
                fabsf(a - g_frameDensity) < 0.001f && fabsf(d - g_frameDensity) < 0.001f &&
                fabsf(b) < 0.001f && fabsf(c) < 0.001f &&
                fabsf(tx) < 0.001f && fabsf(ty) < 0.001f;
            if (densityScale) break;
            CATransform3D affine = CATransform3DMakeAffineTransform(
                CGAffineTransformMake(a, b, c, d, tx, ty));
            transform = hasTransform ? CATransform3DConcat(transform, affine) : affine;
            hasTransform = true;
            break;
        }
        }
    }

    view.layer.opacity = (float)opacity;
    view.layer.anchorPoint = CGPointMake(0, 0);
    view.layer.transform = hasTransform ? transform : CATransform3DIdentity;
    if (hasClip) {
        view.layer.masksToBounds = YES;
        view.layer.cornerRadius = clipRadius;
    } else {
        view.layer.masksToBounds = NO;
        view.layer.cornerRadius = 0;
    }
}

std::string cppString(NSString* value) {
    return value ? std::string(value.UTF8String) : std::string();
}

// Position the platform view inside its wrapper. The webview fills it; the
// text editor gets raym3's editable region with its single line vertically
// centered — an NSTextField top-aligns its cell, so handing it the whole node
// put the glyphs in the top-left corner of the Material field.
void layoutEntryView(Entry& entry) {
    if (!entry.wrapper || !entry.view) return;
    CGRect target = entry.wrapper.bounds;
    if (entry.kind == "rayact.internal.text-input") {
        RayactMacTextEditor* field = (RayactMacTextEditor*)entry.view;
        const CGRect region = CGRectMake(
            entry.contentHorizontal, entry.contentTop,
            MAX(0.0, target.size.width - entry.contentHorizontal * 2.0),
            MAX(0.0, target.size.height - entry.contentTop - entry.contentBottom));
        CGFloat lineHeight =
            [field.cell cellSizeForBounds:NSMakeRect(0, 0, region.size.width,
                                                     CGFLOAT_MAX)].height;
        if (lineHeight <= 0 || lineHeight > region.size.height)
            lineHeight = region.size.height;
        // The wrapper is flipped, so y grows downward.
        target = CGRectMake(region.origin.x,
                            region.origin.y +
                                (region.size.height - lineHeight) / 2.0,
                            region.size.width, lineHeight);
    }
    // Same-value writes matter: re-assigning an editing NSTextField's frame
    // rebuilds the field editor and fires a spurious blur.
    if (!CGRectEqualToRect(entry.view.frame, target)) entry.view.frame = target;
}

void applyProps(Entry& entry, NSDictionary* props) {
    if (!props) return;
    if (entry.kind == "rayact.internal.text-input") {
        RayactMacTextEditor* field = (RayactMacTextEditor*)entry.view;
        NSString* value = props[@"value"];
        if ([value isKindOfClass:[NSString class]] &&
            ![field.stringValue isEqualToString:value]) {
            field.stringValue = value;
        }
        NSString* placeholder = props[@"placeholder"];
        if ([placeholder isKindOfClass:[NSString class]]) {
            field.placeholderString = placeholder;
        }
        NSNumber* editable = props[@"editable"];
        if ([editable isKindOfClass:[NSNumber class]]) field.editable = editable.boolValue;
        // Same-value writes to an editing NSTextField disturb the field editor
        // (typing attributes reset), and value props arrive on every keystroke.
        bool fontChanged = false;
        NSNumber* fontSize = props[@"fontSize"];
        if ([fontSize isKindOfClass:[NSNumber class]] && fontSize.doubleValue > 0 &&
            (!field.font || fabs(field.font.pointSize - fontSize.doubleValue) > 0.01)) {
            field.font = [NSFont systemFontOfSize:fontSize.doubleValue];
            fontChanged = true;
        }
        // 0xRRGGBBAA — the packed form the engine and every other editor use.
        auto colorFromProp = [](id value) -> NSColor* {
            if (![value isKindOfClass:[NSNumber class]]) return nil;
            const unsigned rgba = [(NSNumber*)value unsignedIntValue];
            return [NSColor colorWithSRGBRed:((rgba >> 24) & 0xFF) / 255.0
                                       green:((rgba >> 16) & 0xFF) / 255.0
                                        blue:((rgba >> 8) & 0xFF) / 255.0
                                       alpha:(rgba & 0xFF) / 255.0];
        };
        if (NSColor* color = colorFromProp(props[@"textColor"]))
            field.textColor = color;
        if (NSColor* color = colorFromProp(props[@"placeholderColor"])) {
            NSString* hint = field.placeholderString ?: @"";
            field.placeholderAttributedString =
                [[NSAttributedString alloc] initWithString:hint
                                               attributes:@{NSForegroundColorAttributeName: color}];
        }
        // AppKit takes the caret color from the field editor's insertion point
        // and the selection tint from its selected-text attributes.
        if (NSColor* color = colorFromProp(props[@"cursorColor"])) {
            entry.caretColor = color;
            if (NSTextView* editor = (NSTextView*)[field currentEditor])
                editor.insertionPointColor = color;
        }
        if (NSColor* color = colorFromProp(props[@"selectionColor"])) {
            entry.selectionColor = color;
            if (NSTextView* editor = (NSTextView*)[field currentEditor])
                editor.selectedTextAttributes = @{NSBackgroundColorAttributeName: color};
        }
        // Editable-region insets; a change moves the editor inside the chrome.
        bool insetsChanged = false;
        NSNumber* contentH = props[@"contentHorizontal"];
        NSNumber* contentT = props[@"contentTop"];
        NSNumber* contentB = props[@"contentBottom"];
        if ([contentH isKindOfClass:[NSNumber class]]) {
            insetsChanged |= entry.contentHorizontal != contentH.floatValue;
            entry.contentHorizontal = contentH.floatValue;
        }
        if ([contentT isKindOfClass:[NSNumber class]]) {
            insetsChanged |= entry.contentTop != contentT.floatValue;
            entry.contentTop = contentT.floatValue;
        }
        if ([contentB isKindOfClass:[NSNumber class]]) {
            insetsChanged |= entry.contentBottom != contentB.floatValue;
            entry.contentBottom = contentB.floatValue;
        }
        if (insetsChanged || fontChanged) layoutEntryView(entry);
        NSNumber* focused = props[@"focused"];
        if ([focused isKindOfClass:[NSNumber class]]) {
            // Idempotence is load-bearing: the chrome mirrors every editor
            // focus event straight back as a `focused` prop. Re-asserting
            // first responder on a field that is already editing restarts its
            // field editor — spurious end-editing, dropped keystrokes, and a
            // blur/focus echo loop that killed typing on the first character.
            // `currentEditor` is also the precise blur guard: the old check
            // (`isKindOfClass:NSTextView`) matched ANY field editor in the
            // window, so blurring this field could yank focus from another.
            const bool editing = field.currentEditor != nil;
            if (focused.boolValue) {
                if (!editing) [field.window makeFirstResponder:field];
                // The field editor is shared and freshly configured per focus,
                // so the caret/selection tints have to be reapplied here.
                if (NSTextView* editor = (NSTextView*)[field currentEditor]) {
                    if (entry.caretColor) editor.insertionPointColor = entry.caretColor;
                    if (entry.selectionColor) {
                        editor.selectedTextAttributes =
                            @{NSBackgroundColorAttributeName: entry.selectionColor};
                    }
                }
            } else if (editing) {
                [field.window makeFirstResponder:nil];
            }
        }

    }
}

} // namespace


namespace {

NSDictionary* parseProps(const char* json) {
    if (!json || !*json) return @{};
    NSData* data = [NSData dataWithBytes:json length:strlen(json)];
    id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    return [parsed isKindOfClass:[NSDictionary class]] ? parsed : @{};
}

// ─── embedder ────────────────────────────────────────────────────────────────

class MacExternalViewEmbedder final : public raym3::v2::ExternalViewEmbedder {
public:
    void BeginFrame(uint64_t /*surfaceId*/, Rectangle /*bounds*/, float density) override {
        g_frameDensity = density > 0 ? density : 1.0f;
        g_overlayCursor = 0;
        targetChanged_ = false;
        selectedOverlayId_ = 0;
        for (auto& [nodeId, entry] : g_entries) entry.seenThisFrame = false;
        ordered_.clear();
    }

    bool CompositeExternalView(
        const raym3::v2::ExternalViewComposition& composition) override {
        auto it = g_entries.find(composition.externalViewId);
        if (it == g_entries.end() || !it->second.view) return false;
        Entry& entry = it->second;

        RayactPlatformHitTestView* wrapper = entry.wrapper;
        wrapper.hidden = NO;
        const CGRect frame = CGRectMake(composition.bounds.x, composition.bounds.y,
                                        MAX(0.0f, composition.bounds.width),
                                        MAX(0.0f, composition.bounds.height));
        // Only write geometry that actually moved. Re-assigning an NSTextField's
        // frame while it is being edited tears down and rebuilds the field
        // editor, which fires controlTextDidEndEditing — so an unconditional
        // per-frame assignment produced a blur every frame and made the field
        // fight a platform view for first responder. It is also pure wasted work.
        if (!CGRectEqualToRect(wrapper.frame, frame)) {
            wrapper.frame = frame;
            // The wrapper carries transform/clip/opacity; the platform view is
            // positioned inside it (webview fills, text editor is centered in
            // raym3's editable region).
            layoutEntryView(entry);
        }
        applyMutators(composition, wrapper);
        entry.seenThisFrame = true;
        ordered_.push_back(wrapper);
        // Same signal for module-owned views: notify_layout's contract is that the
        // first call carries the first non-zero bounds.
        if (entry.moduleFactory && entry.moduleFactory->notify_layout) {
            const CGSize size = entry.view.frame.size;
            if (size.width > 0 && size.height > 0) {
                if (!entry.moduleLayoutSent || !CGSizeEqualToSize(size, entry.moduleLastSize)) {
                    entry.moduleLayoutSent = true;
                    entry.moduleLastSize = size;
                    entry.moduleFactory->notify_layout(entry.moduleInstance,
                                                       (float)size.width,
                                                       (float)size.height);
                }
            }
        }

        // Pointer parity with the compositor: the framework owns the pixels it
        // painted above this view, so the view must not claim them.
        [wrapper setOccludingRegions:composition.occludingRegions
                              origin:composition.bounds];

        // Nothing paints over this view this frame: keep the current target and
        // skip a whole CAMetalLayer overlay. The view is still embedded, so
        // return true — raym3 must not fall back to its placeholder texture.
        if (!composition.requiresOverlay) {
            targetChanged_ = false;
            static std::map<int, bool> loggedSkip;
            if (getenv("RAYACT_PLATFORM_VIEW_TRACE") &&
                !loggedSkip[composition.externalViewId]) {
                loggedSkip[composition.externalViewId] = true;
                TraceLog(LOG_INFO,
                         "RAYACT_PLATFORM_VIEW composite node=%d frame=%.0fx%.0f@%.0f,%.0f "
                         "overlay=none (nothing painted above it)",
                         composition.externalViewId, composition.bounds.width,
                         composition.bounds.height, composition.bounds.x,
                         composition.bounds.y);
            }
            return true;
        }

        RayactMetalOverlayView* overlay = acquireOverlay(g_overlayCursor);
        if (!overlay) return false;
        g_overlayCursor++;
        ordered_.push_back(overlay);

        const unsigned long long id = overlay.registeredSurfaceId;
        targetChanged_ = selectedOverlayId_ != id;
        if (!rlmtSelectSurface(id)) {
            TraceLog(LOG_WARNING,
                     "RAYACT_PLATFORM_VIEW rlmtSelectSurface(%llu) failed", id);
            return false;
        }
        selectedOverlayId_ = id;
        // One line per view per frame is far too noisy; report the first
        // successful composite of each node so a smoke run can be checked
        // headlessly (the window's composited output cannot be read back —
        // rlmtCaptureFrame only sees the base drawable).
        static std::map<int, bool> logged;
        if (!logged[composition.externalViewId]) {
            logged[composition.externalViewId] = true;
            TraceLog(LOG_INFO,
                     "RAYACT_PLATFORM_VIEW composite node=%d frame=%.0fx%.0f@%.0f,%.0f "
                     "overlay=%llu mutators=%zu",
                     composition.externalViewId, composition.bounds.width,
                     composition.bounds.height, composition.bounds.x,
                     composition.bounds.y, id, composition.mutators.size());
        }
        return true;
    }

    bool RequiresClipReplay() const override { return targetChanged_; }

    void EndFrame(uint64_t /*surfaceId*/) override {
        [CATransaction begin];
        [CATransaction setDisableActions:YES];
        for (auto& [nodeId, entry] : g_entries) {
            if (!entry.seenThisFrame) entry.wrapper.hidden = YES;
        }
        for (size_t i = 0; i < g_overlayPool.size(); ++i) {
            g_overlayPool[i].hidden = (int)i >= g_overlayCursor;
        }
        // Re-stack in composite order: [view][overlay][view][overlay]...
        // ONLY when the order actually changed. AppKit routes mouseUp to the
        // view that took mouseDown; remove+add that view mid-gesture — even
        // within one frame — and the rest of the event stream is dropped, so a
        // per-frame restack made every click on a platform view die after its
        // mousedown (button stuck in :active, WebKit never synthesized click).
        // Flutter's compositor reuses containers the same way.
        if (ordered_ != lastOrdered_) {
            RayactFlippedView* container = ensureContainer();
            for (NSView* view : ordered_) {
                if (view.superview == container) {
                    [view removeFromSuperview];
                    [container addSubview:view];
                }
            }
            lastOrdered_ = ordered_;
        }
        [CATransaction commit];
        rlmtSelectSurface(0);
        selectedOverlayId_ = 0;
    }

    void OnGestureDecision(int externalViewId, bool accepted) override {
        auto it = g_entries.find(externalViewId);
        if (it == g_entries.end()) return;
        // The framework claimed the gesture: take the view out of the responder
        // path for it. AppKit has no delaying recognizer equivalent, so this is
        // the coarse version of the iOS behaviour.
        if (accepted) return;
        // Neither a web view nor NSTextField is its own first responder — WebKit
        // installs an internal content view and AppKit a shared field editor —
        // so an identity check here never matched. Test the responder's view
        // ancestry instead.
        NSWindow* window = it->second.view.window;
        NSResponder* responder = window.firstResponder;
        if (![responder isKindOfClass:[NSView class]]) return;
        if ([(NSView*)responder isDescendantOf:it->second.view]) {
            [window makeFirstResponder:nil];
        }
    }

private:
    unsigned long long selectedOverlayId_ = 0;
    bool targetChanged_ = false;
    std::vector<NSView*> ordered_;
    // Last frame's composite order; compared by pointer value only (never
    // dereferenced), so a disposed view merely forces one restack.
    std::vector<NSView*> lastOrdered_;
};

MacExternalViewEmbedder g_embedder;

// ─── bridge host callbacks ───────────────────────────────────────────────────

void macPlatformViewCreate(int /*surfaceId*/, int nodeId, const char* kind,
                           const char* propsJson) {
    RayactFlippedView* container = ensureContainer();
    if (!container) return;
    const std::string kindStr = kind ? kind : "";
    NSDictionary* props = parseProps(propsJson);

    Entry entry;
    entry.kind = kindStr;
    // A native module owning this kind wins over every built-in branch. Modules
    // register during loadPlugins(), which runs before the window exists and so
    // before the external views committed at startup are replayed — a factory is
    // always in place before the first create for its kind.
    if (const RayactViewFactory* factory =
            rayact::moduleViewsFindFactory(kindStr.c_str())) {
        void* nativeView = nullptr;
        const std::string props = propsJson ? propsJson : "{}";
        void* instance = factory->create(factory->self, nodeId, props.c_str(),
                                         props.size(), &nativeView);
        if (instance && nativeView) {
            entry.moduleFactory = factory;
            entry.moduleInstance = instance;
            entry.view = (__bridge NSView*)nativeView;
            entry.view.wantsLayer = YES;
        } else {
            // The module refused this node. Fall through to a plain view rather
            // than leaving a hole: the engine still composites the node.
            TraceLog(LOG_WARNING,
                     "RAYACT_PLATFORM_VIEW module factory for kind=%s returned no view",
                     kindStr.c_str());
            if (instance) factory->dispose(instance);
            entry.view = [[NSView alloc] initWithFrame:NSZeroRect];
            entry.view.wantsLayer = YES;
        }
    } else if (kindStr == "rayact.internal.text-input") {
        RayactMacTextEditor* field = [[RayactMacTextEditor alloc] initWithFrame:NSZeroRect];
        field.rayactNodeId = nodeId;
        field.delegate = field;
        // raym3 keeps painting the Material container, label and outline; the
        // NSTextField supplies only glyphs, caret, selection and IME.
        field.bordered = NO;
        field.drawsBackground = NO;
        field.focusRingType = NSFocusRingTypeNone;
        field.wantsLayer = YES;
        entry.view = field;
    } else {
        NSView* view = [[NSView alloc] initWithFrame:NSZeroRect];
        view.wantsLayer = YES;
        entry.view = view;
    }

    entry.wrapper = [[RayactPlatformHitTestView alloc] initWithFrame:NSZeroRect];
    entry.wrapper.wantsLayer = YES;
    entry.wrapper.hidden = YES;   // shown by the first composite
    [entry.wrapper addSubview:entry.view];
    [container addSubview:entry.wrapper];
    g_entries[nodeId] = entry;
    // Module-owned views already received the initial props through create();
    // re-applying here would double-apply one-shot props such as `command`.
    if (!entry.moduleFactory) {
        // Apply into the stored entry, not the local copy: the webview keeps its
        // source and last-command state there.
        applyProps(g_entries[nodeId], props);
    }
    TraceLog(LOG_INFO, "RAYACT_PLATFORM_VIEW create node=%d kind=%s class=%s props=%.200s",
             nodeId, kindStr.c_str(), NSStringFromClass([entry.view class]).UTF8String,
             propsJson ? propsJson : "{}");
}

// raym3 pushes layout through the embedder's mutator stack, so the separate rect
// and input channels are unused here — same as iOS.
void macPlatformViewRect(int, int, const char*, float, float, float, float) {}
void macPlatformViewInput(int, int, int, float, float) {}

void macPlatformViewProps(int /*surfaceId*/, int nodeId, const char* propsJson) {
    auto it = g_entries.find(nodeId);
    if (it == g_entries.end()) return;
    static const bool trace = getenv("RAYACT_PLATFORM_VIEW_TRACE") != nullptr;
    if (trace) {
        TraceLog(LOG_INFO, "RAYACT_PLATFORM_VIEW props node=%d %.200s", nodeId,
                 propsJson ? propsJson : "{}");
    }
    // Module-owned kinds take the raw patch: no parse/re-serialize round trip, and
    // the JSON nulls the bridge uses as "prop removed" tombstones survive intact.
    Entry& entry = it->second;
    if (entry.moduleFactory) {
        const std::string patch = propsJson ? propsJson : "{}";
        entry.moduleFactory->set_properties(entry.moduleInstance, patch.c_str(),
                                            patch.size());
        return;
    }
    applyProps(entry, parseProps(propsJson));
}

void macPlatformViewDispose(int /*surfaceId*/, int nodeId) {
    auto it = g_entries.find(nodeId);
    if (it == g_entries.end()) return;
    if (it->second.moduleFactory) {
        it->second.moduleFactory->dispose(it->second.moduleInstance);
        it->second.moduleInstance = nullptr;
    }
    [it->second.wrapper removeFromSuperview];
    g_entries.erase(it);
}

} // namespace

namespace rayact {

void macInstallPlatformViews() {
    ::rayactSetExternalViewHostCallbacks(
        macPlatformViewCreate, macPlatformViewRect, macPlatformViewInput,
        macPlatformViewProps, macPlatformViewDispose);
    engineSetExternalViewEmbedder(&g_embedder);
    // The app already committed its tree before the window existed, so pick up
    // the external views that were created while no host was listening.
    ::rayactReplayExternalViewCreates();
}

} // namespace rayact

#endif // __APPLE__ && !TARGET_OS_IPHONE
