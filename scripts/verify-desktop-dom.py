#!/usr/bin/env python3
import base64
import json
import os
import socket
import struct
import sys
import time
import urllib.request


def fail(message: str) -> None:
    raise SystemExit(message)


def wait_for_cdp(port: int, deadline: float) -> str:
    url = f"http://127.0.0.1:{port}/json/list"
    last_error = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                targets = json.loads(response.read().decode("utf-8"))
            if targets and targets[0].get("webSocketDebuggerUrl"):
                return targets[0]["webSocketDebuggerUrl"]
        except Exception as error:
            last_error = error
        time.sleep(0.1)
    fail(f"CDP server did not become ready: {last_error}")


def ws_connect(url: str) -> socket.socket:
    if not url.startswith("ws://"):
        fail(f"unsupported websocket URL: {url}")
    rest = url[len("ws://"):]
    host_port, _, path = rest.partition("/")
    host, _, port_text = host_port.partition(":")
    port = int(port_text or "80")
    path = "/" + path
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    sock = socket.create_connection((host, port), timeout=3)
    request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(request.encode("ascii"))
    response = b""
    while b"\r\n\r\n" not in response:
        chunk = sock.recv(4096)
        if not chunk:
            fail("websocket handshake closed")
        response += chunk
    if b" 101 " not in response.split(b"\r\n", 1)[0]:
        fail(response.decode("utf-8", "replace"))
    return sock


def ws_send_text(sock: socket.socket, payload: dict) -> None:
    data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    mask = os.urandom(4)
    header = bytearray([0x81])
    size = len(data)
    if size < 126:
        header.append(0x80 | size)
    elif size < 65536:
        header.extend([0x80 | 126])
        header.extend(struct.pack(">H", size))
    else:
        header.extend([0x80 | 127])
        header.extend(struct.pack(">Q", size))
    masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(data))
    sock.sendall(bytes(header) + mask + masked)


def ws_recv_text(sock: socket.socket, timeout: float) -> str:
    sock.settimeout(timeout)
    first = sock.recv(2)
    if len(first) < 2:
        fail("websocket frame closed")
    opcode = first[0] & 0x0F
    size = first[1] & 0x7F
    masked = bool(first[1] & 0x80)
    if size == 126:
        size = struct.unpack(">H", sock.recv(2))[0]
    elif size == 127:
        size = struct.unpack(">Q", sock.recv(8))[0]
    mask = sock.recv(4) if masked else b""
    data = b""
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            fail("websocket frame closed")
        data += chunk
    if masked:
        data = bytes(byte ^ mask[index % 4] for index, byte in enumerate(data))
    if opcode == 8:
        fail("websocket closed")
    return data.decode("utf-8", "replace")


def cdp_request(sock: socket.socket, message: dict, deadline: float) -> dict:
    message_id = str(message["id"])
    ws_send_text(sock, message)
    while time.time() < deadline:
        response = json.loads(ws_recv_text(sock, 1.0))
        if str(response.get("id")) == message_id:
            return response
    fail(f"timed out waiting for CDP response id={message_id}")


def main() -> None:
    if len(sys.argv) < 3:
        fail("usage: verify-desktop-dom.py <port> <expected-text> [expected-text...]")
    port = int(sys.argv[1])
    expected = sys.argv[2:]
    deadline = time.time() + 12
    ws_url = wait_for_cdp(port, deadline)
    sock = ws_connect(ws_url)
    try:
        last_tree = ""
        request_id = 1
        while time.time() < deadline:
            response = cdp_request(
                sock,
                {
                    "id": str(request_id),
                    "method": "Runtime.evaluate",
                    "params": {
                        "expression": "typeof getNodeTree === 'function' ? getNodeTree() : ''"
                    },
                },
                deadline,
            )
            request_id += 1
            last_tree = (
                response.get("result", {})
                .get("result", {})
                .get("value", "")
            )
            if last_tree and last_tree != "[]" and all(item in last_tree for item in expected):
                break
            time.sleep(0.1)
    finally:
        sock.close()
    if not last_tree or last_tree == "[]":
        fail("desktop DOM tree is empty")
    if "Rayact runtime error" in last_tree or "Rayact dev client failed" in last_tree:
        fail(f"desktop rendered error overlay:\n{last_tree}")
    missing = [item for item in expected if item not in last_tree]
    if missing:
        fail(f"desktop DOM missing {missing}; rendered tree:\n{last_tree}")
    print(f"desktop DOM ok: {', '.join(expected)}")


if __name__ == "__main__":
    main()
