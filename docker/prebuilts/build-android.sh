#!/usr/bin/env bash
set -euo pipefail

RAYACT_ROOT="${RAYACT_ROOT:-/workspace/rayact}"
ANDROID_DIR="$RAYACT_ROOT/apps/android"

echo "==> Gradle assembleRelease (WASM enabled)..."
cd "$ANDROID_DIR"
chmod +x gradlew
./gradlew :app:assembleRelease -PrayactWasm=true --no-daemon

export RAYACT_ROOT
bash "$(dirname "$0")/pack-android.sh"
