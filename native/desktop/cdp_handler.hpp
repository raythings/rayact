#pragma once
#include <cstddef>

extern "C" {
#include "quickjs.h"
}

namespace rayact {

class CDPHandler {
public:
    using OutboundCallback = void (*)(void* opaque, const char* message);
    struct Impl;
    explicit CDPHandler(int port = 9229);
    ~CDPHandler();

    bool start(JSContext* ctx);
    void stop();
    void pump(JSContext* ctx);
    bool isRunning() const;

    // Transport bridge: the JS dev client hands inbound CDP command JSON (one
    // message per call) from the `/rayact/debugger` uplink here; pump() drains
    // and dispatches it on the engine thread. hasPendingInbound() is an
    // on-demand render-frame source so queued commands are always drained.
    void enqueueInbound(const char* json);
    bool hasPendingInbound() const;
    void setOutboundCallback(OutboundCallback callback, void* opaque);

    void onConsoleMessage(const char* level, const char* message);
    void onConsoleArgs(JSContext* ctx, const char* level, int argc, JSValueConst* argv);
    // Versioned RayactReact transport used by the pinned DevTools frontend.
    void emitEvent(const char* method, const char* payloadJson = "{}");
    void registerScript(const char* url, const char* source, int scriptId);
    // Allocates a monotonic script id. The runtime uses this for every module
    // evaluated from the dev server, including HMR replacements.
    void registerScript(const char* url, const char* source);
    void onNetworkEvent(const char* method, const char* paramsJson);
    void storeResponseBody(const char* requestId, const void* data, size_t size, bool base64Encoded);
    // /json/list target title (shown in chrome://inspect).
    void setTitle(const char* title);
    // Tell an attached DevTools the node tree was replaced (project reload /
    // instance switch) so it re-fetches DOM.getDocument.
    void notifyDocumentUpdated();
    // Point the handler at a different JS context (dev-app instance switch)
    // without restarting the server.
    void retarget(JSContext* ctx);

    static CDPHandler* instance();

private:
    Impl* impl_;
};

} // namespace rayact
