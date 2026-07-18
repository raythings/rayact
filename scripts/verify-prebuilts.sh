#!/usr/bin/env bash
# Verify prebuilt packages and dev-app release artifacts exist.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKIP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip) SKIP="$2"; shift 2 ;;
    *) shift ;;
  esac
done

should_check() {
  local name="$1"
  [[ "$SKIP" != *"$name"* ]]
}

fail=0
check_file() {
  if [[ -f "$1" ]]; then
    echo "  OK $(basename "$1") ($(wc -c < "$1" | tr -d ' ') bytes)"
  else
    echo "  MISSING $1" >&2
    fail=1
  fi
}

check_absent() {
  if compgen -G "$1" >/dev/null; then
    echo "  MISPLACED $1" >&2
    fail=1
  fi
}

echo "==> prebuilt-android-arm64"
if should_check android; then
  for lib in librayact.so libc++_shared.so; do
    check_file "$ROOT/packages/prebuilt-android-arm64/jni/arm64-v8a/$lib"
    check_file "$ROOT/packages/prebuilt-android-arm64/jni-debug/arm64-v8a/$lib"
  done
  check_absent "$ROOT/packages/prebuilt-android-*/jni/*/librayact_mmkv.so"
  check_absent "$ROOT/packages/prebuilt-android-*/jni/*/librayact_secure_store.so"
  check_absent "$ROOT/packages/prebuilt-android-*/jni-debug/*/librayact_mmkv.so"
  check_absent "$ROOT/packages/prebuilt-android-*/jni-debug/*/librayact_secure_store.so"
  check_file "$ROOT/packages/rayact-mmkv/android/arm64-v8a/librayact_mmkv.so"
  check_file "$ROOT/packages/rayact-secure-store/android/arm64-v8a/librayact_secure_store.so"
  check_file "$ROOT/packages/prebuilt-android-arm64/manifest.json"
fi

echo "==> prebuilt-linux-x64"
if should_check linux; then
  check_file "$ROOT/packages/prebuilt-linux-x64/bin/rayact_desktop"
  check_file "$ROOT/packages/prebuilt-linux-x64/manifest.json"
  check_absent "$ROOT/packages/prebuilt-linux-x64/modules/librayact_*"
fi

echo "==> prebuilt-darwin-arm64"
if should_check darwin; then
  check_file "$ROOT/packages/prebuilt-darwin-arm64/bin/rayact_desktop"
  check_file "$ROOT/packages/prebuilt-darwin-arm64/manifest.json"
  check_absent "$ROOT/packages/prebuilt-darwin-*/modules/librayact_*"
  check_file "$ROOT/packages/rayact-mmkv/darwin-arm64/librayact_mmkv.dylib"
  check_file "$ROOT/packages/rayact-secure-store/darwin-arm64/librayact_secure_store.dylib"
fi

echo "==> prebuilt-ios-arm64"
if should_check ios; then
  check_file "$ROOT/packages/prebuilt-ios-arm64/manifest.json"
fi

echo "==> dev-app dist"
if should_check dev-app; then
  check_file "$ROOT/apps/dev-app/dist/rayact-dev-app.apk"
  check_file "$ROOT/apps/dev-app/dist/rayact-dev-app-device-unsigned.ipa"
  check_file "$ROOT/apps/dev-app/dist/rayact-dev-app-simulator.zip"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "verify-prebuilts: FAILED" >&2
  exit 1
fi
echo "verify-prebuilts: PASS"
