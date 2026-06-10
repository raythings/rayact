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
  BUNDLE="/tmp/rayact_bundle.js"
  ./node_modules/.bin/esbuild "$FILE" --bundle --platform=browser --main-fields=main,module --define:process.env.NODE_ENV=\"production\" --format=iife \
    --jsx-factory=React.createElement --jsx-fragment=React.Fragment --outfile="$BUNDLE"
  exec "$BINARY" "$BUNDLE"
else
  exec "$BINARY" "$FILE"
fi
