// Network API test — fetch, EventSource, WebSocket
// Run from rayact/build/:  ./bin/rayact_desktop net_test.js

initRaylib(500, 300, "Rayact — Network Test");

var BG     = 0x0f0f1aff;
var C_WHITE = 0xeeeeeeff;
var C_GREEN = 0x2ecc71ff;
var C_RED   = 0xe74c3cff;
var C_DIM   = 0x7777aaff;

var root = createView({ flexDirection: "column", gap: 8, padding: 20, backgroundColor: BG });

var title = createText("Network API Test", { text: { fontSize: 18, color: C_WHITE } });
appendChild(root, title);

var fetchStatus = createText("fetch: pending...", { text: { fontSize: 13, color: C_DIM } });
appendChild(root, fetchStatus);

var wsStatus = createText("websocket: pending...", { text: { fontSize: 13, color: C_DIM } });
appendChild(root, wsStatus);

var sseStatus = createText("sse: pending...", { text: { fontSize: 13, color: C_DIM } });
appendChild(root, sseStatus);

setRootNode(root);

// ── fetch test ────────────────────────────────────────────────────────────────
fetch("https://httpbin.org/json")
  .then(function(res) {
    return res.json();
  })
  .then(function(data) {
    console.log("[fetch] status ok, got JSON with keys: " + Object.keys(data).join(", "));
    console.log("[fetch] OK");
  })
  .catch(function(err) {
    console.log("[fetch] error: " + err.message);
  });

// ── WebSocket test — echo server ──────────────────────────────────────────────
var ws = new WebSocket("wss://ws.postman-echo.com/raw");
ws.onopen = function() {
  console.log("[ws] connected, sending hello");
  ws.send("hello from rayact");
  console.log("[ws] open");
};
ws.onmessage = function(e) {
  console.log("[ws] echo received: " + e.data);
  console.log("[ws] echo: " + e.data);
  ws.close();
};
ws.onerror = function(e) {
  console.log("[ws] error: " + (e.message || "?"));
  console.log("[ws] error: " + (e.message || "?"));
};
ws.onclose = function() {
  console.log("[ws] closed");
};

// ── SSE test ──────────────────────────────────────────────────────────────────
var sseCount = 0;
var es = new EventSource("https://sse.dev/api/v1/test");
es.onopen = function() {
  console.log("[sse] connected");
  console.log("[sse] connected");
};
es.onmessage = function(e) {
  sseCount++;
  console.log("[sse] event #" + sseCount + ": " + e.data.substring(0, 60));
  console.log("[sse] event #" + sseCount);
  if (sseCount >= 3) {
    es.close();
    console.log("[sse] closed after " + sseCount + " events");
  }
};
es.onerror = function(e) {
  console.log("[sse] error/closed");
  if (sseCount === 0) console.log("[sse] error: " + (e && e.message || "?"));
};
