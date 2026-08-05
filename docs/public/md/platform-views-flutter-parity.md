# Platform views: how Flutter does it, and what rayact must copy

> Historical design study. The gaps and port plan below describe the pre-ABI-3
> implementation that motivated the work. Rayact 0.0.5 now ships platform-view
> factories, full prop forwarding, Android/iOS/macOS native view hosts, native
> text input, input arbitration, and ABI-5 off-screen frame delivery. Windows
> WebView uses CEF OSR and paints into normal renderer z-order. The Flutter
> analysis remains useful background, but the “current state” tables are not a
> 0.0.5 status report.

Source read: `flutter/engine/src/flutter/shell/platform/{android,darwin/ios}` at the local
checkout, plus `flutter/packages` (framework) and the `webview_flutter` federated plugin.

The webview plugin itself is thin — it is a `WKWebView` / `android.webkit.WebView` handed to a
platform-view factory. All the hard parts live in the engine's platform-view embedder. That is what
this document is about.

## 1. Flutter has four composition modes, not one

| # | Mode | Platform | Pixels reach the scene by | Native view in hierarchy? |
|---|------|----------|---------------------------|---------------------------|
| 1 | Virtual Display | Android (legacy) | view renders into a `VirtualDisplay` → `SurfaceTexture` → GL texture | **no** (lives on a fake display) |
| 2 | Texture Layer Hybrid Composition (TLHC) | Android (**default**) | `PlatformViewWrapper.draw()` redirects the subtree into an `ImageReader`/`SurfaceProducer` Surface → engine imports as texture | **yes** |
| 3 | Hybrid Composition (HC) | Android (opt-in) | native view drawn by Android; Flutter content above it goes into `FlutterImageView` overlays | yes |
| 4 | Hybrid Composition++ (HCPP) | Android 14+, `PlatformViewsController2` | native view drawn by Android; one overlay `SurfaceControl` z-ordered above with a crop rect — zero copy | yes |
| 5 | — | **iOS** | there is no texture mode. Always real `UIView`s + Flutter overlay layers | yes |

**Rayact at the time of this study used mode 1**, the one Flutter was trying to delete
([`raym3_bridge.cpp:2758`](https://github.com/raythings/rayact/blob/main/native/desktop/raym3_bridge.cpp), Android `VirtualDisplay` +
`AHardwareBuffer` import).

The single most important finding: **iOS has no texture path at all.** `WKWebView` renders
out-of-process; `-drawViewHierarchyInRect:afterScreenUpdates:` is slow and frequently blank for it.
Flutter never attempts to capture it. So rayact's "ExternalView is a texture" abstraction cannot be
extended to iOS webviews — iOS needs real-view composition with layer slicing.

## 2. The four invariants Flutter maintains

### (a) The native view is a real view in the real hierarchy

Even in the texture mode. `PlatformViewWrapper` is a `FrameLayout` added to `FlutterView`,
positioned at the platform view's logical rect via `layoutParams.leftMargin/topMargin`
(`PlatformViewWrapper.setLayoutParams`). It is a real view *specifically so that* IME, focus,
accessibility, text selection, autofill and hover work with zero extra code:

> Since the view is in the Android view hierarchy, keyboard and accessibility interactions behave
> normally. — `PlatformViewWrapper` class doc

This is what buys "full support for interacting with the webview". Virtual-display mode had to
re-implement all of it (`SingleViewPresentation`, `SingleViewWindowManager`,
`SingleViewFakeWindowViewGroup`, `WindowManagerHandler` — ~600 lines of shim) and still got it
wrong.

### (b) Pixels are redirected, not captured

`PlatformViewWrapper.draw(Canvas)` overrides drawing for the whole subtree:

```java
final Canvas targetCanvas = renderTarget.getSurface().lockHardwareCanvas();
targetCanvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);
super.draw(targetCanvas);          // subtree renders into the offscreen Surface
renderTarget.scheduleFrame();
targetSurface.unlockCanvasAndPost(targetCanvas);
```

Plus `onDescendantInvalidated` / `invalidateChildInParent` → `invalidate()`, so any child repaint
(a WebView scroll, a caret blink) drives a new frame into the render target. The render target is
`ImageReaderPlatformViewRenderTarget` (HardwareBuffer) or `SurfaceProducerPlatformViewRenderTarget`.

rayact already has the consumer half of this (`externalView: imported frame buffer for node N` in
logcat). What it lacks is the *producer* being a real view in the hierarchy.

### (c) Input arbitration belongs to the framework, and the original event is replayed

This is the part rayact has no equivalent of. The round trip:

1. The wrapper swallows everything the child would get:
   ```java
   @Override public boolean onInterceptTouchEvent(MotionEvent event) { return true; }
   ```
2. `onTouchEvent` forwards to `AndroidTouchProcessor.onTouchEvent(event, screenMatrix)`, which
   registers the event in a global `MotionEventTracker` and ships the pointer packet to Dart with
   `motionEventId = event.embedderId`.
3. Dart hit-tests. `PlatformViewRenderBox.hitTest` honours `PlatformViewHitTestBehavior`
   (opaque/translucent/transparent) and a gesture arena (`_UiKitViewGestureRecognizer`,
   `_PlatformViewGestureRecognizer`). A Flutter `ListView` above the webview can therefore win the
   gesture and the webview never sees it.
4. If the platform view wins, Dart calls `AndroidViewController.dispatchPointerEvent` →
   `PlatformViewsChannel.onTouch`, and Java **pops the original event back out of the tracker** and
   replays it:
   ```java
   MotionEvent trackedEvent = motionEventTracker.pop(motionEventId);
   translateMotionEvent(trackedEvent, pointerCoords);   // framework's coords
   view.dispatchTouchEvent(event);
   ```
   Replaying the original object (not a synthesized one) is what keeps velocity tracking,
   multi-touch pinch/zoom and long-press timing correct inside the WebView.

On iOS the same arbitration is done with gesture recognizers instead of a channel round trip:
`FlutterTouchInterceptingView` installs a `FlutterDelayingGestureRecognizer` that *withholds* the
touch sequence from the embedded view until the framework calls `acceptGesture` (fail the
recognizer → events flow up the responder chain to the `WKWebView`) or `rejectGesture` (block them
forever). Meanwhile `ForwardingGestureRecognizer` keeps feeding the events to the `FlutterView` so
the framework can still see them during the delay.

### (d) Transform/clip/opacity are applied to the native view, not to a texture

- Android: `FlutterMutatorView.dispatchDraw` does `canvas.concat(getPlatformViewMatrix())`;
  `draw()` applies `mutatorsStack.getFinalClippingPaths()` via `canvas.clipPath` and opacity via a
  hardware layer paint.
- iOS: `CATransform3D` from the layer-tree matrix (`GetCATransform3DFromDlMatrix`), plus
  `FlutterClippingMaskView` (a mask view that paints alpha=1 inside the clip and 0 outside), pooled
  in `FlutterClippingMaskViewPool`. Rounded rects, paths and rounded superellipses all supported;
  backdrop filters become `UIVisualEffectView`s.

## 3. How iOS composites — the model rayact must adopt there

`FlutterPlatformViewsController` (1228 lines) does, per frame:

1. **Preroll**: `prerollCompositeEmbeddedView:` records the view id and its `EmbeddedViewParams`
   (matrix + mutator stack) in `_compositionOrder`.
2. **Slice**: everything the layer tree paints *after* platform view N is recorded into
   `_slices[viewId]`, a `DisplayListEmbedderViewSlice` — a separate display list with its own dirty
   `DlRegion`.
3. **Overlay allocation**: for each non-empty slice, take a layer from `OverlayLayerPool`
   (`GetNextLayer` / `CreateLayer` / `RecycleLayers` / `RemoveUnusedLayers`). Each layer is a real
   `UIView` backed by its own `IOSSurface`+`Surface` (its own Metal drawable), sized to the slice's
   dirty rect.
4. **Render**: `slices[viewId]->render_into(overlayCanvas)`, each overlay encoded as its own
   `SurfaceFrame` with `frame_boundary = false, present_with_transaction = true`; the background
   (main) frame is submitted last.
5. **Reorder**: `bringLayersIntoView:` walks `compositionOrder` and `addSubview:`s
   [platform view root, its overlay, next platform view root, its overlay, …] onto `FlutterView`,
   inside a single `CATransaction`. `addSubview` on an existing subview reorders it, so z-order is
   just the insertion order.

So "Flutter content above a webview" is literally a second Metal-backed `UIView` sitting on top of
the `WKWebView`, containing only the ops that came after it in paint order.

## 4. Port plan for rayact

### Historical state before the 0.0.5 implementation

| | Android | iOS |
|---|---|---|
| node + layout + texture import | works (`RayactPlatformViews.kt`, `jni_bridge.cpp`) | **absent** — `RayactPlatformRegistry.makeView` is never called |
| props to the native view | **broken** — `kForwarded[] = {"value","placeholder","inputType","secure"}` at [`raym3_bridge.cpp:2869`](https://github.com/raythings/rayact/blob/main/native/desktop/raym3_bridge.cpp) drops every webview prop | absent |
| input | single synthesized tap (`node->onPress` → `g_externalViewInputCb(id, 1 /*up*/)`) | absent |
| transform/clip/opacity | not applied to the producer | absent |

### P0 — prop channel (unblocks the existing WebView on Android)

Replace the 4-key whitelist with pass-through of all string/number/bool props, and forward props at
create time too (`JS_createExternalView` currently reads only `style` and `zIndex`). Order matters:
`sourceUri`/`sourceHtml` must arrive after `javaScriptEnabled`/`baseUrl`.

### P1 — Android: virtual display → TLHC

Add a `RayactPlatformViewWrapper extends FrameLayout` holding the real view, added to the rayact
`SurfaceView`'s parent at the node's dp rect, with `draw()` redirecting into the `ImageReader`
Surface rayact already imports, and `onDescendantInvalidated → invalidate()` driving frames. Delete
the `VirtualDisplay` path. Wins IME, a11y, focus, text selection for free — the same reasons Flutter
switched.

### P2 — input round trip

- `onInterceptTouchEvent → true` on the wrapper; feed events into rayact's touch queue tagged with a
  tracker id (mirror `MotionEventTracker`).
- raym3 hit-testing decides whether the external-view node wins (needs a `hitTestBehavior` prop and
  a way for a rayact `ScrollView` above/around it to claim the sequence).
- If it wins, pop the original `MotionEvent` and `view.dispatchTouchEvent(it)`.
- Replaces the current tap-only `onPress` path, which cannot express scroll, pinch or long-press.

### P3 — iOS: real-view + overlay composition

There is no shortcut here; it is the layer-slicing work.

1. `RayactPlatformViewsHost` (Swift) owning: view factories, per-node `UIView` roots, a clipping
   mask view pool, and a touch-intercepting view with a delaying gesture recognizer.
2. raym3 must learn to **slice its paint list** at external-view nodes: everything painted after
   node N goes to overlay slice N. rayact paints in tree order
   (see `project_rayact_paint_order_absolute`), so the slice boundary is well defined.
3. An overlay layer pool: N extra `CAMetalLayer`s sized to each slice's dirty rect, presented with
   the background frame in one `CATransaction`. **Owned by the iOS host, not by `rlmt`** — see §5.
4. Mutators: `CATransform3D` + mask views, per `FlutterClippingMaskView`. Applied by the host to the
   native view; `rlmt` is never told about them.

`@rayact/webview`'s iOS half (`WKWebView` + `WKScriptMessageHandler` for `postMessage`,
`WKUserScript` for `injectedJavaScriptBeforeContentLoaded`) is trivial once 1–4 exist. The module
manifest already claims `ios` + `WebKit`; nothing implements it.

### Cost note

P0 is hours. P1+P2 is the Android rewrite Flutter did over ~2 years, but rayact's version is much
smaller because it has one view kind to support. P3 is the big one: it changes rayact's renderer
from "one surface" to "N surfaces interleaved with native views", which touches raym3's paint loop,
the iOS host, and (only for the zero-copy variant) `rlmt`.

## 5. Layer ownership: keep `rlmt` a generic raylib backend

The slicing belongs in raym3, and `rlmt` must not learn about external views, nodes or webviews.
Flutter draws the same line: `flow/embedded_views.h` (`ExternalViewEmbedder`, `EmbedderViewSlice`)
is renderer-agnostic, the Metal-specific piece is only `IOSSurface`/`Surface` — a generic "here is a
drawable, encode into it" abstraction — and every platform-view decision lives in
`FlutterPlatformViewsController`, which is embedder code, not backend code.

raym3's per-frame job:

```
paint tree in order
  ├─ commands before external view N  → slice 0        (background surface)
  ├─ external view N                  → host: set geometry + mutators, reserve overlay
  └─ commands after external view N   → slice 1        (overlay surface)
host: order native views + overlay layers, commit one transaction
```

Four corrections to the naive "just call begin/end surface in the paint loop" version:

**(1) `rlmt` is single-surface today.** `RLMT.layer` / `RLMT.drawable` are globals
(`rlmt.mm:137`, `rlmt.mm:1078`), `rlmtSetMetalLayer` takes one layer, `rlmtResizeSurface` resizes
one. Multi-surface is a genuine addition — but a *generic* one (multi-window raylib apps want it
too), so it stays backend-appropriate:

```c
unsigned int rlmtRegisterSurface(void *caMetalLayer, int widthPx, int heightPx);
void         rlmtUnregisterSurface(unsigned int surfaceId);
void         rlmtSetTargetSurface(unsigned int surfaceId);   // 0 = main
void         rlmtPresentSurfaces(void);                      // encode-all, then present together
```

`rlvk` can mirror this later for Android HCPP. Nothing in it mentions nodes, views or rayact.

**(2) The missing primitive is deferred presentation, not surface binding.** Every overlay drawable
and the background must be presented in **one** `CATransaction`, or native-view geometry and rayact
pixels disagree for a frame. Flutter encodes overlays with
`{.frame_boundary = false, .present_with_transaction = true}` and submits the background frame
**last**. `rlmt`'s `rlEndFrame` currently does `presentDrawable + commit` immediately; it needs an
"encode now, present on `rlmtPresentSurfaces`" mode.

**(3) You cannot size an overlay while streaming the paint loop.** The overlay should cover the
slice's dirty region, which is unknown until the slice is recorded. Flutter therefore runs
preroll → record slices → allocate/resize layers → render slices. Options for rayact:

- *v0 (recommended first)*: full-screen overlays with a scissor rect. No dirty-region tracking, one
  extra full-screen RGBA drawable per external view. Fine at 1–2 webviews.
- *v1*: record each slice into a command buffer with bounds tracking, then size the layer. Keep the
  rect in the API from day one so this is not a signature change.

**(4) Z-order does not come from GPU pass order.** The passes are independent surfaces; stacking is
decided entirely by the host's view hierarchy insertion order (Flutter: `addSubview` walking
`compositionOrder`, where re-adding an existing subview reorders it). raym3's output is an *ordered
list*; it must not assume "drawn later = on top".

### Bootstrap path that touches `rlmt` not at all

`rlmt` already implements the rlgl FBO entry points (`rlLoadFramebuffer`, `rlFramebufferAttach`,
`rlEnableFramebuffer` — `rlmt.mm:2281`), so `BeginTextureMode`/`EndTextureMode` work. A first
version can render each overlay slice into a `RenderTexture2D` and let the iOS host put that
texture's `IOSurface` into a `CALayer.contents`. Costs one blit per overlay per frame, proves the
slicing + host ordering + input path, and can be swapped for the zero-copy multi-surface API later
without changing raym3.

### One place rayact is easier than Flutter

Flutter's raster thread is separate from the platform thread, so platform views force
`PostPrerollResult::kSkipAndRetryFrame` and raster/platform **thread merging**
(`postPrerollActionWithThreadMerger`), and `performSubmit` asserts main thread. rayact on iOS
already renders on the main thread from a `CADisplayLink`
(`apps/ios/RayactRenderScheduler.swift`), so view geometry updates, the `CATransaction` and the
draw passes are all naturally on the same thread. That entire class of Flutter complexity does not
apply.
