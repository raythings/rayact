#include "devtools.hpp"
#include "cdp_handler.hpp"

#include <cstdio>
#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

extern "C" {
#include "quickjs.h"
}

namespace rayact {

// Toggle the JS-side `__rayactDevtoolsNetOn` flag on a context. Only the
// attached DevTools target gets it set, so the launcher (and any non-target
// instance) short-circuits all network/devtools instrumentation with a single
// property read — no native calls, no CDP work. Debugging is project-only.
static void setDevtoolsNetFlag(JSContext* ctx, bool on) {
  if (!ctx) return;
  JSValue global = JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx, global, "__rayactDevtoolsNetOn", on ? JS_TRUE : JS_FALSE);
  JS_FreeValue(ctx, global);
}

static std::unique_ptr<CDPHandler> g_cdp;
static bool g_enabled = false;
// The JS context CDP is attached to. In the dev-app two engine instances
// (launcher + project) share this process; only the project instance is ever
// a devtools target, and pump calls from other contexts must not touch CDP.
static JSContext* g_targetCtx = nullptr;
static DevtoolsOutboundCallback g_transportCallback = nullptr;
static void* g_transportOpaque = nullptr;

static std::string jsonQuote(const char* value, size_t maxBytes = 64 * 1024) {
  std::string input = value ? value : "";
  bool truncated = input.size() > maxBytes;
  if (truncated) input.resize(maxBytes);
  std::ostringstream out;
  out << '"';
  for (unsigned char c : input) {
    switch (c) {
      case '"': out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\n': out << "\\n"; break;
      case '\r': out << "\\r"; break;
      case '\t': out << "\\t"; break;
      default: if (c >= 0x20) out << (char)c; break;
    }
  }
  if (truncated) out << " [truncated]";
  out << '"';
  return out.str();
}

static void sendTerminalLog(const char* level, const std::vector<std::string>& args) {
  if (!g_transportCallback) return;
  std::ostringstream out;
  out << "\x1e{\"event\":\"log\",\"payload\":{\"level\":" << jsonQuote(level) << ",\"args\":[";
  for (size_t i = 0; i < args.size(); ++i) { if (i) out << ','; out << jsonQuote(args[i].c_str()); }
  out << "]}}";
  std::string encoded = out.str();
  if (encoded.size() <= 256 * 1024) g_transportCallback(g_transportOpaque, encoded.c_str());
}

static void DebuggerCallback(JSContext* ctx, const char* event,
                             const char* data_json, void* opaque) {
  (void)opaque;
  if (!g_cdp || !event) return;
  if (ctx != g_targetCtx) return;
  if (strcmp(event, "console") == 0 && data_json) {
    g_cdp->onConsoleMessage("log", data_json);
  }
}

// Shared attach path: bind (or reuse) the CDP server and point it at ctx.
static void devtoolsAttach(JSContext* ctx, int port, const char* title) {
  JS_SetDebuggerHandler(ctx, DebuggerCallback, nullptr);
  JS_EnableDebuggerMode(ctx, true);

  if (g_cdp && g_cdp->isRunning()) {
    // Server already up (previous project instance) — retarget, don't rebind.
    g_targetCtx = ctx;
    g_enabled = true;
    if (title) g_cdp->setTitle(title);
    g_cdp->retarget(ctx);
    fprintf(stderr, "[devtools] CDP retargeted to new context (port unchanged)\n");
    return;
  }

  g_cdp = std::make_unique<CDPHandler>(port);
  if (g_cdp->start(ctx)) {
    g_targetCtx = ctx;
    g_enabled = true;
    if (title) g_cdp->setTitle(title);
    fprintf(stderr, "[devtools] CDP server listening on port %d (chrome://inspect)\n", port);
    g_cdp->registerScript("rayact://main", "", 1);
  } else {
    fprintf(stderr, "[devtools] CDP server failed to start\n");
    g_cdp.reset();
    g_enabled = false;
    g_targetCtx = nullptr;
  }
}

void devtoolsInit(JSContext *ctx) {
  const char *env = std::getenv("RAYACT_DEVTOOLS");
  const char *debug = std::getenv("RAYACT_DEBUG");
  bool enabled = (env && env[0] && env[0] != '0') || (debug && debug[0] && debug[0] != '0');
  if (!enabled) return;

  int port = 9229;
  if (const char *portEnv = std::getenv("RAYACT_CDP_PORT")) {
    port = atoi(portEnv);
    if (port <= 0) port = 9229;
  }
  devtoolsAttach(ctx, port, nullptr);
}

void devtoolsEnableForContext(JSContext *ctx, int port, const char *title) {
  if (!ctx) return;
  if (port <= 0) port = 9229;
  devtoolsAttach(ctx, port, title);
}

void devtoolsEnableForContext(JSContext *ctx, const char *title,
                              DevtoolsOutboundCallback callback, void *opaque) {
  if (!ctx) return;
  devtoolsAttach(ctx, 0, title);
  if (g_cdp) g_cdp->setOutboundCallback(callback, opaque);
  g_transportCallback = callback;
  g_transportOpaque = opaque;
}

void devtoolsInboundForContext(JSContext *ctx, const char *message) {
  if (!ctx || ctx != g_targetCtx || !g_cdp || !message) return;
  g_cdp->enqueueInbound(message);
}

void devtoolsDetachContext(JSContext *ctx) {
  if (!ctx || ctx != g_targetCtx) return;
  g_targetCtx = nullptr;
  g_enabled = false;
  JS_EnableDebuggerMode(ctx, false);
  JS_SetDebuggerHandler(ctx, nullptr, nullptr);
  g_transportCallback = nullptr;
  g_transportOpaque = nullptr;
  // Keep the server listening so chrome://inspect stays discoverable; an
  // attached DevTools sees a document update and empty tree until the next
  // project attaches.
  if (g_cdp) g_cdp->notifyDocumentUpdated();
}

void devtoolsShutdown() {
  if (g_cdp) g_cdp->stop();
  g_cdp.reset();
  g_enabled = false;
  g_targetCtx = nullptr;
  g_transportCallback = nullptr;
  g_transportOpaque = nullptr;
}

bool devtoolsActiveForContext(JSContext *ctx) {
  return g_enabled && g_cdp && ctx == g_targetCtx;
}

void devtoolsEmitNetwork(JSContext *ctx, const char *method, const char *paramsJson) {
  if (!devtoolsActiveForContext(ctx) || !method) return;
  g_cdp->onNetworkEvent(method, paramsJson ? paramsJson : "{}");
}

void devtoolsStoreNetworkBody(JSContext *ctx, const char *requestId,
                              const char *body, size_t len, bool base64) {
  if (!devtoolsActiveForContext(ctx) || !requestId) return;
  g_cdp->storeResponseBody(requestId, body, len, base64);
}

void devtoolsPump(JSContext *ctx) {
  if (!g_enabled || !g_cdp) return;
  if (ctx != g_targetCtx) return;
  g_cdp->pump(ctx);
}

bool devtoolsHasPendingWork() {
  return g_enabled && g_cdp && g_cdp->hasPendingInbound();
}

void devtoolsConsole(JSContext *ctx, const char *level, const char *message) {
  if (ctx != g_targetCtx) return; // only the target instance's console
  if (g_cdp) g_cdp->onConsoleMessage(level, message);
  sendTerminalLog(level, {message ? message : ""});
}

void devtoolsConsoleArgs(JSContext *ctx, const char *level, int argc, JSValueConst *argv) {
  if (ctx != g_targetCtx) return;
  if (g_cdp) g_cdp->onConsoleArgs(ctx, level, argc, argv);
  std::vector<std::string> args;
  args.reserve((size_t)std::max(argc, 0));
  for (int i = 0; i < argc; ++i) {
    const char* value = JS_ToCString(ctx, argv[i]);
    args.emplace_back(value ? value : "[value]");
    if (value) JS_FreeCString(ctx, value);
  }
  sendTerminalLog(level, args);
}

} // namespace rayact
