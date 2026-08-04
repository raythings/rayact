#!/usr/bin/env bash
# Cross-build and stage the supported Windows x64 release artifacts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

: "${XWIN_DIR:=$HOME/.cache/xwin-splat}"
export XWIN_DIR

if [[ ! -d "$XWIN_DIR/crt" || ! -d "$XWIN_DIR/sdk" ]]; then
  echo "error: XWIN_DIR='$XWIN_DIR' is not an xwin splat" >&2
  exit 1
fi

scripts/build-windows-deps.sh x64
scripts/fetch-cef-windows.sh windows64

cmake --fresh -G Ninja -S . -B build-windows-x64 \
  -DCMAKE_TOOLCHAIN_FILE="$ROOT/cmake/toolchains/windows-clang-x64.cmake" \
  -DCMAKE_BUILD_TYPE=Release -DENABLE_DESKTOP=ON -DRAYACT_ENABLE_DEVTOOLS=OFF
cmake --build build-windows-x64 --target rayact_desktop rayact_tool --clean-first --parallel

cmake --fresh -G Ninja -S . -B build-windows-x64-release \
  -DCMAKE_TOOLCHAIN_FILE="$ROOT/cmake/toolchains/windows-clang-x64.cmake" \
  -DCMAKE_BUILD_TYPE=Release -DENABLE_DESKTOP=ON \
  -DRAYACT_RELEASE_HOST=ON -DRAYACT_ENABLE_DEVTOOLS=OFF
cmake --build build-windows-x64-release --target rayact_desktop --clean-first --parallel

scripts/build-windows-module-artifacts.sh x64
node scripts/stage-windows-release.mjs --all

echo "Windows x64 prebuilt and dev-app staged."
