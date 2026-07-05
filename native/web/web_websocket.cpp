// Web WebSocket bridge.
//
// The engine is QuickJS compiled to WASM and has no `WebSocket` global; the native
// libwebsockets transport (net.cpp) is excluded from the web build. So the
// module-HMR runtime's `new WebSocket(hmrUrl)` (packages/rayact-runtime moduleHmr.ts)
// found no constructor and bailed ("WebSocket unavailable") — no HMR on web.
//
// This bridges the BROWSER's WebSocket into the QuickJS runtime: small EM_JS calls
// drive a real browser WebSocket and push its events into a JS-side queue; a JS
// `WebSocket` polyfill (installed on globalThis) drains that queue each engine tick
// and dispatches to the on*/addEventListener handlers. The web build is
// single-threaded (no pthreads/ASYNCIFY), so browser WS callbacks fire on the main
// thread between rAF ticks — no locking needed.

#include <emscripten.h>
#include <cstdlib>
#include <cstdio>
#include <cstring>

extern "C" {
#include "quickjs.h"
}

// ─── Browser-side ops (run in the Emscripten/Module JS context) ────────────────

EM_JS(int, rayact_ws_open, (const char* urlPtr), {
    if (!Module.__rayactWS) {
        Module.__rayactWS = {};
        Module.__rayactWSQueue = [];
        Module.__rayactWSNextId = 1;
    }
    var url = UTF8ToString(urlPtr);
    var id = Module.__rayactWSNextId++;
    try {
        var ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';
        Module.__rayactWS[id] = ws;
        ws.onopen    = function()  { Module.__rayactWSQueue.push({ id: id, t: 'open' }); };
        ws.onerror   = function()  { Module.__rayactWSQueue.push({ id: id, t: 'error' }); };
        ws.onclose   = function(e) { Module.__rayactWSQueue.push({ id: id, t: 'close', code: e.code, reason: e.reason, clean: !!e.wasClean }); };
        ws.onmessage = function(e) {
            // HMR is text/JSON; ignore binary frames (stringify to empty).
            var d = (typeof e.data === "string") ? e.data : "";
            Module.__rayactWSQueue.push({ id: id, t: 'msg', data: d });
        };
    } catch (err) {
        Module.__rayactWSQueue.push({ id: id, t: 'error' });
    }
    return id;
});

EM_JS(void, rayact_ws_send, (int id, const char* dataPtr), {
    var ws = Module.__rayactWS && Module.__rayactWS[id];
    if (ws && ws.readyState === 1) {
        try { ws.send(UTF8ToString(dataPtr)); } catch (e) {}
    }
});

EM_JS(void, rayact_ws_close, (int id, int code, const char* reasonPtr), {
    var ws = Module.__rayactWS && Module.__rayactWS[id];
    if (ws) {
        try { ws.close(code || 1000, UTF8ToString(reasonPtr)); } catch (e) {}
        delete Module.__rayactWS[id];
    }
});

// Returns a malloc'd JSON array string of pending events (caller frees), or 0 when
// the queue is empty.
EM_JS(char*, rayact_ws_poll, (), {
    if (!Module.__rayactWSQueue || Module.__rayactWSQueue.length === 0) return 0;
    var s = JSON.stringify(Module.__rayactWSQueue);
    Module.__rayactWSQueue = [];
    var len = lengthBytesUTF8(s) + 1;
    var buf = _malloc(len);
    stringToUTF8(s, buf, len);
    return buf;
});

// ─── QuickJS C-function wrappers ───────────────────────────────────────────────

namespace rayact {
namespace {

JSValue js_ws_open(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_NewInt32(ctx, 0);
    const char* url = JS_ToCString(ctx, argv[0]);
    int id = rayact_ws_open(url ? url : "");
    if (url) JS_FreeCString(ctx, url);
    return JS_NewInt32(ctx, id);
}

JSValue js_ws_send(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (argc < 2) return JS_UNDEFINED;
    int id = 0;
    JS_ToInt32(ctx, &id, argv[0]);
    const char* data = JS_ToCString(ctx, argv[1]);
    rayact_ws_send(id, data ? data : "");
    if (data) JS_FreeCString(ctx, data);
    return JS_UNDEFINED;
}

JSValue js_ws_close(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    int id = 0, code = 1000;
    JS_ToInt32(ctx, &id, argv[0]);
    if (argc >= 2) JS_ToInt32(ctx, &code, argv[1]);
    const char* reason = (argc >= 3) ? JS_ToCString(ctx, argv[2]) : nullptr;
    rayact_ws_close(id, code, reason ? reason : "");
    if (reason) JS_FreeCString(ctx, reason);
    return JS_UNDEFINED;
}

JSValue js_ws_poll(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    char* s = rayact_ws_poll();
    if (!s) return JS_NULL;
    JSValue r = JS_NewString(ctx, s);
    free(s);
    return r;
}

// JS `WebSocket` polyfill + the per-tick drain (`__rayactWsDispatch`). Uses the C
// hooks registered above. Matches the subset the HMR/dev-client runtimes use:
// constructor(url), send, close, readyState, on{open,message,close,error}, the
// CONNECTING/OPEN/CLOSING/CLOSED constants, and a minimal addEventListener.
const char* kWebSocketPolyfill = R"JS(
(function () {
  var registry = {};
  function WebSocket(url) {
    this.url = String(url);
    this.readyState = 0; // CONNECTING
    this.binaryType = 'arraybuffer';
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
    this._listeners = { open: [], message: [], close: [], error: [] };
    this._id = __rayactWsOpen(this.url);
    registry[this._id] = this;
  }
  WebSocket.CONNECTING = 0; WebSocket.OPEN = 1; WebSocket.CLOSING = 2; WebSocket.CLOSED = 3;
  WebSocket.prototype.CONNECTING = 0; WebSocket.prototype.OPEN = 1;
  WebSocket.prototype.CLOSING = 2;  WebSocket.prototype.CLOSED = 3;
  WebSocket.prototype.send = function (data) {
    __rayactWsSend(this._id, typeof data === 'string' ? data : String(data));
  };
  WebSocket.prototype.close = function (code, reason) {
    if (this.readyState === 3) return;
    this.readyState = 2; // CLOSING
    __rayactWsClose(this._id, code || 1000, reason ? String(reason) : '');
  };
  WebSocket.prototype.addEventListener = function (type, fn) {
    if (this._listeners[type]) this._listeners[type].push(fn);
  };
  WebSocket.prototype.removeEventListener = function (type, fn) {
    var a = this._listeners[type]; if (!a) return;
    var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  };
  function emit(ws, type, ev) {
    var h = ws['on' + type];
    if (typeof h === 'function') { try { h.call(ws, ev); } catch (e) { if (globalThis.console) console.error(e); } }
    var a = ws._listeners[type];
    if (a) for (var i = 0; i < a.length; i++) { try { a[i].call(ws, ev); } catch (e) { if (globalThis.console) console.error(e); } }
  }
  globalThis.WebSocket = WebSocket;
  // Drained once per engine tick from native (pumpWebSocketBridge).
  globalThis.__rayactWsDispatch = function () {
    var s = __rayactWsPoll();
    if (!s) return;
    var evs; try { evs = JSON.parse(s); } catch (e) { return; }
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i]; var ws = registry[ev.id]; if (!ws) continue;
      if (ev.t === 'open')      { ws.readyState = 1; emit(ws, 'open', {}); }
      else if (ev.t === 'msg')  { emit(ws, 'message', { data: ev.data }); }
      else if (ev.t === 'error'){ emit(ws, 'error', {}); }
      else if (ev.t === 'close'){ ws.readyState = 3; delete registry[ev.id];
                                  emit(ws, 'close', { code: ev.code, reason: ev.reason, wasClean: ev.clean }); }
    }
  };
})();
)JS";

void setCFunc(JSContext* ctx, JSValue global, const char* name, JSCFunction* fn, int len) {
    JS_SetPropertyStr(ctx, global, name, JS_NewCFunction(ctx, fn, name, len));
}

} // namespace

// Install the C hooks + the JS `WebSocket` polyfill. Call once after engineCreate(),
// before loading the dev-server bundle (so the HMR runtime finds the constructor).
void registerWebSocketBridge(JSContext* ctx) {
    if (!ctx) return;
    JSValue global = JS_GetGlobalObject(ctx);
    setCFunc(ctx, global, "__rayactWsOpen",  js_ws_open,  1);
    setCFunc(ctx, global, "__rayactWsSend",  js_ws_send,  2);
    setCFunc(ctx, global, "__rayactWsClose", js_ws_close, 3);
    setCFunc(ctx, global, "__rayactWsPoll",  js_ws_poll,  0);
    JS_FreeValue(ctx, global);

    JSValue r = JS_Eval(ctx, kWebSocketPolyfill, __builtin_strlen(kWebSocketPolyfill),
                        "rayact_web_websocket.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(r)) {
        JSValue e = JS_GetException(ctx);
        const char* s = JS_ToCString(ctx, e);
        if (s) { fprintf(stderr, "[rayact-web] WebSocket polyfill failed: %s\n", s); JS_FreeCString(ctx, s); }
        JS_FreeValue(ctx, e);
    }
    JS_FreeValue(ctx, r);
}

// Drain pending browser WebSocket events into the JS handlers. Call once per tick.
void pumpWebSocketBridge(JSContext* ctx) {
    if (!ctx) return;
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue fn = JS_GetPropertyStr(ctx, global, "__rayactWsDispatch");
    if (JS_IsFunction(ctx, fn)) {
        JSValue r = JS_Call(ctx, fn, global, 0, nullptr);
        if (JS_IsException(r)) { JSValue e = JS_GetException(ctx); JS_FreeValue(ctx, e); }
        JS_FreeValue(ctx, r);
    }
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, global);
}

} // namespace rayact
