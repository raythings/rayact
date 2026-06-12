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

# Push CSS files referenced by the bundle. importCSS() in the C++ layer reads
# them from the filesystem at runtime (CWD is filesDir), so each file the
# bundle names must exist on-device at the same relative path.
echo "  Pushing bundle CSS files to device..."
# for-loop, not while-read: adb inside the loop would consume the piped stdin
for CSS_PATH in $(grep -o 'importCSS("[^"]*")' "$ASSETS_DIR/app.js" | sed 's/importCSS("\.\///;s/")//' | sort -u); do
  if [[ ! -f "$CSS_PATH" ]]; then
    echo "  warning: bundle references missing CSS file: $CSS_PATH" >&2
    continue
  fi
  CSS_TMP="$TMP/$(echo "$CSS_PATH" | tr '/' '_')"
  adb push "$CSS_PATH" "$CSS_TMP" 2>/dev/null || true
  # mkdir -p not available via run-as — create each path level separately
  DIR_ACC="files"
  IFS='/' read -ra DIR_SEGS <<< "$(dirname "$CSS_PATH")"
  for SEG in "${DIR_SEGS[@]}"; do
    DIR_ACC="$DIR_ACC/$SEG"
    adb shell run-as "$APP_PKG" mkdir "$DIR_ACC" 2>/dev/null || true
  done
  adb shell run-as "$APP_PKG" cp "$CSS_TMP" "files/$CSS_PATH" 2>/dev/null || true
done

if [[ -d "$BUNDLE_DIR/assets" ]]; then
  echo "  Pushing bundle assets to device..."
  adb shell run-as "$APP_PKG" mkdir files/assets 2>/dev/null || true
  adb shell run-as "$APP_PKG" mkdir files/assets/assets 2>/dev/null || true
  for ASSET_PATH in "$BUNDLE_DIR"/assets/*; do
    [[ -f "$ASSET_PATH" ]] || continue
    ASSET_NAME="$(basename "$ASSET_PATH")"
    ASSET_TMP="$TMP/$ASSET_NAME"
    adb push "$ASSET_PATH" "$ASSET_TMP" 2>/dev/null || true
    adb shell run-as "$APP_PKG" cp "$ASSET_TMP" "files/assets/$ASSET_NAME" 2>/dev/null || true
    adb shell run-as "$APP_PKG" cp "$ASSET_TMP" "files/assets/assets/$ASSET_NAME" 2>/dev/null || true
  done
fi

adb shell am start -n com.rayact.app/.MainActivity | tail -1
echo "Done. adb logcat -s raylib:I RayactJNI:I JS: to follow the run."
