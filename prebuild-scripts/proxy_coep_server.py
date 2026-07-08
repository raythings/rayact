#!/usr/bin/env python3
"""Dev bridge for the web target.

Serves the engine files (rayact.html/.js/.wasm) locally with COOP/COEP (so the
pthreads build gets SharedArrayBuffer / cross-origin isolation), AND reverse-proxies
`/rayact/*` to the real @rayact/dev-server. Bodies are rewritten so the dev server's
absolute URLs point back at THIS origin — that way every fetch the module-HMR runtime
makes is same-origin and isn't blocked by COEP (no CORP needed on the dev server).

Usage: python3 proxy_coep_server.py <engine_dir> <listen_port> <dev_origin>
  e.g. python3 proxy_coep_server.py build-web/bin 8768 http://localhost:8082
"""
import sys
import urllib.request
import urllib.error
import http.server
import socketserver

engine_dir = sys.argv[1] if len(sys.argv) > 1 else "."
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8768
dev_origin = sys.argv[3].rstrip("/") if len(sys.argv) > 3 else "http://localhost:8082"
self_origin = f"http://127.0.0.1:{port}"

# Hosts the dev server may emit in absolute URLs; all rewritten to self_origin.
import re
_dev_host = dev_origin.split("://", 1)[-1]
_host_variants = {_dev_host, "10.0.0.15:8082", "localhost:8082", "127.0.0.1:8082"}


def rewrite(body: bytes) -> bytes:
    text = body.decode("utf-8", "replace")
    for h in _host_variants:
        # HTTP fetches must be same-origin (COEP require-corp), so point them at self.
        text = text.replace("http://" + h, self_origin)
    # Do NOT rewrite ws:// — this proxy can't upgrade WebSockets. The web build's
    # WebSocket bridge opens the HMR socket against the REAL dev server, and
    # WebSockets are exempt from COEP, so a cross-origin ws is fine. Point every
    # host variant at the canonical dev origin so the bridge connects somewhere live.
    dev_ws = dev_origin.replace("http", "ws", 1)
    for h in _host_variants:
        text = text.replace("ws://" + h, dev_ws)
    return text.encode("utf-8")


# Set RAYACT_PROXY_INJECT=1 to inject the diagnostic prologue below into bootstrap.js.
import os as _os
_INJECT = _os.environ.get("RAYACT_PROXY_INJECT") == "1"

# Diagnostic prologue injected into bootstrap.js: traces every __rayactRequire call
# (logged just before/after, with thrown errors), and verifies console.error routes.
_BOOTSTRAP_PROLOGUE = (
    b"(function(){"
    b"var _real;"
    b"try{Object.defineProperty(globalThis,'__rayactRequire',{configurable:true,"
    b"get:function(){return _real;},"
    b"set:function(fn){_real=function(id,from){console.log('[req] '+id);"
    b"try{var r=fn(id,from);console.log('[req-ok] '+id);return r;}"
    b"catch(e){console.log('[req-throw] '+id+': '+(e&&e.message||e));throw e;}};}});}"
    b"catch(e){console.log('[inject-err] '+e);}"
    b"})();\n"
)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=engine_dir, **kw)

    def _isolate(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-store")

    def end_headers(self):
        self._isolate()
        super().end_headers()

    def _proxy(self, method):
        url = dev_origin + self.path
        length = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(length) if length else None
        req = urllib.request.Request(url, data=data, method=method)
        ct = self.headers.get("Content-Type")
        if ct:
            req.add_header("Content-Type", ct)
        try:
            with urllib.request.urlopen(req) as resp:
                body = rewrite(resp.read())
                if self.path.startswith("/rayact/bootstrap.js") and _INJECT:
                    body = _BOOTSTRAP_PROLOGUE + body
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/octet-stream"))
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())

    def do_GET(self):
        if self.path.startswith("/rayact/"):
            self._proxy("GET")
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/rayact/"):
            self._proxy("POST")
        else:
            self.send_response(404)
            self.end_headers()


socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", port), Handler) as httpd:
    print(f"proxy+coep server: {self_origin} (engine={engine_dir}, /rayact/* -> {dev_origin})")
    httpd.serve_forever()
