#!/bin/bash
# Usage: ./run-android.sh [file.tsx|file.ts|file.jsx|file.js]
# Bundles a desktop JS file via the rayact dev-server, copies the bundle into
# apps/android/app/src/main/assets/app.js, rebuilds the APK, installs on the
# connected device, and launches the app.
#
# Default entry is apps/desktop/hello.tsx — same as run.sh on desktop.
set -e

FILE="${1:-apps/desktop/hello.tsx}"
BUNDLE_DIR="/tmp/rayact_android_bundle"
ASSETS_DIR="apps/android/app/src/main/assets"
APK="apps/android/app/build/outputs/apk/debug/app-debug.apk"

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  echo "Usage: $0 [file.tsx|file.ts|file.jsx|file.js]" >&2
  exit 1
fi

echo "[1/4] Bundling $FILE ..."
node packages/rayact-dev-server/dist/cli.js build --mode release \
  --entry "$FILE" --out "$BUNDLE_DIR" | tail -3

echo "[2/4] Copying bundle -> $ASSETS_DIR/app.js"
mkdir -p "$ASSETS_DIR"
cp "$BUNDLE_DIR/bundle.js" "$ASSETS_DIR/app.js"

echo "[3/4] Building Android APK (debug) ..."
(cd apps/android && ./gradlew :app:assembleDebug -q)

echo "[4/4] Installing + launching on device ..."
adb install -r "$APK" | tail -1
adb shell am force-stop com.rayact.app

# Push icon fonts to the app's private files directory so the C++ layer can
# load them via LoadFontEx (CWD is set to filesDir at engine startup).
# Uses run-as (debug APK only) — silently skipped if unavailable.
echo "  Pushing icon fonts to device..."
APP_PKG="com.rayact.app"
TMP="/data/local/tmp/rayact_font_tmp"
adb shell mkdir "$TMP" 2>/dev/null || true
adb push resources/fonts/MaterialIcons-Regular.ttf "$TMP/MaterialIcons-Regular.ttf" 2>/dev/null || true
adb push resources/fonts/MaterialSymbolsRounded-Filled.ttf "$TMP/MaterialSymbolsRounded-Filled.ttf" 2>/dev/null || true
adb push resources/fonts/MaterialSymbolsRounded.ttf "$TMP/MaterialSymbolsRounded.ttf" 2>/dev/null || true
adb push resources/fonts/NotoColorEmoji.ttf "$TMP/NotoColorEmoji.ttf" 2>/dev/null || true
# mkdir -p not available on Android busybox — create each level separately
adb shell run-as "$APP_PKG" mkdir files 2>/dev/null || true
adb shell run-as "$APP_PKG" mkdir files/resources 2>/dev/null || true
adb shell run-as "$APP_PKG" mkdir files/resources/fonts 2>/dev/null || true
adb shell run-as "$APP_PKG" cp "$TMP/MaterialIcons-Regular.ttf" files/resources/fonts/MaterialIcons-Regular.ttf 2>/dev/null || true
adb shell run-as "$APP_PKG" cp "$TMP/MaterialSymbolsRounded-Filled.ttf" files/resources/fonts/MaterialSymbolsRounded-Filled.ttf 2>/dev/null || true
adb shell run-as "$APP_PKG" cp "$TMP/MaterialSymbolsRounded.ttf" files/resources/fonts/MaterialSymbolsRounded.ttf 2>/dev/null || true
adb shell run-as "$APP_PKG" cp "$TMP/NotoColorEmoji.ttf" files/resources/fonts/NotoColorEmoji.ttf 2>/dev/null || true

adb shell am start -n com.rayact.app/.MainActivity | tail -1
echo "Done. adb logcat -s raylib:I RayactJNI:I JS: to follow the run."
