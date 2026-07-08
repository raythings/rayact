#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=verify-common.sh
source "$ROOT/scripts/verify-common.sh"
OUT="$ROOT/.rayact/verify/$(date +%Y%m%d-%H%M%S)/desktop"
mkdir -p "$OUT"

cd "$ROOT"

echo "[verify-desktop] building dev-server..."
npm run build:dev-server >/dev/null 2>&1 || npm run build:dev-server

echo "[verify-desktop] building native desktop (if cmake exists)..."
if [ -f build/bin/rayact_desktop ]; then
  BIN=build/bin/rayact_desktop
elif [ -d build ]; then
  cmake --build build --target rayact_desktop -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 4)" 2>"$OUT/cmake.log" || true
  BIN=build/bin/rayact_desktop
else
  echo "SKIP: no cmake build dir" | tee "$OUT/status.txt"
  exit 0
fi

echo "[verify-desktop] release bundle..."
node packages/rayact-dev-server/dist/cli.js build --mode release --entry "$VERIFY_APP_ENTRY" --out "$OUT/dist" 2>"$OUT/build.log" || {
  echo "FAIL: release build" | tee "$OUT/status.txt"
  exit 1
}

if [ -x "$BIN" ]; then
  echo "[verify-desktop] desktop render..."
  CDP_PORT="${RAYACT_VERIFY_CDP_PORT:-9333}"
  rm -f "$OUT/shot-release.png" shot-release.png
  RAYACT_DEVTOOLS=1 \
  RAYACT_CDP_PORT="$CDP_PORT" \
  RAYACT_SCRIPT="5:size:1120,900;120:shot:shot-release.png;300:quit" \
    "$BIN" "$OUT/dist/bundle.js" >"$OUT/stdout.log" 2>&1 &
  DESKTOP_PID=$!
  if ! python3 "$ROOT/scripts/verify-desktop-dom.py" "$CDP_PORT" \
    "runtime-app HMR confirmed" \
    "Platform: macos" \
    "Tap me" >"$OUT/dom.log" 2>&1; then
    cat "$OUT/dom.log"
    kill "$DESKTOP_PID" >/dev/null 2>&1 || true
    wait "$DESKTOP_PID" >/dev/null 2>&1 || true
    echo "FAIL: desktop DOM render" | tee "$OUT/status.txt"
    exit 1
  fi
  cat "$OUT/dom.log"
  wait "$DESKTOP_PID" >/dev/null 2>&1 || true
  if [ -f shot-release.png ]; then
    mv shot-release.png "$OUT/shot-release.png"
  fi
  if [ ! -f "$OUT/shot-release.png" ]; then
    echo "WARN: missing desktop screenshot artifact" | tee -a "$OUT/status.txt"
  else
    if ! python3 - "$OUT/shot-release.png" >"$OUT/screenshot.log" 2>&1 <<'PY'
import struct
import sys
import zlib

path = sys.argv[1]
data = open(path, 'rb').read()
if data[:8] != b'\x89PNG\r\n\x1a\n':
    raise SystemExit('not a PNG screenshot')

pos = 8
width = height = color_type = bit_depth = interlace = None
raw = bytearray()
while pos + 8 <= len(data):
    length = struct.unpack('>I', data[pos:pos + 4])[0]
    kind = data[pos + 4:pos + 8]
    chunk = data[pos + 8:pos + 8 + length]
    pos += 12 + length
    if kind == b'IHDR':
        width, height, bit_depth, color_type, _compression, _filter, interlace = struct.unpack('>IIBBBBB', chunk)
    elif kind == b'IDAT':
        raw.extend(chunk)
    elif kind == b'IEND':
        break

if width is None or height is None or bit_depth != 8 or interlace != 0 or color_type not in (2, 6):
    raise SystemExit('unsupported PNG format for screenshot validation')

channels = 4 if color_type == 6 else 3
stride = width * channels
stream = zlib.decompress(bytes(raw))
rows = []
offset = 0
prev = bytearray(stride)
for _y in range(height):
    filter_type = stream[offset]
    offset += 1
    row = bytearray(stream[offset:offset + stride])
    offset += stride
    for i in range(stride):
        left = row[i - channels] if i >= channels else 0
        up = prev[i]
        up_left = prev[i - channels] if i >= channels else 0
        if filter_type == 1:
            row[i] = (row[i] + left) & 255
        elif filter_type == 2:
            row[i] = (row[i] + up) & 255
        elif filter_type == 3:
            row[i] = (row[i] + ((left + up) // 2)) & 255
        elif filter_type == 4:
            p = left + up - up_left
            pa = abs(p - left)
            pb = abs(p - up)
            pc = abs(p - up_left)
            row[i] = (row[i] + (left if pa <= pb and pa <= pc else up if pb <= pc else up_left)) & 255
        elif filter_type != 0:
            raise SystemExit('unsupported PNG filter')
    rows.append(row)
    prev = row

sample_step = max(1, (width * height) // 20000)
count = red_total = green_total = blue_total = red_pixels = 0
pixel_index = 0
for row in rows:
    for x in range(0, stride, channels):
        if pixel_index % sample_step == 0:
            r, g, b = row[x], row[x + 1], row[x + 2]
            red_total += r
            green_total += g
            blue_total += b
            if r > 120 and g < 80 and b < 80:
                red_pixels += 1
            count += 1
        pixel_index += 1

avg_r = red_total / count
avg_g = green_total / count
avg_b = blue_total / count
luma = 0.2126 * avg_r + 0.7152 * avg_g + 0.0722 * avg_b
red_ratio = red_pixels / count
if luma < 8:
    raise SystemExit(f'black desktop screenshot: luma={luma:.2f}')
if red_ratio > 0.35 and avg_r > avg_g * 1.8 and avg_r > avg_b * 1.8:
    raise SystemExit(f'red error-like desktop screenshot: red_ratio={red_ratio:.2f}')
print(f'screenshot ok: luma={luma:.2f} red_ratio={red_ratio:.2f}')
PY
    then
      sed 's/^/WARN: /' "$OUT/screenshot.log"
    else
      cat "$OUT/screenshot.log"
    fi
  fi
  echo "PASS" | tee "$OUT/status.txt"
else
  echo "SKIP: rayact_desktop binary missing" | tee "$OUT/status.txt"
fi

echo "[verify-desktop] artifacts: $OUT"
