#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for package_name in rayact-mmkv rayact-secure-store rayact-crash-reporter; do
  library_name="${package_name#rayact-}"
  library_name="rayact_${library_name//-/_}"
  for arch in arm64 x86_64; do
    package_arch="$arch"
    [[ "$arch" == "x86_64" ]] && package_arch="x64"
    build_dir="$ROOT/build/modules-$package_arch/$package_name"
    output_dir="$ROOT/packages/$package_name/darwin-$package_arch"
    cmake -S "$ROOT/packages/$package_name/native" -B "$build_dir" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_OSX_ARCHITECTURES="$arch" \
      -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0 \
      -DCMAKE_LIBRARY_OUTPUT_DIRECTORY="$output_dir"
    cmake --build "$build_dir" --parallel
  done
done
node "$ROOT/scripts/update-module-artifact-hashes.mjs"
