#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/ios-modules"
IOS_SDK="$(xcrun --sdk iphoneos --show-sdk-path)"
SIM_SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
rm -rf "$OUT"
mkdir -p "$OUT"

compile_module() {
  local package_name="$1" library_name="$2"
  shift 2
  local sources=("$@")
  local package_dir="$ROOT/packages/$package_name"
  local module_out="$OUT/$package_name"
  mkdir -p "$module_out/device" "$module_out/sim-arm64" "$module_out/sim-x64" "$module_out/headers/RayactModule"
  cp "$ROOT/native/core/rayact_module_abi.h" "$module_out/headers/RayactModule/"

  for target in device sim-arm64 sim-x64; do
    local sdk="$IOS_SDK" arch="arm64" min_flag="-miphoneos-version-min=16.0"
    [[ "$target" == sim-* ]] && sdk="$SIM_SDK" && min_flag="-mios-simulator-version-min=16.0"
    [[ "$target" == "sim-x64" ]] && arch="x86_64"
    local objects=()
    local index=0
    for source in "${sources[@]}"; do
      local object="$module_out/$target/$index.o"
      xcrun clang++ -isysroot "$sdk" -arch "$arch" "$min_flag" -std=c++17 -O2 \
        -DRAYACT_IOS=1 -I "$ROOT/native/core" -I "$package_dir/native" \
        -c "$package_dir/native/$source" -o "$object"
      objects+=("$object")
      index=$((index + 1))
    done
    xcrun libtool -static -o "$module_out/$target/lib${library_name}.a" "${objects[@]}"
  done

  xcrun lipo -create \
    "$module_out/sim-arm64/lib${library_name}.a" \
    "$module_out/sim-x64/lib${library_name}.a" \
    -output "$module_out/lib${library_name}-simulator.a"
  local destination="$package_dir/ios/${library_name}.xcframework"
  rm -rf "$destination"
  mkdir -p "$package_dir/ios"
  xcodebuild -create-xcframework \
    -library "$module_out/device/lib${library_name}.a" -headers "$module_out/headers" \
    -library "$module_out/lib${library_name}-simulator.a" -headers "$module_out/headers" \
    -output "$destination"
}

compile_module rayact-mmkv rayact_mmkv mmkv_plugin.cpp
compile_module rayact-secure-store rayact_secure_store secure_store_plugin.cpp secure_store_mac.mm
compile_module rayact-crash-reporter rayact_crash_reporter crash_reporter_plugin.cpp
node "$ROOT/scripts/update-module-artifact-hashes.mjs"
