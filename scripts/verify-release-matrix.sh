#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.rayact/verify/$(date +%Y%m%d-%H%M%S)/release-matrix"
SMOKE="$ROOT/test-projects/release-consumer-smoke"
RELEASE_SERVE_PID=""
FAILURES=0

mkdir -p "$OUT"

log() { echo "[verify-release] $*"; }
fail() { log "FAIL: $*"; FAILURES=$((FAILURES + 1)); }
pass() { log "PASS: $*"; }

cleanup() {
  if [ -n "$RELEASE_SERVE_PID" ] && kill -0 "$RELEASE_SERVE_PID" 2>/dev/null; then
    kill "$RELEASE_SERVE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "$ROOT"

log "=== package tarballs ==="
if node scripts/verify-packages.mjs >"$OUT/verify-packages.log" 2>&1; then
  pass "verify-packages"
else
  fail "verify-packages (see $OUT/verify-packages.log)"
fi

log "=== prebuilt artifacts ==="
if ./scripts/verify-prebuilts.sh --skip linux 2>"$OUT/verify-prebuilts.log" || \
   ./scripts/verify-prebuilts.sh --skip linux >"$OUT/verify-prebuilts.log" 2>&1; then
  pass "verify-prebuilts"
else
  fail "verify-prebuilts (see $OUT/verify-prebuilts.log)"
fi

log "=== web host build ==="
if bash scripts/verify-web.sh >"$OUT/verify-web.log" 2>&1; then
  pass "verify-web"
else
  fail "verify-web (see $OUT/verify-web.log)"
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  log "=== desktop release screenshot ==="
  if bash scripts/verify-desktop.sh >"$OUT/verify-desktop.log" 2>&1; then
    if [ -f "$OUT/../desktop/shot-release.png" ] 2>/dev/null || find "$ROOT/.rayact/verify" -name 'shot-release.png' -newer "$OUT/verify-desktop.log" 2>/dev/null | grep -q .; then
      pass "verify-desktop"
    else
      pass "verify-desktop (build ok, screenshot optional)"
    fi
  else
    fail "verify-desktop (see $OUT/verify-desktop.log)"
  fi
else
  log "SKIP verify-desktop (not macOS)"
fi

log "=== port fallback smoke ==="
if node scripts/smoke-port-fallback.mjs >"$OUT/port-fallback.log" 2>&1; then
  pass "port-fallback"
else
  fail "port-fallback (see $OUT/port-fallback.log)"
fi

if [ ! -f "$ROOT/release1/SHA256SUMS" ]; then
  fail "release1/SHA256SUMS missing — run npm run pack:release"
else
  pass "release1 packed"
fi

log "=== local release asset server ==="
node scripts/serve-release-assets.mjs "$ROOT/release1" 9191 v0.0.1 >"$OUT/release-serve.log" 2>&1 &
RELEASE_SERVE_PID=$!
sleep 1
if curl -sf "http://127.0.0.1:9191/v0.0.1/SHA256SUMS" >/dev/null; then
  pass "serve-release-assets"
else
  fail "serve-release-assets"
fi

log "=== release1 asset inventory ==="
for asset in rayact-0.0.1.tgz create-rayact-app-0.0.1.tgz rayact-dev-app.apk rayact-dev-app-simulator.zip rayact-prebuilt-darwin-arm64-0.0.1.tgz rayact-web-0.0.1.tar.gz; do
  if curl -sf "http://127.0.0.1:9191/v0.0.1/$asset" -o /dev/null; then
    pass "release asset $asset"
  else
    fail "release asset missing: $asset"
  fi
done

log "=== platform-neutral configs ==="
if rg -n '"platform"' rayact.config.json packages/create-rayact-app/templates test-projects/release-consumer-smoke/rayact.config.json >/dev/null; then
  fail "generated/project configs still contain platform"
else
  pass "no generated config platform"
fi

export RAYACT_PREBUILT_BASE_URL="http://127.0.0.1:9191/v0.0.1"
export RAYACT_WEB_HOST_DIR="$ROOT/build-web/bin"

log "=== consumer smoke install ==="
(
  cd "$SMOKE"
  rm -rf node_modules package-lock.json
  npm install --no-workspaces --no-audit --no-fund --ignore-scripts >"$OUT/smoke-install.log" 2>&1
) && pass "consumer npm install" || fail "consumer npm install"

log "=== CLI prebuild ==="
(
  cd "$SMOKE"
  npx rayact prebuild >"$OUT/smoke-prebuild.log" 2>&1
) && pass "rayact prebuild" || fail "rayact prebuild"

log "=== dev-client debug android build ==="
(
  cd "$SMOKE"
  npx rayact build --debug --android --out dist-android-debug-check >"$OUT/smoke-android-debug.log" 2>&1
  ls dist-android-debug-check/*.apk >/dev/null 2>&1
) && pass "android dev-client debug build" || fail "android dev-client debug build"

log "=== desktop release build ==="
(
  cd "$SMOKE"
  npx rayact build --release --desktop --out dist-desktop-check >"$OUT/smoke-desktop-build.log" 2>&1
  test -f dist-desktop-check/bundle.js
) && pass "desktop release build" || fail "desktop release build"

log "=== web release build ==="
(
  cd "$SMOKE"
  npx rayact build --web --no-bytecode --out dist-web-check >"$OUT/smoke-web-build.log" 2>&1
  test -f dist-web-check/web/rayact.html
  test -f dist-web-check/web/app.js || test -f dist-web-check/web/app.qjsbc
) && pass "web release build" || fail "web release build"

log "=== web COEP serve smoke ==="
(
  cd "$SMOKE"
  node "$ROOT/dist/cli/cli.js" serve dist-web-check/web --web-port 8771 >"$OUT/smoke-web-serve.log" 2>&1 &
  SERVE_PID=$!
  sleep 1
  HDRS=$(curl -sI "http://127.0.0.1:8771/rayact.html" || true)
  kill "$SERVE_PID" 2>/dev/null || true
  echo "$HDRS" | grep -qi "cross-origin-opener-policy: same-origin"
  echo "$HDRS" | grep -qi "cross-origin-embedder-policy: require-corp"
) && pass "web COEP headers" || fail "web COEP headers"

log "=== web COEP port fallback ==="
(
  node "$ROOT/dist/cli/cli.js" serve dist-web-check/web --web-port 8768 >"$OUT/smoke-web-serve-block.log" 2>&1 &
  BLOCK_PID=$!
  sleep 1
  node "$ROOT/dist/cli/cli.js" serve dist-web-check/web --web-port 8768 >"$OUT/smoke-web-serve-fallback.log" 2>&1 &
  FALL_PID=$!
  sleep 1
  curl -sf "http://127.0.0.1:8769/rayact.html" -o /dev/null
  kill "$BLOCK_PID" "$FALL_PID" 2>/dev/null || true
) && pass "web COEP port fallback" || fail "web COEP port fallback"

log "=== dev server manifest ==="
(
  cd "$SMOKE"
  node "$ROOT/dist/cli/cli.js" build --mode development --entry src/App.tsx --out /tmp/rayact_release_smoke_bundle >"$OUT/smoke-bundle.log" 2>&1
  test -s /tmp/rayact_release_smoke_bundle/bundle.js
) && pass "dev-server bundle" || fail "dev-server bundle"

if command -v adb >/dev/null 2>&1 && adb devices | awk 'NR>1 && $2=="device"{found=1} END{exit !found}'; then
  log "=== android release (device present) ==="
  (
    cd "$SMOKE"
    npx rayact build --release --android --out dist-android-check >"$OUT/smoke-android-build.log" 2>&1
    ls dist-android-check/*.apk >/dev/null 2>&1
  ) && pass "android release build" || fail "android release build"
else
  log "SKIP android release (no adb device)"
fi

if command -v xcodebuild >/dev/null 2>&1; then
  log "=== ios release build ==="
  (
    cd "$SMOKE"
    npx rayact build --release --ios --out dist-ios-check >"$OUT/smoke-ios-build.log" 2>&1
  ) && pass "ios release build" || fail "ios release build"
else
  log "SKIP ios release (no xcodebuild)"
fi

log "=== manual checks (not automated) ==="
log "  - rayact dev → desktop window: title single-line, icons, emoji, HMR"
log "  - rayact dev --web → browser: icons/emoji + HMR"
log "  - rayact dev-app --android / --ios-simulator → QR connect + HMR"
log "  - compare screenshots across desktop/android/ios/web (.rayact/verify/)"

if [ "$FAILURES" -gt 0 ]; then
  log "$FAILURES automated check(s) failed — artifacts in $OUT"
  exit 1
fi

log "All automated release-matrix checks passed."
log "Artifacts: $OUT"
log "Complete manual HMR/visual checks before publishing v0.0.1."
