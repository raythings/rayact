#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Inside the Docker image the repo is bind-mounted at /workspace/rayact; on the
# host (build-prebuilts.mjs's Docker-unavailable fallback) resolve it from this
# script's own location instead, so `RAYACT_ROOT` doesn't need pre-exporting.
RAYACT_ROOT="${RAYACT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
ANDROID_DIR="$RAYACT_ROOT/apps/android"

echo "==> Gradle assembleDebug + assembleRelease (WASM enabled)..."
cd "$ANDROID_DIR"
chmod +x gradlew
./gradlew :app:assembleDebug -PrayactWasm=true --no-daemon
./gradlew :app:assembleRelease -PrayactWasm=true --no-daemon

export RAYACT_ROOT
bash "$SCRIPT_DIR/pack-android.sh"
