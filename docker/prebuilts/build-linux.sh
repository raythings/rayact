#!/usr/bin/env bash
set -euo pipefail

RAYACT_ROOT="${RAYACT_ROOT:-/workspace/rayact}"
cd "$RAYACT_ROOT"

echo "==> Building Rayact desktop (Linux)..."
BUILD_DIR="$RAYACT_ROOT/build-linux"
QUICKJS_BUILD_DIR="$RAYACT_ROOT/build-linux/quickjs"
BUILD_JOBS="${RAYACT_BUILD_JOBS:-2}"
cmake -B "$QUICKJS_BUILD_DIR" -S "$RAYACT_ROOT/third_party/quickjs" \
  -DCMAKE_BUILD_TYPE=Release -DQJS_BUILD_EXAMPLES=OFF
cmake --build "$QUICKJS_BUILD_DIR" --parallel "$BUILD_JOBS"
cmake -B "$BUILD_DIR" -S . -DENABLE_DESKTOP=ON -DCMAKE_BUILD_TYPE=Release \
  -DQUICKJS_BUILD_DIR="$QUICKJS_BUILD_DIR" \
  -UQUICKJS_LIBRARY -UQUICKJS_LIBC_LIBRARY
cmake --build "$BUILD_DIR" --parallel "$BUILD_JOBS"

export RAYACT_ROOT
"$(dirname "$0")/pack-linux.sh"
