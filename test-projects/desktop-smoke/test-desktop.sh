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
"$BIN" "$PROJECT/dist/bundle.js" >"$OUT/stdout.log" 2>"$OUT/stderr.log" &
pid=$!
status=0
for _ in $(seq 1 20); do
  if grep -q "Successfully executed JavaScript file" "$OUT/stdout.log" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
  sleep 0.25
done
if kill -0 "$pid" 2>/dev/null; then
  kill "$pid" || true
  wait "$pid" || status=$?
else
  wait "$pid" || status=$?
fi
if [ "$status" -eq 143 ]; then
  status=0
fi

if grep -qiE "Successfully loaded|Loaded file|Engine initialized" "$OUT/stdout.log" 2>/dev/null; then
  if [ "$status" -ne 0 ]; then
    echo "FAIL: desktop runtime exited with status $status" | tee "$OUT/status.txt"
    tail -30 "$OUT/stderr.log" || tail -30 "$OUT/stdout.log"
    exit 1
  fi
  if grep -qiE "Segmentation fault|core dumped" "$OUT/stderr.log" 2>/dev/null; then
    echo "FAIL: desktop runtime crashed" | tee "$OUT/status.txt"
    tail -30 "$OUT/stderr.log" || tail -30 "$OUT/stdout.log"
    exit 1
  fi
  echo "PASS: bundle loaded" | tee "$OUT/status.txt"
else
  echo "FAIL" | tee "$OUT/status.txt"
  tail -30 "$OUT/stderr.log" || tail -30 "$OUT/stdout.log"
  exit 1
fi

echo "[desktop-smoke] artifacts: $OUT"
