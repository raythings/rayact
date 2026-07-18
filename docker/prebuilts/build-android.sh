#!/usr/bin/env bash
set -euo pipefail

RAYACT_ROOT="${RAYACT_ROOT:-/workspace/rayact}"
ANDROID_DIR="$RAYACT_ROOT/apps/android"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Gradle assembleDebug + assembleRelease (WASM enabled)..."
cd "$ANDROID_DIR"
chmod +x gradlew
./gradlew :app:assembleDebug -PrayactWasm=true --no-daemon
./gradlew :app:assembleRelease -PrayactWasm=true --no-daemon

export RAYACT_ROOT
bash "$SCRIPT_DIR/pack-android.sh"
