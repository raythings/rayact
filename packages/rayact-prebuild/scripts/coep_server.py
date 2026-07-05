#!/usr/bin/env python3
"""Static server that sends COOP/COEP headers so SharedArrayBuffer (Emscripten
pthreads / workers) is available. Serves the directory passed as argv[1] (default cwd).

Usage: python3 coep_server.py [dir] [port]
"""
import sys
import http.server
import socketserver

directory = sys.argv[1] if len(sys.argv) > 1 else "."
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8768


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
    print(f"COEP server: http://127.0.0.1:{port} serving {directory}")
    httpd.serve_forever()
