#!/usr/bin/env bash
# Pack Android Gradle outputs into @rayact/prebuilt-* npm package layouts.
# Run inside Docker or on host after :app:assembleRelease.
set -euo pipefail

RAYACT_ROOT="${RAYACT_ROOT:-/workspace/rayact}"
if [[ ! -d "$RAYACT_ROOT/apps/android" ]]; then
  RAYACT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fi

ENGINE_VERSION="${ENGINE_VERSION:-0.0.3}"
ABI_VERSION="${ABI_VERSION:-1}"
NDK_VERSION="${NDK_VERSION:-27.3.13750724}"
BUILT_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

ANDROID_MERGED="$RAYACT_ROOT/apps/android/app/build/intermediates/merged_native_libs"

find_android_lib() {
  local variant="$1" abi="$2" library="$3"
  local variant_lower
  variant_lower="$(printf '%s' "$variant" | tr '[:upper:]' '[:lower:]')"
  find "$ANDROID_MERGED/$variant_lower" -path "*/$abi/*" -name "$library" -type f 2>/dev/null | head -1
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

missing=0
for abi in arm64-v8a x86_64; do
  package_arch="arm64"
  [[ "$abi" == "x86_64" ]] && package_arch="x64"
  for variant in Debug Release; do
    package_variant="jni"
    [[ "$variant" == "Debug" ]] && package_variant="jni-debug"
    android_pkg="$RAYACT_ROOT/packages/prebuilt-android-${package_arch}/$package_variant/$abi"
    mkdir -p "$android_pkg"
    rm -f "$android_pkg"/librayact_mmkv.so \
      "$android_pkg"/librayact_secure_store.so \
      "$android_pkg"/librayact_crash_reporter.so
    for lib in librayact.so libc++_shared.so; do
      src="$(find_android_lib "$variant" "$abi" "$lib")"
      if [[ -n "$src" && -f "$src" ]]; then
        cp "$src" "$android_pkg/"
        echo "  $variant $abi engine -> $package_variant/$abi/$lib"
      else
        echo "  ERROR: $variant/$abi/$lib not found under $ANDROID_MERGED" >&2
        missing=1
      fi
    done
  done
done

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

for package_arch in arm64 x64; do
  mkdir -p "$RAYACT_ROOT/packages/prebuilt-android-${package_arch}/include"
  cp "$RAYACT_ROOT/native/core/rayact_module_abi.h" "$RAYACT_ROOT/packages/prebuilt-android-${package_arch}/include/"
  cp "$RAYACT_ROOT/native/core/rayact_version.h" "$RAYACT_ROOT/packages/prebuilt-android-${package_arch}/include/"
done

# Icon/emoji fonts: `rayact build --android` stages these from this prebuilt
# package into the APK's assets/runtime/resources/fonts/ (RayactBundledAssets.kt
# extracts assets/runtime/* -> filesDir at first launch). Without shipping them
# here, release APKs build with zero fonts and icons render as tofu.
mkdir -p "$RAYACT_ROOT/packages/prebuilt-android-arm64/resources/fonts" "$RAYACT_ROOT/packages/prebuilt-android-x64/resources/fonts"
if [[ -d "$RAYACT_ROOT/resources/fonts" ]]; then
  cp "$RAYACT_ROOT/resources/fonts/"* "$RAYACT_ROOT/packages/prebuilt-android-arm64/resources/fonts/"
  cp "$RAYACT_ROOT/resources/fonts/"* "$RAYACT_ROOT/packages/prebuilt-android-x64/resources/fonts/"
  echo "  copied resources/fonts"
else
  echo "  WARNING: $RAYACT_ROOT/resources/fonts not found — prebuilt will ship without fonts" >&2
fi
write_manifest "$RAYACT_ROOT/packages/prebuilt-android-arm64" "android" "arm64-v8a"
write_manifest "$RAYACT_ROOT/packages/prebuilt-android-x64" "android" "x86_64"

pack_plugin() {
  local plugin="$1" lib_base="$2"
  for abi in arm64-v8a x86_64; do
    # Optional module binaries are configuration-independent and contain no
    # launcher/dev-server implementation. Pack the Release build deterministically.
    local so="$(find_android_lib "Release" "$abi" "lib${lib_base}.so")"
    mkdir -p "$RAYACT_ROOT/packages/rayact-${plugin}/android/$abi"
    cp "$so" "$RAYACT_ROOT/packages/rayact-${plugin}/android/$abi/"
    echo "  plugin $plugin -> android/$abi"
  done
}

pack_plugin "mmkv" "rayact_mmkv"
pack_plugin "secure-store" "rayact_secure_store"
pack_plugin "crash-reporter" "rayact_crash_reporter"
node "$RAYACT_ROOT/scripts/update-module-artifact-hashes.mjs"

echo "==> Android prebuilts packed."
