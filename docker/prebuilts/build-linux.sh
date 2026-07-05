#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${WORKSPACE:-/workspace}"
RAYACT_ROOT="${RAYACT_ROOT:-$WORKSPACE/rayact}"
cd "$RAYACT_ROOT"

echo "==> Building Rayact desktop (Linux)..."
cmake -B build -S . -DENABLE_DESKTOP=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel

echo "==> Building plugins..."
cmake -B build/plugins -S native/plugins \
  -DCMAKE_LIBRARY_OUTPUT_DIRECTORY="$RAYACT_ROOT/build/modules" \
  -DCMAKE_BUILD_TYPE=Release
cmake --build build/plugins --parallel

export RAYACT_ROOT
"$(dirname "$0")/pack-linux.sh"
