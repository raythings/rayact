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
DESKTOP_BIN="$ROOT/build/bin/rayact_desktop"
MODULES_DIR="$ROOT/build/modules"

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
  cmake -B build -S . -DENABLE_DESKTOP=ON -DCMAKE_BUILD_TYPE=Release
  cmake --build build --parallel
  cmake -B build/plugins -S native/plugins \
    -DCMAKE_LIBRARY_OUTPUT_DIRECTORY="$MODULES_DIR" -DCMAKE_BUILD_TYPE=Release
  cmake --build build/plugins --parallel

  for arch in arm64 x64; do
    pkg="$ROOT/packages/prebuilt-darwin-$arch"
    mkdir -p "$pkg/bin" "$pkg/modules"
    cp "$DESKTOP_BIN" "$pkg/bin/"
    chmod +x "$pkg/bin/rayact_desktop"
    cp "$MODULES_DIR"/librayact_*.dylib "$pkg/modules/" 2>/dev/null || true
    write_manifest "$pkg" "darwin" "$arch"
    echo "  packed prebuilt-darwin-$arch"
  done

  for plugin_pair in "mmkv:rayact_mmkv" "secure-store:rayact_secure_store"; do
    plugin="${plugin_pair%%:*}"
    lib="${plugin_pair##*:}"
    if [[ -f "$MODULES_DIR/lib${lib}.dylib" ]]; then
      mkdir -p "$ROOT/packages/rayact-${plugin}/darwin-arm64"
      cp "$MODULES_DIR/lib${lib}.dylib" "$ROOT/packages/rayact-${plugin}/darwin-arm64/"
    fi
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
