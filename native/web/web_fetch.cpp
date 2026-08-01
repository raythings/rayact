// Web fetch bridge.
//
// The engine is QuickJS compiled to WASM and has no `fetch` global. On Android and
// iOS one is installed by native/shared/mobile_network_polyfill.h (backed by
// OkHttp / NSURLSession); web included neither that polyfill nor the libcurl
// transport in net.cpp, so `fetch` was simply undefined there. Any app that
// fetched anything — a stylesheet, a config, an API call — died with
// "ReferenceError: fetch is not defined" on web only, while working on every
// other platform.
//
// This bridges the BROWSER's own fetch into QuickJS, mirroring web_websocket.cpp
// exactly: EM_JS calls drive the real thing and push completions into a JS-side
// queue, and a JS `fetch` polyfill (installed on globalThis) drains that queue
// each engine tick to settle the promises it handed out. The web build is
// single-threaded (no pthreads/ASYNCIFY), so browser callbacks land on the main
// thread between rAF ticks and no locking is needed.
//
// Asynchronous by construction, which is the point: the dev loader's sync XHR
// (web_stubs.cpp) is fine for boot, but app code must never block the render
// thread on the network — the same rule that made mobile's fetch async.
//
// Bodies cross the boundary as latin1 strings (one byte per char), the same
// encoding the mobile polyfill uses, so binary responses survive intact and the
// JS side rebuilds the exact bytes.

#include <emscripten.h>
#include <cstdlib>
#include <cstdio>
#include <cstring>

extern "C" {
#include "quickjs.h"
}

// ─── Browser-side ops (run in the Emscripten/Module JS context) ────────────────

EM_JS(void, rayact_fetch_start,
      (int id, const char* urlPtr, const char* methodPtr, const char* headersPtr,
       const char* bodyPtr, int hasBody), {
    if (!Module.__rayactFetchQueue) {
        Module.__rayactFetchQueue = [];
        Module.__rayactFetchControllers = {};
    }
    var url = UTF8ToString(urlPtr);
    var method = UTF8ToString(methodPtr) || 'GET';
    var headers = {};
    try { headers = JSON.parse(UTF8ToString(headersPtr) || '{}'); } catch (e) {}

    var init = { method: method, headers: headers };
    if (hasBody) init.body = UTF8ToString(bodyPtr);

    // AbortController is what makes __rayactFetchAbort able to cancel a request
    // that is already in flight rather than merely ignoring its result.
    var controller = null;
    if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        init.signal = controller.signal;
        Module.__rayactFetchControllers[id] = controller;
    }

    function finish(event) {
        delete Module.__rayactFetchControllers[id];
        Module.__rayactFetchQueue.push(event);
    }

    fetch(url, init).then(function (response) {
        var responseHeaders = {};
        try {
            response.headers.forEach(function (value, key) { responseHeaders[key] = value; });
        } catch (e) {}
        return response.arrayBuffer().then(function (buffer) {
            // latin1: one char per byte, so the JS side can rebuild the bytes
            // exactly. Chunked to avoid blowing the stack on a large response.
            var bytes = new Uint8Array(buffer);
            var body = '';
            var chunk = 0x8000;
            for (var i = 0; i < bytes.length; i += chunk) {
                body += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            finish({
                id: id, status: response.status, statusText: response.statusText || '',
                url: response.url || url, headers: responseHeaders, body: body
            });
        });
    })['catch'](function (error) {
        var aborted = error && error.name === 'AbortError';
        finish({
            id: id, status: 0, canceled: !!aborted,
            error: String((error && error.message) || error || 'Network request failed')
        });
    });
});

EM_JS(void, rayact_fetch_abort, (int id), {
    var controllers = Module.__rayactFetchControllers;
    var controller = controllers && controllers[id];
    if (controller) {
        try { controller.abort(); } catch (e) {}
        delete controllers[id];
    }
});

// Returns a malloc'd JSON array string of completed requests (caller frees), or 0
// when the queue is empty.
EM_JS(char*, rayact_fetch_poll, (), {
    if (!Module.__rayactFetchQueue || Module.__rayactFetchQueue.length === 0) return 0;
    var s = JSON.stringify(Module.__rayactFetchQueue);
    Module.__rayactFetchQueue = [];
    var len = lengthBytesUTF8(s) + 1;
    var buf = _malloc(len);
    stringToUTF8(s, buf, len);
    return buf;
});

// ─── QuickJS C-function wrappers ───────────────────────────────────────────────

namespace rayact {
namespace {

JSValue js_fetch_start(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (argc < 4) return JS_UNDEFINED;
    int id = 0;
    JS_ToInt32(ctx, &id, argv[0]);
    const char* url = JS_ToCString(ctx, argv[1]);
    const char* method = JS_ToCString(ctx, argv[2]);
    const char* headers = JS_ToCString(ctx, argv[3]);
    bool hasBody = argc >= 5 && !JS_IsNull(argv[4]) && !JS_IsUndefined(argv[4]);
    const char* body = hasBody ? JS_ToCString(ctx, argv[4]) : nullptr;

    rayact_fetch_start(id, url ? url : "", method ? method : "GET",
                       headers ? headers : "{}", body ? body : "", hasBody ? 1 : 0);

    if (url) JS_FreeCString(ctx, url);
    if (method) JS_FreeCString(ctx, method);
    if (headers) JS_FreeCString(ctx, headers);
    if (body) JS_FreeCString(ctx, body);
    return JS_UNDEFINED;
}

JSValue js_fetch_abort(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    int id = 0;
    JS_ToInt32(ctx, &id, argv[0]);
    rayact_fetch_abort(id);
    return JS_UNDEFINED;
}

JSValue js_fetch_poll(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    char* s = rayact_fetch_poll();
    if (!s) return JS_NULL;
    JSValue r = JS_NewString(ctx, s);
    free(s);
    return r;
}

// JS `fetch` polyfill + the per-tick drain (`__rayactFetchDispatch`).
//
// Installed only when nothing else already provided a fetch, matching the guard
// the mobile polyfill uses — the host that owns the platform's transport wins.
//
// The Response is the subset apps actually use: ok/status/statusText/url,
// headers.get, and text()/json()/arrayBuffer(). Enough for stylesheet and asset
// loading, the dev client, and ordinary JSON APIs.
const char* kFetchPolyfill = R"JS(
(function () {
  if (typeof globalThis.fetch === 'function') return;

  var pending = {};
  var nextId = 1;

  function plainHeaders(input) {
    var out = {};
    if (!input) return out;
    if (typeof input.forEach === 'function' && typeof input.get === 'function') {
      input.forEach(function (value, key) { out[String(key)] = String(value); });
      return out;
    }
    if (Array.isArray(input)) {
      for (var i = 0; i < input.length; i++) out[String(input[i][0])] = String(input[i][1]);
      return out;
    }
    for (var k in input) {
      if (Object.prototype.hasOwnProperty.call(input, k)) out[k] = String(input[k]);
    }
    return out;
  }

  function bytesFromLatin1(s) {
    var n = s.length, buf = new ArrayBuffer(n), view = new Uint8Array(buf);
    for (var i = 0; i < n; i++) view[i] = s.charCodeAt(i) & 0xff;
    return { buffer: buf, view: view };
  }

  function decodeUtf8(view) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(view);
    // Minimal UTF-8 decode so a host without TextDecoder still gets text().
    var out = '', i = 0;
    while (i < view.length) {
      var c = view[i++];
      if (c < 0x80) out += String.fromCharCode(c);
      else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (view[i++] & 0x3f));
      else if (c < 0xf0) {
        out += String.fromCharCode(((c & 0x0f) << 12) | ((view[i++] & 0x3f) << 6) | (view[i++] & 0x3f));
      } else {
        var cp = ((c & 0x07) << 18) | ((view[i++] & 0x3f) << 12) |
                 ((view[i++] & 0x3f) << 6) | (view[i++] & 0x3f);
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      }
    }
    return out;
  }

  function makeResponse(event) {
    var bytes = bytesFromLatin1(event.body || '');
    var headers = event.headers || {};
    var lower = {};
    for (var k in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, k)) lower[k.toLowerCase()] = headers[k];
    }
    return {
      ok: event.status >= 200 && event.status < 300,
      status: event.status,
      statusText: event.statusText || '',
      url: event.url || '',
      headers: {
        get: function (name) {
          var v = lower[String(name).toLowerCase()];
          return v === undefined ? null : v;
        },
        has: function (name) { return lower[String(name).toLowerCase()] !== undefined; },
        forEach: function (fn) {
          for (var key in lower) {
            if (Object.prototype.hasOwnProperty.call(lower, key)) fn(lower[key], key);
          }
        }
      },
      text: function () { return Promise.resolve(decodeUtf8(bytes.view)); },
      json: function () { return Promise.resolve(JSON.parse(decodeUtf8(bytes.view))); },
      arrayBuffer: function () { return Promise.resolve(bytes.buffer); }
    };
  }

  function abortError(reason) {
    if (reason !== undefined && reason !== null) return reason;
    var e = new Error('The operation was aborted.');
    e.name = 'AbortError';
    return e;
  }

  globalThis.fetch = function (url, options) {
    var opts = options || {};
    var id = nextId++;
    var method = String(opts.method || 'GET').toUpperCase();
    var signal = opts.signal;
    var headers, body;
    try {
      headers = plainHeaders(opts.headers);
      body = opts.body === undefined || opts.body === null ? null : String(opts.body);
    } catch (e) {
      return Promise.reject(e);
    }
    if (signal && signal.aborted) return Promise.reject(abortError(signal.reason));

    return new Promise(function (resolve, reject) {
      var entry = { resolve: resolve, reject: reject, signal: signal, onAbort: null };
      pending[id] = entry;
      if (signal && typeof signal.addEventListener === 'function') {
        // Settle immediately on abort rather than waiting for the browser's
        // cancellation to come back through the queue.
        entry.onAbort = function () {
          if (!pending[id]) return;
          delete pending[id];
          try { __rayactFetchAbort(id); } catch (e) {}
          reject(abortError(signal.reason));
        };
        signal.addEventListener('abort', entry.onAbort);
      }
      try {
        __rayactFetchStart(id, String(url), method, JSON.stringify(headers), body);
      } catch (e) {
        delete pending[id];
        if (signal && entry.onAbort && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', entry.onAbort);
        }
        reject(e);
      }
    });
  };

  // Drained once per engine tick from native (pumpFetchBridge).
  globalThis.__rayactFetchDispatch = function () {
    var s = __rayactFetchPoll();
    if (!s) return;
    var events; try { events = JSON.parse(s); } catch (e) { return; }
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var entry = pending[ev.id];
      if (!entry) continue;
      delete pending[ev.id];
      if (entry.signal && entry.onAbort && typeof entry.signal.removeEventListener === 'function') {
        entry.signal.removeEventListener('abort', entry.onAbort);
      }
      if (ev.canceled) { entry.reject(abortError(entry.signal && entry.signal.reason)); continue; }
      if (ev.status === 0) { entry.reject(new Error(ev.error || 'Network request failed')); continue; }
      try { entry.resolve(makeResponse(ev)); }
      catch (e) { entry.reject(e); }
    }
  };
})();
)JS";

void setCFunc(JSContext* ctx, JSValue global, const char* name, JSCFunction* fn, int len) {
    JS_SetPropertyStr(ctx, global, name, JS_NewCFunction(ctx, fn, name, len));
}

} // namespace

// Install the C hooks + the JS `fetch` polyfill. Call once after engineCreate(),
// before loading the bundle, so app code finds `fetch` at module scope.
void registerFetchBridge(JSContext* ctx) {
    if (!ctx) return;
    JSValue global = JS_GetGlobalObject(ctx);
    setCFunc(ctx, global, "__rayactFetchStart", js_fetch_start, 5);
    setCFunc(ctx, global, "__rayactFetchAbort", js_fetch_abort, 1);
    setCFunc(ctx, global, "__rayactFetchPoll",  js_fetch_poll,  0);
    JS_FreeValue(ctx, global);

    JSValue r = JS_Eval(ctx, kFetchPolyfill, __builtin_strlen(kFetchPolyfill),
                        "rayact_web_fetch.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(r)) {
        JSValue e = JS_GetException(ctx);
        const char* s = JS_ToCString(ctx, e);
        fprintf(stderr, "[rayact-web] fetch polyfill failed: %s\n", s ? s : "?");
        if (s) JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, e);
    }
    JS_FreeValue(ctx, r);
}

// Settle any fetches the browser completed since the last tick.
void pumpFetchBridge(JSContext* ctx) {
    if (!ctx) return;
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue fn = JS_GetPropertyStr(ctx, global, "__rayactFetchDispatch");
    if (JS_IsFunction(ctx, fn)) {
        JSValue r = JS_Call(ctx, fn, global, 0, nullptr);
        if (JS_IsException(r)) JS_FreeValue(ctx, JS_GetException(ctx));
        JS_FreeValue(ctx, r);
    }
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, global);
}

} // namespace rayact
