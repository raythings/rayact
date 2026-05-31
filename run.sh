#!/bin/bash
# Usage: ./run.sh [file.jsx|file.tsx|file.ts|file.js]
FILE="${1:-apps/desktop/App.jsx}"
EXT="${FILE##*.}"
BINARY="./build/bin/rayact_desktop"

if [[ "$EXT" == "jsx" ]]; then
  BUNDLE="/tmp/rayact_bundle.js"
  ./node_modules/.bin/esbuild "$FILE" --bundle --platform=neutral --format=iife \
    --jsx-factory=h --jsx-fragment=Fragment --outfile="$BUNDLE"
  exec "$BINARY" "$BUNDLE"
else
  exec "$BINARY" "$FILE"
fi
