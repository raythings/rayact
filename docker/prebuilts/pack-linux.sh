#!/usr/bin/env bash
set -euo pipefail

RAYACT_ROOT="${RAYACT_ROOT:-/workspace/rayact}"
if [[ ! -f "$RAYACT_ROOT/CMakeLists.txt" ]]; then
  RAYACT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fi

ENGINE_VERSION="${ENGINE_VERSION:-$(node -p "require('$RAYACT_ROOT/package.json').version" 2>/dev/null || echo 0.0.0)}"
ABI_VERSION="${ABI_VERSION:-1}"
BUILT_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

write_manifest() {
  local pkg_dir="$1" platform="$2" arch="$3"
  cat > "$pkg_dir/manifest.json" <<EOF
{
  "engineVersion": "$ENGINE_VERSION",
  "moduleAbiVersion": $ABI_VERSION,
  "platform": "$platform",
  "arch": "$arch",
  "builtAt": "$BUILT_AT"
}
EOF
}

DESKTOP_BIN="$RAYACT_ROOT/build-linux/bin/rayact_desktop"
LINUX_PKG="$RAYACT_ROOT/packages/prebuilt-linux-x64"

rm -rf "$LINUX_PKG/modules"
mkdir -p "$LINUX_PKG/bin"

if [[ ! -f "$DESKTOP_BIN" ]]; then
  echo "ERROR: $DESKTOP_BIN not found" >&2
  exit 1
fi

cp "$DESKTOP_BIN" "$LINUX_PKG/bin/"
chmod +x "$LINUX_PKG/bin/rayact_desktop"

write_manifest "$LINUX_PKG" "linux" "x86_64"
echo "==> Linux prebuilts packed."
