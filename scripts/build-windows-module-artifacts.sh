#!/usr/bin/env bash
# Build the desktop native modules as Windows DLLs (x64 + arm64).
#
# Cross-compiles from macOS/Linux with clang-cl + lld-link against an xwin-
# splatted MSVC CRT / Windows SDK — see cmake/toolchains/windows-clang-*.cmake
# for prerequisites (brew install llvm lld; cargo install xwin).
#
#   XWIN_DIR=~/.cache/xwin-splat scripts/build-windows-module-artifacts.sh [x64|arm64]
#
# Mirrors build-macos-module-artifacts.sh. Two differences that matter:
#   - a SHARED library's .dll is a RUNTIME artifact on Windows, not LIBRARY, so
#     the output dir has to be set via CMAKE_RUNTIME_OUTPUT_DIRECTORY; the
#     import .lib is steered elsewhere so it does not ship in the npm package.
#   - rayact-webview uses CEF's windowless renderer. Fetch the pinned CEF
#     distributions first with scripts/fetch-cef-windows.sh.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
XWIN_DIR="${XWIN_DIR:-$HOME/.cache/xwin-splat}"
export XWIN_DIR

if [[ ! -d "$XWIN_DIR/crt" || ! -d "$XWIN_DIR/sdk" ]]; then
  echo "error: XWIN_DIR='$XWIN_DIR' is not an xwin splat (missing crt/ or sdk/)." >&2
  echo "       run: xwin --accept-license --arch x86_64,aarch64 splat --output $XWIN_DIR" >&2
  exit 1
fi

PACKAGES=(rayact-mmkv rayact-secure-store rayact-crash-reporter rayact-svg rayact-webview)
ARCHES=(x64 arm64)
if [[ $# -gt 0 ]]; then ARCHES=("$1"); fi

for pkg in "${PACKAGES[@]}"; do
  name="${pkg#rayact-}"
  lib="rayact_${name//-/_}"
  for arch in "${ARCHES[@]}"; do
    outdir="$ROOT/packages/$pkg/desktop/windows-$arch"
    builddir="$ROOT/build/modules-windows-$arch/$pkg"
    echo "==> $pkg ($arch)"
    cmake -G Ninja -S "$ROOT/packages/$pkg/native" -B "$builddir" \
      -DCMAKE_TOOLCHAIN_FILE="$ROOT/cmake/toolchains/windows-clang-$arch.cmake" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_RUNTIME_OUTPUT_DIRECTORY="$outdir" \
      -DCMAKE_RUNTIME_OUTPUT_DIRECTORY_RELEASE="$outdir" \
      -DCMAKE_ARCHIVE_OUTPUT_DIRECTORY="$builddir/implib" \
      -DCMAKE_ARCHIVE_OUTPUT_DIRECTORY_RELEASE="$builddir/implib" > /dev/null
    cmake --build "$builddir" --parallel
    test -f "$outdir/lib$lib.dll" || { echo "error: lib$lib.dll not produced in $outdir" >&2; exit 1; }
  done
done

# Rewrites each manifest's artifacts[] from what is on disk (already knows about
# desktop/windows-{x64,arm64} and the .dll extension).
node scripts/update-module-artifact-hashes.mjs

echo
echo "Windows module DLLs:"
find packages -path "*/desktop/windows-*" -name "*.dll" | sort
