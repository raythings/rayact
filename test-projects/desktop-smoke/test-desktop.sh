#!/bin/bash
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$PROJECT/../.." && pwd)"
OUT="$PROJECT/.verify/$(date +%Y%m%d-%H%M%S)"
BIN="$REPO/build/bin/rayact_desktop"

mkdir -p "$OUT"
cd "$PROJECT"

if [ ! -d "$REPO/node_modules/vite" ]; then
  echo "[desktop-smoke] npm install (ignore-scripts)..."
  (cd "$REPO" && npm install --ignore-scripts >/dev/null)
fi

echo "[desktop-smoke] vite build..."
npm run build 2>"$OUT/build.log"

if [ ! -f dist/bundle.js ]; then
  echo "FAIL: dist/bundle.js missing" | tee "$OUT/status.txt"
  cat "$OUT/build.log"
  exit 1
fi

cp dist/bundle.js "$OUT/bundle.js"
echo "[desktop-smoke] bundle.js: $(wc -c < dist/bundle.js | tr -d ' ') bytes"

if [ ! -x "$BIN" ]; then
  echo "SKIP: rayact_desktop not found at $BIN" | tee "$OUT/status.txt"
  exit 0
fi

echo "[desktop-smoke] running desktop..."
RAYACT_SHOT=1 "$BIN" "$PROJECT/dist/bundle.js" >"$OUT/stdout.log" 2>"$OUT/stderr.log" || true

if [ -f "$PROJECT/shot.png" ]; then
  mv "$PROJECT/shot.png" "$OUT/shot.png"
  echo "PASS: screenshot captured" | tee "$OUT/status.txt"
elif [ -f "$REPO/shot.png" ]; then
  mv "$REPO/shot.png" "$OUT/shot.png"
  echo "PASS: screenshot captured" | tee "$OUT/status.txt"
else
  if grep -qiE "Successfully loaded|Loaded file|Engine initialized" "$OUT/stdout.log" 2>/dev/null; then
    echo "PASS: bundle loaded" | tee "$OUT/status.txt"
  else
    echo "FAIL" | tee "$OUT/status.txt"
    tail -30 "$OUT/stderr.log" || tail -30 "$OUT/stdout.log"
    exit 1
  fi
fi

echo "[desktop-smoke] artifacts: $OUT"
