// @rayact/webview — macOS platform view.
//
// Registers the "webview" kind with the engine's ABI-3 view-factory registry, the
// desktop peer of this package's android/RayactWebViewRegistration.kt and
// ios/RayactWebViewRegistration.swift. The engine owns the wrapper view, layout,
// clipping, hit-testing and occlusion; everything below owns the WKWebView.
//
// Depends only on the stable module ABI header — nothing from the engine's
// internals — so it builds standalone as librayact_webview.dylib.
//
// Compiled without ARC (matching the other plugins), so object lifetimes are
// managed explicitly where it matters and noted where it does not.

#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <WebKit/WKNavigationDelegate.h>
#import <WebKit/WKScriptMessage.h>
#import <WebKit/WKScriptMessageHandler.h>
#import <WebKit/WKUserContentController.h>
#import <WebKit/WKUserScript.h>
#import <WebKit/WKWebView.h>
#import <WebKit/WKWebViewConfiguration.h>

#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "rayact_module_abi.h"

namespace {
const RayactHost* g_host = nullptr;

std::string cppString(NSString* value) {
  return value ? std::string(value.UTF8String) : std::string();
}
} // namespace

@class RayactWebViewInstance;

@interface RayactMacWebView : WKWebView <WKNavigationDelegate>
@property(nonatomic, assign) RayactWebViewInstance* owner;
@end

// Script-message handler registered on the configuration BEFORE the web view is
// constructed: WKWebView copies its configuration, and -[WKWebView configuration]
// returns another copy, so a handler added afterwards never reaches the live view.
// The proxy also breaks the retain cycle WKUserContentController would create by
// retaining its handlers — `assign` (no ARC here) is safe because the proxy never
// outlives the instance, which clears the back-pointer on dispose.
@interface RayactWebViewMessageProxy : NSObject <WKScriptMessageHandler>
@property(nonatomic, assign) RayactWebViewInstance* owner;
@end

// One webview node. Holds everything the engine used to keep in its Entry.
@interface RayactWebViewInstance : NSObject
@property(nonatomic, assign) int nodeId;
@property(nonatomic, retain) RayactMacWebView* web;
@property(nonatomic, retain) RayactWebViewMessageProxy* messageProxy;
@end

@interface RayactWebViewInstance () {
@public
  // The source is retained so `reload` can re-issue it: a srcdoc-style load has
  // no URL for WKWebView to reload.
  std::string _sourceHtml;
  std::string _sourceUri;
  std::string _baseUrl;
  std::string _injectedJavaScript;
  std::string _lastCommand;
  // A command issued before the document finished loading would evaluate against
  // the previous (usually empty) page and be lost — an app that posts to its
  // webview on mount hits this every time. Hold them until load ends.
  bool _documentReady;
  std::vector<std::string> _pendingCommands;
  // A WKWebView with a zero frame never starts loading and never fires its
  // navigation delegate, and create() runs before the first layout. Hold the load
  // until notify_layout reports real bounds.
  bool _pendingLoad;
}
@end

namespace {

void emitEvent(int nodeId, NSDictionary* envelope) {
  if (!g_host || !g_host->emit_view_event) return;
  NSData* data = [NSJSONSerialization dataWithJSONObject:envelope options:0 error:nil];
  if (!data) return;
  NSString* json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  const char* utf8 = json.UTF8String;
  g_host->emit_view_event(nodeId, utf8, std::strlen(utf8));
  [json release];
}

bool traceEnabled() {
  static const bool enabled = std::getenv("RAYACT_PLATFORM_VIEW_TRACE") != nullptr;
  return enabled;
}

void loadSource(RayactWebViewInstance* self) {
  RayactMacWebView* web = self.web;
  self->_documentReady = false;
  if (web.frame.size.width <= 0 || web.frame.size.height <= 0) {
    self->_pendingLoad = true;
    return;
  }
  self->_pendingLoad = false;
  if (!self->_sourceHtml.empty()) {
    NSURL* base = self->_baseUrl.empty()
        ? nil : [NSURL URLWithString:@(self->_baseUrl.c_str())];
    [web loadHTMLString:@(self->_sourceHtml.c_str()) baseURL:base];
  } else if (!self->_sourceUri.empty()) {
    NSURL* url = [NSURL URLWithString:@(self->_sourceUri.c_str())];
    if (url) [web loadRequest:[NSURLRequest requestWithURL:url]];
  }
}

// Mirrors runCommand in the Android controller and the web shell's manager: the
// WebView handle's imperative methods arrive as a one-shot `command` prop with a
// #N suffix so a repeat of the same action still reads as a new value.
void runCommand(RayactWebViewInstance* self, const std::string& raw) {
  RayactMacWebView* web = self.web;
  // `reload` re-issues the source itself, so it is always safe to run now;
  // everything else needs a live document.
  if (!self->_documentReady && raw.rfind("reload", 0) != 0) {
    self->_pendingCommands.push_back(raw);
    return;
  }
  std::string value = raw;
  const size_t hash = value.rfind('#');
  if (hash != std::string::npos &&
      value.find_first_not_of("0123456789", hash + 1) == std::string::npos) {
    value.resize(hash);
  }

  if (value == "reload") {
    loadSource(self);
  } else if (value == "goBack") {
    [web goBack];
  } else if (value == "goForward") {
    [web goForward];
  } else if (value == "stopLoading") {
    [web stopLoading];
  } else if (value.rfind("inject:", 0) == 0) {
    [web evaluateJavaScript:@(value.substr(7).c_str()) completionHandler:nil];
  } else if (value.rfind("post:", 0) == 0) {
    // Same shape as Android: deliver a MessageEvent the page can listen for.
    NSString* message = @(value.substr(5).c_str());
    NSData* quoted = [NSJSONSerialization dataWithJSONObject:@[ message ] options:0 error:nil];
    NSString* array = [[NSString alloc] initWithData:quoted encoding:NSUTF8StringEncoding];
    // JSON-encode via a one-element array, then strip the brackets, so any
    // quotes/newlines in the message are escaped correctly.
    NSString* literal = [array substringWithRange:NSMakeRange(1, array.length - 2)];
    NSString* script = [NSString stringWithFormat:
        @"window.dispatchEvent(new MessageEvent('message',{data:%@}));", literal];
    [web evaluateJavaScript:script completionHandler:nil];
    [array release];
  }
}

void runInjectedJavaScript(RayactWebViewInstance* self) {
  if (!self->_injectedJavaScript.empty()) {
    [self.web evaluateJavaScript:@(self->_injectedJavaScript.c_str())
               completionHandler:nil];
  }
  // The document is live now: release anything the app asked for while it was
  // still loading, in the order it was requested.
  self->_documentReady = true;
  std::vector<std::string> pending;
  pending.swap(self->_pendingCommands);
  for (const std::string& command : pending) runCommand(self, command);
}

NSDictionary* parseProps(const char* json, size_t len) {
  if (!json || len == 0) return @{};
  NSData* data = [NSData dataWithBytes:json length:len];
  id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  return [parsed isKindOfClass:[NSDictionary class]] ? parsed : @{};
}

void applyProps(RayactWebViewInstance* self, NSDictionary* props) {
  if (!props) return;
  // Undefined arrives as an explicit null tombstone (the bridge's patch
  // encoding), so switching between uri and html clears the other.
  bool sourceChanged = false;
  if (props[@"sourceHtml"]) {
    NSString* html = props[@"sourceHtml"];
    std::string next = [html isKindOfClass:[NSString class]] ? cppString(html) : "";
    if (next != self->_sourceHtml) { self->_sourceHtml = next; sourceChanged = true; }
  }
  if (props[@"sourceUri"]) {
    NSString* uri = props[@"sourceUri"];
    std::string next = [uri isKindOfClass:[NSString class]] ? cppString(uri) : "";
    if (next != self->_sourceUri) { self->_sourceUri = next; sourceChanged = true; }
  }
  if (props[@"baseUrl"]) {
    NSString* base = props[@"baseUrl"];
    self->_baseUrl = [base isKindOfClass:[NSString class]] ? cppString(base) : "";
  }
  if (props[@"injectedJavaScript"]) {
    NSString* script = props[@"injectedJavaScript"];
    self->_injectedJavaScript =
        [script isKindOfClass:[NSString class]] ? cppString(script) : "";
  }
  if (sourceChanged) loadSource(self);

  NSString* command = props[@"command"];
  if ([command isKindOfClass:[NSString class]] && command.length) {
    std::string next = cppString(command);
    if (next != self->_lastCommand) {
      self->_lastCommand = next;
      runCommand(self, next);
    }
  }
}

} // namespace

@implementation RayactMacWebView
- (void)webView:(WKWebView*)webView didFinishNavigation:(WKNavigation*)navigation {
  // Android runs injectedJavaScript on page-finished; match that here rather than
  // at load-request time, so the script sees a parsed document.
  if (self.owner) runInjectedJavaScript(self.owner);
  emitEvent(self.owner.nodeId,
            @{ @"type": @"loadEnd", @"data": webView.URL.absoluteString ?: @"" });
}
- (void)webView:(WKWebView*)webView
    didStartProvisionalNavigation:(WKNavigation*)navigation {
  emitEvent(self.owner.nodeId,
            @{ @"type": @"loadStart", @"data": webView.URL.absoluteString ?: @"" });
}
- (void)webView:(WKWebView*)webView
    didFailNavigation:(WKNavigation*)navigation
            withError:(NSError*)error {
  emitEvent(self.owner.nodeId,
            @{ @"type": @"error", @"data": error.localizedDescription ?: @"" });
}
// A provisional failure (the load never even started) and a content-process crash
// both leave the view blank with no other signal — without these the webview just
// silently shows nothing.
- (void)webView:(WKWebView*)webView
    didFailProvisionalNavigation:(WKNavigation*)navigation
                       withError:(NSError*)error {
  emitEvent(self.owner.nodeId,
            @{ @"type": @"error", @"data": error.localizedDescription ?: @"" });
}
- (void)webViewWebContentProcessDidTerminate:(WKWebView*)webView {
  emitEvent(self.owner.nodeId,
            @{ @"type": @"error", @"data": @"web content process terminated" });
}
@end

@implementation RayactWebViewMessageProxy
- (void)userContentController:(WKUserContentController*)controller
      didReceiveScriptMessage:(WKScriptMessage*)message {
  if (!self.owner) return;
  emitEvent(self.owner.nodeId,
            @{ @"type": @"message",
               @"data": [NSString stringWithFormat:@"%@", message.body] });
}
@end

@implementation RayactWebViewInstance
- (void)dealloc {
  [_web release];
  [_messageProxy release];
  [super dealloc];
}
@end

// ─── view factory ─────────────────────────────────────────────────────────────

namespace {

void* webviewCreate(void* /*self*/, int32_t nodeId, const char* propsJson,
                    size_t propsLen, void** outNativeView) {
  NSDictionary* props = parseProps(propsJson, propsLen);

  WKWebViewConfiguration* config = [[WKWebViewConfiguration alloc] init];
  // Android exposes window.RayactWebView via addJavascriptInterface; supply the
  // same API here, or a page written to the documented interface (which tries
  // window.RayactWebView before the WebKit spelling) silently does nothing.
  [config.userContentController addUserScript:
      [[[WKUserScript alloc] initWithSource:
          @"window.RayactWebView = window.RayactWebView || {"
           "postMessage: function (message) {"
           "  window.webkit.messageHandlers.RayactWebView.postMessage(String(message));"
           "}};"
                             injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                          forMainFrameOnly:YES] autorelease]];

  // injectedJavaScriptBeforeContentLoaded must be a document-start user script
  // installed before the view exists; it cannot be an evaluateJavaScript later.
  NSString* documentStart = props[@"injectedJavaScriptBeforeContentLoaded"];
  if ([documentStart isKindOfClass:[NSString class]] && documentStart.length) {
    [config.userContentController addUserScript:
        [[[WKUserScript alloc] initWithSource:documentStart
                                injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                             forMainFrameOnly:YES] autorelease]];
  }

  RayactWebViewInstance* instance = [[RayactWebViewInstance alloc] init];
  instance.nodeId = nodeId;

  RayactWebViewMessageProxy* proxy = [[RayactWebViewMessageProxy alloc] init];
  proxy.owner = instance;
  instance.messageProxy = proxy;
  [proxy release];
  // Registered on the ORIGINAL configuration, before the view is built.
  [config.userContentController addScriptMessageHandler:instance.messageProxy
                                                   name:@"RayactWebView"];

  RayactMacWebView* web = [[RayactMacWebView alloc] initWithFrame:NSZeroRect
                                                    configuration:config];
  [config release];
  web.owner = instance;
  web.navigationDelegate = web;
  web.wantsLayer = YES;
  // The rayact scene shows through wherever the page is transparent.
  [web setValue:@NO forKey:@"drawsBackground"];
  instance.web = web;
  [web release];

  applyProps(instance, props);

  if (traceEnabled()) {
    NSLog(@"RAYACT_PLATFORM_VIEW webview create node=%d", nodeId);
  }
  *outNativeView = (void*)instance.web;
  return (void*)instance;
}

int webviewSetProperties(void* instance, const char* propsJson, size_t len) {
  RayactWebViewInstance* self = (RayactWebViewInstance*)instance;
  if (!self) return -1;
  applyProps(self, parseProps(propsJson, len));
  return 0;
}

void webviewNotifyLayout(void* instance, float /*width*/, float /*height*/) {
  RayactWebViewInstance* self = (RayactWebViewInstance*)instance;
  // The view finally has bounds; issue the load that was waiting for them.
  if (self && self->_pendingLoad) loadSource(self);
}

void webviewDispose(void* instance) {
  RayactWebViewInstance* self = (RayactWebViewInstance*)instance;
  if (!self) return;
  // The content controller outlives the view and still holds the proxy, so drop
  // the back-pointer before the instance goes away.
  self.messageProxy.owner = nil;
  self.web.owner = nil;
  [self.web stopLoading];
  [self release];
}

} // namespace

extern "C" int rayact_webview_register(const RayactHost* host) {
  if (!host) return -1;
  // register_view_factory and emit_view_event are ABI 3.
  if (host->abi_version < 3) return -1;
  g_host = host;

  RayactViewFactory factory = {};
  factory.struct_size = sizeof(RayactViewFactory);
  factory.self = nullptr;
  factory.create = webviewCreate;
  factory.set_properties = webviewSetProperties;
  factory.notify_layout = webviewNotifyLayout;
  factory.dispose = webviewDispose;
  return host->register_view_factory("webview", &factory);
}

// The generic dlopen entry collides when plugins are static-linked together, so
// it is omitted wherever linking is static (iOS, web) — those hosts call the
// unique rayact_webview_register directly.
#if !defined(RAYACT_IOS) && !defined(RAYACT_WEB)
extern "C" int rayact_module_register(const RayactHost* host) {
  return rayact_webview_register(host);
}
#endif
