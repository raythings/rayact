#!/usr/bin/env bash
# Pack Android Gradle outputs into @rayact/prebuilt-* npm package layouts.
# Run inside Docker or on host after :app:assembleRelease.
set -euo pipefail

RAYACT_ROOT="${RAYACT_ROOT:-/workspace/rayact}"
if [[ ! -d "$RAYACT_ROOT/apps/android" ]]; then
  RAYACT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fi

ENGINE_VERSION="${ENGINE_VERSION:-0.1.0}"
ABI_VERSION="${ABI_VERSION:-1}"
NDK_VERSION="${NDK_VERSION:-27.2.12479018}"
BUILT_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

ANDROID_OBJ="$RAYACT_ROOT/apps/android/app/build/intermediates/cxx"

find_android_lib() {
  find "$ANDROID_OBJ" -name "$1" -type f 2>/dev/null | head -1
}

write_manifest() {
  local pkg_dir="$1" platform="$2" arch="$3"
  cat > "$pkg_dir/manifest.json" <<EOF
{
  "engineVersion": "$ENGINE_VERSION",
  "moduleAbiVersion": $ABI_VERSION,
  "ndkVersion": "$NDK_VERSION",
  "platform": "$platform",
  "arch": "$arch",
  "builtAt": "$BUILT_AT"
}
EOF
}

echo "==> Packing Android prebuilts into packages/"

ANDROID_PKG="$RAYACT_ROOT/packages/prebuilt-android-arm64/jni/arm64-v8a"
mkdir -p "$ANDROID_PKG"

missing=0
for lib in librayact.so librayact_mmkv.so librayact_secure_store.so libc++_shared.so; do
  src="$(find_android_lib "$lib")"
  if [[ -n "$src" && -f "$src" ]]; then
    cp "$src" "$ANDROID_PKG/"
    echo "  copied $lib"
  else
    echo "  ERROR: $lib not found under $ANDROID_OBJ" >&2
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

mkdir -p "$RAYACT_ROOT/packages/prebuilt-android-arm64/include"
cp "$RAYACT_ROOT/native/core/rayact_module_abi.h" "$RAYACT_ROOT/packages/prebuilt-android-arm64/include/"
cp "$RAYACT_ROOT/native/core/rayact_version.h" "$RAYACT_ROOT/packages/prebuilt-android-arm64/include/"

# Icon/emoji fonts: `rayact build --android` stages these from this prebuilt
# package into the APK's assets/runtime/resources/fonts/ (RayactBundledAssets.kt
# extracts assets/runtime/* -> filesDir at first launch). Without shipping them
# here, release APKs build with zero fonts and icons render as tofu.
mkdir -p "$RAYACT_ROOT/packages/prebuilt-android-arm64/resources/fonts"
if [[ -d "$RAYACT_ROOT/resources/fonts" ]]; then
  cp "$RAYACT_ROOT/resources/fonts/"* "$RAYACT_ROOT/packages/prebuilt-android-arm64/resources/fonts/"
  echo "  copied resources/fonts"
else
  echo "  WARNING: $RAYACT_ROOT/resources/fonts not found — prebuilt will ship without fonts" >&2
fi
write_manifest "$RAYACT_ROOT/packages/prebuilt-android-arm64" "android" "arm64-v8a"

pack_plugin() {
  local plugin="$1" lib_base="$2"
  local so="$(find_android_lib "lib${lib_base}.so")"
  mkdir -p "$RAYACT_ROOT/packages/rayact-${plugin}/android/arm64-v8a"
  cp "$so" "$RAYACT_ROOT/packages/rayact-${plugin}/android/arm64-v8a/"
  echo "  plugin $plugin -> android/arm64-v8a"
}

pack_plugin "mmkv" "rayact_mmkv"
pack_plugin "secure-store" "rayact_secure_store"

echo "==> Android prebuilts packed."
