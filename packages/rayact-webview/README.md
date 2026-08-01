# @rayact/webview

WebView component implemented on Rayact's generic platform-view API. It registers
an Android `WebView` and an iOS `WKWebView`; neither renderer contains a
WebView-specific composition path.

The native controls stay in the real platform hierarchy. Rayact applies the
external-view transform, clip, opacity, and hit-test behavior, and composites
framework content painted above the control into an overlay surface.

The native WebView background is transparent by default, so Rayact content
below it remains visible when the loaded page does not set a background color.
Page CSS can still provide an opaque background normally.

Web and desktop hosts currently use the unsupported external-view fallback.
