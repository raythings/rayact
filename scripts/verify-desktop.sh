#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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
node packages/rayact-dev-server/dist/cli.js build --mode release --entry apps/desktop/src/App.tsx --out "$OUT/dist" 2>"$OUT/build.log" || {
  echo "FAIL: release build" | tee "$OUT/status.txt"
  exit 1
}

if [ -x "$BIN" ]; then
  echo "[verify-desktop] desktop screenshot..."
  RAYACT_SHOT=1 "$BIN" "$OUT/dist/bundle.js" >"$OUT/stdout.log" 2>&1 || true
  [ -f shot.png ] && mv shot.png "$OUT/shot-release.png"
  echo "PASS" | tee "$OUT/status.txt"
else
  echo "SKIP: rayact_desktop binary missing" | tee "$OUT/status.txt"
fi

echo "[verify-desktop] artifacts: $OUT"
