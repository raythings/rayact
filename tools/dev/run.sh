#!/bin/bash
# Usage: ./run.sh [file.jsx|file.tsx|file.ts|file.js]
FILE="${1:-apps/desktop/App.jsx}"
EXT="${FILE##*.}"
BINARY="./build/bin/rayact_desktop"
RAYM3_BUILD="../raym3/build-v2-yoga2"

# Rebuild native deps so raym3 input/layout fixes land in the desktop binary.
if [[ -d "$RAYM3_BUILD" ]]; then
  cmake --build "$RAYM3_BUILD" -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
fi
if [[ -d build ]]; then
  cmake --build build -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
fi

if [[ "$EXT" == "jsx" || "$EXT" == "tsx" || "$EXT" == "ts" ]]; then
  OUT_DIR="/tmp/rayact_run"
  node packages/rayact-dev-server/dist/cli.js build --mode release --entry "$FILE" --out "$OUT_DIR"
  exec "$BINARY" "$OUT_DIR/bundle.js"
else
  exec "$BINARY" "$FILE"
fi
