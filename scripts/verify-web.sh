#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.rayact/verify/$(date +%Y%m%d-%H%M%S)/web"
mkdir -p "$OUT"

cd "$ROOT"

if ! command -v emcmake >/dev/null 2>&1; then
  echo "SKIP: emcmake not found" | tee "$OUT/status.txt"
  exit 0
fi

echo "[verify-web] building packages..."
npm run build >/dev/null 2>&1 || npm run build

echo "[verify-web] building web host..."
(cd apps/web && npm run build) >"$OUT/build.log" 2>&1 || {
  echo "FAIL: web build" | tee "$OUT/status.txt"
  tail -80 "$OUT/build.log" || true
  exit 1
}

WEB_BIN="$ROOT/build-web/bin"
for f in rayact.html rayact.js rayact.wasm; do
  if [ ! -f "$WEB_BIN/$f" ]; then
    echo "FAIL: missing $WEB_BIN/$f" | tee "$OUT/status.txt"
    exit 1
  fi
done

cp "$ROOT/apps/web/dist/manifest.json" "$OUT/manifest.json" 2>/dev/null || true
find "$WEB_BIN" -maxdepth 1 -type f \( -name 'rayact.*' -o -name '*.data' -o -name '*.worker.js' \) -print >"$OUT/files.txt"

echo "PASS" | tee "$OUT/status.txt"
echo "[verify-web] artifacts: $OUT"
