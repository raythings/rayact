#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.rayact/verify/$(date +%Y%m%d-%H%M%S)/ios"
mkdir -p "$OUT"

cd "$ROOT"

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

echo "PASS" | tee "$OUT/status.txt"
echo "[verify-ios] artifacts: $OUT"
