#!/usr/bin/env bash
# Maintainer-only macOS builds: darwin prebuilts, iOS XCFramework placeholder, dev-app.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-prebuilts-macos.sh requires macOS" >&2
  exit 1
fi

ENGINE_VERSION="${ENGINE_VERSION:-$(node -p "require('./package.json').version")}"
ABI_VERSION="${ABI_VERSION:-1}"
BUILT_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DO_DARWIN=0
DO_IOS=0
DO_DEV_APP=0

for arg in "$@"; do
  case "$arg" in
    --darwin) DO_DARWIN=1 ;;
    --ios) DO_IOS=1 ;;
    --dev-app) DO_DEV_APP=1 ;;
  esac
done

if [[ $# -eq 0 ]]; then
  DO_DARWIN=1
  DO_IOS=1
  DO_DEV_APP=1
fi

write_manifest() {
  local pkg_dir="$1" platform="$2" arch="$3"
  cat > "$pkg_dir/manifest.json" <<EOF
{
  "engineVersion": "$ENGINE_VERSION",
  "moduleAbiVersion": $ABI_VERSION,
  "platform": "$platform",
  "arch": "$arch",
  "builtAt": "$BUILT_AT"
}
EOF
}

if [[ "$DO_DARWIN" -eq 1 ]]; then
  echo "==> Building macOS desktop prebuilts..."
  "$ROOT/scripts/build-macos-module-artifacts.sh"

  # macOS support is Apple Silicon only. Android and iOS simulator x86_64
  # artifacts remain independent and are not affected by this policy.
  for arch in arm64; do
    cmake_arch="$arch"
    [[ "$arch" == "x64" ]] && cmake_arch="x86_64"
    quickjs_dir="$ROOT/build/quickjs-$arch"
    build_dir="$ROOT/build/darwin-$arch"
    release_dir="$ROOT/build/darwin-$arch-release"
    cmake -B "$quickjs_dir" -S "$ROOT/third_party/quickjs" -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_OSX_ARCHITECTURES="$cmake_arch" -DQJS_BUILD_EXAMPLES=OFF -DQJS_BUILD_LIBC=ON
    cmake --build "$quickjs_dir" --target qjs --parallel
    cmake -B "$build_dir" -S . -DENABLE_DESKTOP=ON -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_OSX_ARCHITECTURES="$cmake_arch" -DQUICKJS_BUILD_DIR="$quickjs_dir"
    cmake --build "$build_dir" --target rayact_desktop --parallel
    cmake -B "$release_dir" -S . -DENABLE_DESKTOP=ON -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_OSX_ARCHITECTURES="$cmake_arch" \
      -DQUICKJS_BUILD_DIR="$quickjs_dir" \
      -DRAYACT_RELEASE_HOST=ON -DRAYACT_ENABLE_DEVTOOLS=OFF
    cmake --build "$release_dir" --target rayact_desktop --parallel
    pkg="$ROOT/packages/prebuilt-darwin-$arch"
    rm -rf "$pkg/modules"
    mkdir -p "$pkg/bin"
    cp "$build_dir/bin/rayact_desktop" "$pkg/bin/"
    cp "$release_dir/bin/rayact_desktop" "$pkg/bin/rayact_release"
    chmod +x "$pkg/bin/rayact_desktop"
    chmod +x "$pkg/bin/rayact_release"
    write_manifest "$pkg" "darwin" "$arch"
    echo "  packed prebuilt-darwin-$arch"
  done
fi

if [[ "$DO_DEV_APP" -eq 1 ]]; then
  node "$ROOT/scripts/build-dev-app.mjs" --all
fi

if [[ "$DO_IOS" -eq 1 ]]; then
  echo "==> iOS prebuilt-ios-arm64 (real XCFramework)..."
  IOS_PKG="$ROOT/packages/prebuilt-ios-arm64"
  mkdir -p "$IOS_PKG"

  "$ROOT/scripts/build-ios-xcframework.sh"
  "$ROOT/scripts/build-ios-module-xcframeworks.sh"
  write_manifest "$IOS_PKG" "ios" "arm64"

  # Icon/emoji fonts: `rayact build --ios` stages these from this prebuilt
  # package into the app bundle's resources/fonts/ (IOSBundledAssets.swift
  # extracts runtime/* -> Documents at launch). Without shipping them here,
  # release builds ship with zero fonts and icons render as tofu. Independent
  # of the xcframework placeholder above — ship regardless of its state.
  mkdir -p "$IOS_PKG/resources/fonts"
  if [[ -d "$ROOT/resources/fonts" ]]; then
    cp "$ROOT/resources/fonts/"* "$IOS_PKG/resources/fonts/"
    echo "  copied resources/fonts"
  else
    echo "  WARNING: $ROOT/resources/fonts not found — prebuilt will ship without fonts"
  fi
fi

echo "==> macOS prebuilt steps complete."
