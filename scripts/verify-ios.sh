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
(cd "$IOS_DIR" && xcodebuild -scheme RayactIOS -configuration Debug \
  -destination 'platform=iOS Simulator,id=00EF0C9C-9681-4B4C-8BA7-3B1BDA965F27' build) 2>"$OUT/xcodebuild.log"

echo "PASS" | tee "$OUT/status.txt"
echo "[verify-ios] artifacts: $OUT"
