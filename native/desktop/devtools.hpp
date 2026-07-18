#pragma once

extern "C" {
#include "quickjs.h"
}

namespace rayact {

using DevtoolsOutboundCallback = void (*)(void* opaque, const char* message);

void devtoolsInit(JSContext *ctx);
// Programmatic attach for hosts without env vars (Android dev-app project
// instance). Idempotent: if the CDP server is already listening it retargets
// to ctx instead of rebinding. title shows in chrome://inspect.
void devtoolsEnableForContext(JSContext *ctx, int port, const char *title);
void devtoolsEnableForContext(JSContext *ctx, const char *title,
                              DevtoolsOutboundCallback callback, void *opaque);
void devtoolsInboundForContext(JSContext *ctx, const char *message);
// Drop the target when its instance goes away; the server keeps listening.
void devtoolsDetachContext(JSContext *ctx);
void devtoolsShutdown();
void devtoolsPump(JSContext *ctx);
void devtoolsConsole(JSContext *ctx, const char *level, const char *message);
void devtoolsConsoleArgs(JSContext *ctx, const char *level, int argc, JSValueConst *argv);
// True when ctx is the attached DevTools target and a frontend can receive
// events. JS network shims call this to skip building CDP JSON when nobody is
// listening.
bool devtoolsActiveForContext(JSContext *ctx);
// Emit a Network.* (or any) CDP event originating from JS (fetch/WebSocket
// shims). paramsJson is the raw JSON for the event "params". No-op unless ctx
// is the active target.
void devtoolsEmitNetwork(JSContext *ctx, const char *method, const char *paramsJson);
// Stash a response body so Network.getResponseBody can serve it later.
void devtoolsStoreNetworkBody(JSContext *ctx, const char *requestId,
                              const char *body, size_t len, bool base64);
// True when the CDP handler has inbound commands queued but not yet dispatched.
// Used as an on-demand render-frame source so an idle app still drains DevTools
// traffic. Safe to call every frame; cheap. Returns false when devtools is off.
bool devtoolsHasPendingWork();

} // namespace rayact
