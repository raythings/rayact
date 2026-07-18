#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
BUILD_DIR=${RAYACT_WEB_RELEASE_BUILD_DIR:-"$ROOT/build-web-release"}
OUTPUT_DIR=${RAYACT_WEB_OUTPUT_DIR:-"$ROOT/build-web/bin"}

emcmake cmake -S "$ROOT" -B "$BUILD_DIR" \
  -DENABLE_DESKTOP=OFF \
  -DENABLE_WEB=ON \
  -DCMAKE_BUILD_TYPE=Release \
  -DRAYACT_RELEASE_HOST=ON
cmake --build "$BUILD_DIR" --target rayact -j "${RAYACT_BUILD_JOBS:-4}"

mkdir -p "$OUTPUT_DIR"
for file in rayact_release.html rayact_release.js rayact_release.wasm; do
  src="$BUILD_DIR/bin/$file"
  if [ ! -f "$src" ]; then
    echo "release Web host output not found: $src" >&2
    exit 1
  fi
  cp "$src" "$OUTPUT_DIR/$file"
done

echo "Release Web host written to $OUTPUT_DIR"
