#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=verify-common.sh
source "$ROOT/scripts/verify-common.sh"
OUT="$ROOT/.rayact/verify/$(date +%Y%m%d-%H%M%S)/android"
mkdir -p "$OUT"

cd "$ROOT"

if ! command -v adb >/dev/null 2>&1; then
  echo "SKIP: adb not found" | tee "$OUT/status.txt"
  exit 0
fi

if ! adb devices | awk 'NR>1 && $2=="device"{found=1} END{exit !found}'; then
  echo "SKIP: no adb device" | tee "$OUT/status.txt"
  exit 0
fi

echo "[verify-android] building dev-server + release bundle..."
npm run build >/dev/null 2>&1 || npm run build
node dist/cli/cli.js build --mode release --entry "$VERIFY_APP_ENTRY" --out /tmp/rayact_verify_bundle 2>"$OUT/build.log"

mkdir -p apps/android/app/src/main/assets
cp /tmp/rayact_verify_bundle/bundle.qjsbc apps/android/app/src/main/assets/app.qjsbc
cp /tmp/rayact_verify_bundle/bundle.js apps/android/app/src/main/assets/app.js

echo "[verify-android] gradle assembleDebug..."
(cd apps/android && ./gradlew :app:assembleDebug -q) 2>"$OUT/gradle.log"

APK="apps/android/app/build/outputs/apk/debug/app-debug.apk"
adb install -r "$APK" | tail -1 | tee "$OUT/install.log"

adb logcat -c
adb shell am force-stop com.rayact.app
adb shell am start -n com.rayact.app/.DevLauncherActivity | tee "$OUT/launch.log"
sleep 4

adb logcat -d -s raylib:I RayactJNI:I JS:I AndroidRuntime:E >"$OUT/logcat.txt"

if grep -E "FATAL EXCEPTION|JavaScript error|Bytecode load error|Rayact dev client failed" "$OUT/logcat.txt"; then
  echo "FAIL: errors in logcat" | tee "$OUT/status.txt"
  exit 1
fi

adb exec-out screencap -p >"$OUT/shot-launch.png"
echo "PASS" | tee "$OUT/status.txt"
echo "[verify-android] artifacts: $OUT"
