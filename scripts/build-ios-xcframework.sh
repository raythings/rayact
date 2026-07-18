#!/usr/bin/env bash
# Build the real iOS engine XCFramework from apps/ios's RayactEngineStatic
# target (a static-lib twin of the RayactIOS app target, sharing the exact
# same sources/settings via a YAML anchor in project.yml) and package it into
# packages/prebuilt-ios-arm64/RayactEngine.xcframework.
#
# Ships device arm64 plus a universal arm64/x86_64 simulator slice.
#
# Uses -library + -headers (not -framework): the Swift template binds to the
# engine purely via @_silgen_name, resolved at link time — no Clang module
# import happens anywhere, so a real .framework bundle buys nothing here.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$ROOT/apps/ios"
IOS_PKG="$ROOT/packages/prebuilt-ios-arm64"
DERIVED="$IOS_DIR/.xcode-derived"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-ios-xcframework.sh requires macOS" >&2
  exit 1
fi

echo "==> Regenerating Xcode project (xcodegen)..."
(cd "$IOS_DIR" && xcodegen generate)

build_slice() {
  local destination="$1" derived_subdir="$2" extra_archs="${3:-}"
  echo "==> Building RayactEngineStatic for: $destination"
  (
    cd "$IOS_DIR"
    # shellcheck disable=SC2086
    xcodebuild build \
      -scheme RayactEngineStatic \
      -configuration Release \
      -destination "$destination" \
      -derivedDataPath "$DERIVED/$derived_subdir" \
      CODE_SIGNING_ALLOWED=NO \
      ONLY_ACTIVE_ARCH=NO \
      $extra_archs
  )
}

build_slice "generic/platform=iOS" "engine-device"
build_slice "generic/platform=iOS Simulator" "engine-simulator-arm64" "ARCHS=arm64"
build_slice "generic/platform=iOS Simulator" "engine-simulator-x64" "ARCHS=x86_64"

find_lib() {
  find "$DERIVED/$1" -name 'libRayactEngine.a' -type f 2>/dev/null | head -1
}

DEVICE_LIB="$(find_lib engine-device)"
SIM_ARM64_LIB="$(find_lib engine-simulator-arm64)"
SIM_X64_LIB="$(find_lib engine-simulator-x64)"
SIM_LIB="$DERIVED/libRayactEngine-simulator.a"

if [[ -z "$DEVICE_LIB" || ! -f "$DEVICE_LIB" ]]; then
  echo "ERROR: device libRayactEngine.a not found under $DERIVED/engine-device" >&2
  exit 1
fi
if [[ -z "$SIM_ARM64_LIB" || ! -f "$SIM_ARM64_LIB" || -z "$SIM_X64_LIB" || ! -f "$SIM_X64_LIB" ]]; then
  echo "ERROR: simulator libraries not found" >&2
  exit 1
fi
xcrun lipo -create "$SIM_ARM64_LIB" "$SIM_X64_LIB" -output "$SIM_LIB"

echo "  device slice:    $DEVICE_LIB"
echo "  simulator slice: $SIM_LIB"

# Public C ABI headers — confirmed self-contained (only <cstdint>), no
# transitive includes of quickjs.h/engine.hpp/etc. Nested under RayactEngine/
# so a future native-plugin consumer gets a clean #include <RayactEngine/...>.
HEADERS_STAGE="$(mktemp -d)/RayactEngine"
mkdir -p "$HEADERS_STAGE"
cp "$ROOT/native/ios/ios_bridge.hpp" "$HEADERS_STAGE/"
cp "$ROOT/native/ios/ios_host_callbacks.hpp" "$HEADERS_STAGE/"
HEADERS_ROOT="$(dirname "$HEADERS_STAGE")"

echo "==> Assembling XCFramework..."
rm -rf "$IOS_PKG/RayactEngine.xcframework"
mkdir -p "$IOS_PKG"
xcodebuild -create-xcframework \
  -library "$DEVICE_LIB" -headers "$HEADERS_ROOT" \
  -library "$SIM_LIB" -headers "$HEADERS_ROOT" \
  -output "$IOS_PKG/RayactEngine.xcframework"

rm -rf "$HEADERS_ROOT"

echo "==> Verifying symbols..."
for lib in "$DEVICE_LIB" "$SIM_LIB"; do
  count="$(nm -gU "$lib" 2>/dev/null | grep -c RayactIOSSession || true)"
  echo "  $lib: $count RayactIOSSession* symbol(s)"
  if [[ "$count" -eq 0 ]]; then
    echo "ERROR: no RayactIOSSession* symbols found in $lib" >&2
    exit 1
  fi
  if nm -g "$lib" 2>/dev/null | grep -E '[[:space:]][TDSB][[:space:]]+_?rayact_(mmkv|secure_store|crash_reporter)_register$' >/dev/null; then
    echo "ERROR: optional module registration was compiled into generic engine: $lib" >&2
    exit 1
  fi
done

echo "==> iOS XCFramework built: $IOS_PKG/RayactEngine.xcframework"
