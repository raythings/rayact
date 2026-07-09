#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${WORKSPACE:-/workspace}"
RAYACT_ROOT="${RAYACT_ROOT:-$WORKSPACE/rayact}"
cd "$RAYACT_ROOT"

echo "==> Building Rayact desktop (Linux)..."
BUILD_DIR="$RAYACT_ROOT/build-linux"
QUICKJS_BUILD_DIR="$WORKSPACE/quickjs/build-linux"
cmake -B "$QUICKJS_BUILD_DIR" -S "$WORKSPACE/quickjs" \
  -DCMAKE_BUILD_TYPE=Release -DQJS_BUILD_EXAMPLES=OFF
cmake --build "$QUICKJS_BUILD_DIR" --parallel
cmake -B "$BUILD_DIR" -S . -DENABLE_DESKTOP=ON -DCMAKE_BUILD_TYPE=Release \
  -DQUICKJS_BUILD_DIR="$QUICKJS_BUILD_DIR" \
  -UQUICKJS_LIBRARY -UQUICKJS_LIBC_LIBRARY
cmake --build "$BUILD_DIR" --parallel

echo "==> Building plugins..."
cmake -B "$BUILD_DIR/plugins" -S native/plugins \
  -DCMAKE_LIBRARY_OUTPUT_DIRECTORY="$BUILD_DIR/modules" \
  -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD_DIR/plugins" --parallel

export RAYACT_ROOT
"$(dirname "$0")/pack-linux.sh"
