#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=verify-common.sh
source "$ROOT/scripts/verify-common.sh"
OUT="$ROOT/.rayact/verify/$(date +%Y%m%d-%H%M%S)/ios"
mkdir -p "$OUT"

cd "$ROOT"

echo "[verify-ios] building dev-server + release bundle..."
npm run build:dev-server >/dev/null 2>&1 || npm run build:dev-server
node packages/rayact-dev-server/dist/cli.js build --mode release --entry "$VERIFY_APP_ENTRY" --out /tmp/rayact_verify_bundle 2>"$OUT/build.log"
mkdir -p apps/android/app/src/main/assets
cp /tmp/rayact_verify_bundle/bundle.qjsbc apps/android/app/src/main/assets/app.qjsbc
cp /tmp/rayact_verify_bundle/bundle.js apps/android/app/src/main/assets/app.js

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "SKIP: xcodebuild not found" | tee "$OUT/status.txt"
  exit 0
fi

IOS_DIR="$ROOT/apps/ios"
if [ ! -f "$IOS_DIR/project.yml" ]; then
  echo "SKIP: iOS project not found" | tee "$OUT/status.txt"
  exit 0
fi

echo "[verify-ios] xcodegen + build..."
(cd "$IOS_DIR" && xcodegen generate) 2>"$OUT/xcodegen.log"

# Prefer the already-booted simulator; don't hardcode a device UDID (stale across
# machines/Xcode versions). Fall back to a recent default name for CI/headless.
IOS_DEST="generic/platform=iOS Simulator"
BOOTED_UDID="$(xcrun simctl list devices booted 2>/dev/null | awk -F'[()]' '/Booted/ {print $2; exit}')"
if [ -n "${BOOTED_UDID:-}" ]; then
  IOS_DEST="platform=iOS Simulator,id=${BOOTED_UDID}"
  echo "[verify-ios] using booted simulator: ${BOOTED_UDID}"
else
  echo "[verify-ios] no booted simulator; using ${IOS_DEST}"
fi

(cd "$IOS_DIR" && xcodebuild -scheme RayactIOS -configuration Debug \
  -destination "$IOS_DEST" build) 2>"$OUT/xcodebuild.log"

if [ -n "${BOOTED_UDID:-}" ]; then
  APP="$(find "$IOS_DIR/.xcode-derived" "$HOME/Library/Developer/Xcode/DerivedData" \
    -name 'Rayact.app' -path '*/Debug-iphonesimulator/*' -type d -print0 2>/dev/null \
    | xargs -0 ls -td 2>/dev/null | head -1)"
  if [ -n "$APP" ] && [ -d "$APP" ]; then
    echo "[verify-ios] install + screenshot on booted simulator..."
    xcrun simctl terminate "$BOOTED_UDID" com.rayact.ios 2>/dev/null || true
    xcrun simctl spawn "$BOOTED_UDID" defaults delete com.rayact.ios RAYACT_DEV_SERVER 2>/dev/null || true
    xcrun simctl install "$BOOTED_UDID" "$APP" 2>"$OUT/install.log"
    xcrun simctl launch "$BOOTED_UDID" com.rayact.ios 2>"$OUT/launch.log" || true
    sleep 4
    xcrun simctl io "$BOOTED_UDID" screenshot "$OUT/shot-launch.png" 2>"$OUT/screenshot.log" || true
  fi
fi

echo "PASS" | tee "$OUT/status.txt"
echo "[verify-ios] artifacts: $OUT"
