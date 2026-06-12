#include "devtools.hpp"
#include "cdp_handler.hpp"

#include <cstdio>
#include <cstring>
#include <memory>

extern "C" {
#include "quickjs.h"
}

namespace rayact {

static std::unique_ptr<CDPHandler> g_cdp;
static bool g_enabled = false;

static void DebuggerCallback(JSContext* ctx, const char* event,
                             const char* data_json, void* opaque) {
  (void)opaque;
  if (!g_cdp || !event) return;
  if (strcmp(event, "console") == 0 && data_json) {
    g_cdp->onConsoleMessage("log", data_json);
  }
}

void devtoolsInit(JSContext *ctx) {
  const char *env = std::getenv("RAYACT_DEVTOOLS");
  const char *debug = std::getenv("RAYACT_DEBUG");
  g_enabled = (env && env[0] && env[0] != '0') || (debug && debug[0] && debug[0] != '0');
  if (!g_enabled) return;

  int port = 9229;
  if (const char *portEnv = std::getenv("RAYACT_CDP_PORT")) {
    port = atoi(portEnv);
    if (port <= 0) port = 9229;
  }

  JS_SetDebuggerHandler(ctx, DebuggerCallback, nullptr);
  JS_EnableDebuggerMode(ctx, true);

  g_cdp = std::make_unique<CDPHandler>(port);
  if (g_cdp->start(ctx)) {
    fprintf(stderr, "[devtools] CDP server listening on port %d (chrome://inspect)\n", port);
    g_cdp->registerScript("rayact://main", "", 1);
  } else {
    fprintf(stderr, "[devtools] CDP server failed to start\n");
    g_cdp.reset();
  }
}

void devtoolsShutdown() {
  if (g_cdp) g_cdp->stop();
  g_cdp.reset();
  g_enabled = false;
}

void devtoolsPump(JSContext *ctx) {
  if (!g_enabled || !g_cdp) return;
  g_cdp->pump(ctx);
}

void devtoolsConsole(JSContext *ctx, const char *level, const char *message) {
  (void)ctx;
  if (g_cdp) g_cdp->onConsoleMessage(level, message);
}

} // namespace rayact
