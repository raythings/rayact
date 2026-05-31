// Browser API compliance smoke test — no network required
initRaylib(400, 150, "API Test");
var root = createView({ padding: 10 });
setRootNode(root);

var pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { console.log("[PASS] " + label); pass++; }
  else       { console.log("[FAIL] " + label); fail++; }
}

// Headers
var h = new Headers({ "Content-Type": "application/json", "X-Foo": "bar" });
ok("Headers.get",     h.get("content-type") === "application/json");
ok("Headers.has",     h.has("x-foo") === true);
ok("Headers.missing", h.get("missing") === null);
h.append("x-foo", "baz");
ok("Headers.append",  h.get("x-foo") === "bar, baz");
h.delete("x-foo");
ok("Headers.delete",  h.has("x-foo") === false);
var entries = h.entries();
ok("Headers.entries", entries.length === 1 && entries[0][0] === "content-type");

// EventTarget + Event
var et = new EventTarget();
var fired = [];
et.addEventListener("ping", function(e) { fired.push(e.type + ":" + e.detail); });
et.addEventListener("ping", function(e) { fired.push("second"); }, { once: true });
var ev = new Event("ping"); ev.detail = "hello";
et.dispatchEvent(ev);
et.dispatchEvent(ev);
ok("EventTarget.addEventListener",  fired.length === 3);
ok("Event.type",                    ev.type === "ping");

// on* handler
var et2 = new EventTarget();
var got = null;
et2.onpong = function(e) { got = e.type; };
et2.dispatchEvent(new Event("pong"));
ok("EventTarget on* handler", got === "pong");

// MessageEvent
var me = new MessageEvent("message", { data: "hello", lastEventId: "42" });
ok("MessageEvent.data",        me.data === "hello");
ok("MessageEvent.lastEventId", me.lastEventId === "42");

// CloseEvent
var ce = new CloseEvent("close", { code: 1001, reason: "going away", wasClean: true });
ok("CloseEvent.code",     ce.code === 1001);
ok("CloseEvent.reason",   ce.reason === "going away");
ok("CloseEvent.wasClean", ce.wasClean === true);

// ErrorEvent
var ee = new ErrorEvent("error", { message: "oops" });
ok("ErrorEvent.message", ee.message === "oops");

// DOMException
var de = new DOMException("abort", "AbortError");
ok("DOMException.name",    de.name === "AbortError");
ok("DOMException.message", de.message === "abort");

// Response
var resp = new Response('{"x":1}', {
  status: 201, statusText: "Created",
  headers: new Headers({ "x-h": "v" }),
  url: "https://example.com", redirected: true
});
ok("Response.status",     resp.status === 201);
ok("Response.statusText", resp.statusText === "Created");
ok("Response.ok",         resp.ok === true);
ok("Response.url",        resp.url === "https://example.com");
ok("Response.redirected", resp.redirected === true);
ok("Response.headers.get", resp.headers.get("x-h") === "v");
var resp2 = resp.clone();
var resp3 = resp.clone();
ok("Response.clone.status", resp2.status === 201);
resp.json().then(function(d) { ok("Response.json", d.x === 1); });
resp2.text().then(function(t) { ok("Response.text", t === '{"x":1}'); });
resp3.arrayBuffer().then(function(ab) { ok("Response.arrayBuffer", ab.byteLength === 7); });

// AbortController / AbortSignal
var ac = new AbortController();
ok("AbortSignal.initial", ac.signal.aborted === false);
var abortFired = false;
ac.signal.addEventListener("abort", function() { abortFired = true; });
ac.abort();
ok("AbortController.abort",      ac.signal.aborted === true);
ok("AbortSignal abort event",    abortFired === true);
ok("AbortSignal.reason",         ac.signal.reason instanceof DOMException);
// abort when already aborted is a no-op
ac.abort(new Error("second"));
ok("AbortController idempotent", ac.signal.reason instanceof DOMException);

// fetch abort before start
var ac2 = new AbortController();
ac2.abort();
fetch("https://example.com", { signal: ac2.signal })
  .then(function() { ok("fetch abort", false); })
  .catch(function(e) { ok("fetch abort pre-signal", e instanceof DOMException && e.name==="AbortError"); });

// Deferred check (run after pending microtasks settle)
setTimeout(function() {
  console.log("Results: " + pass + " passed, " + fail + " failed");
}, 100);
