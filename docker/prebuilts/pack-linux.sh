#!/usr/bin/env bash
set -euo pipefail

RAYACT_ROOT="${RAYACT_ROOT:-/workspace/rayact}"
if [[ ! -f "$RAYACT_ROOT/CMakeLists.txt" ]]; then
  RAYACT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fi

ENGINE_VERSION="${ENGINE_VERSION:-$(node -p "require('$RAYACT_ROOT/package.json').version" 2>/dev/null || echo 0.0.0)}"
# Module ABI is defined by the native header — never hardcode it here, or the
# manifests will disagree with the CLI (checkPrebuiltAbi) after an ABI bump.
ABI_VERSION="${ABI_VERSION:-$(sed -n 's/^#define RAYACT_MODULE_ABI_VERSION \([0-9]*\)u*$/\1/p' "$RAYACT_ROOT/native/core/rayact_module_abi.h")}"
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

# Headless build toolchain (bytecode compile + rayactpack) — ships next to the
# host so consumer builds never need the GUI binary.
TOOL_BIN="$RAYACT_ROOT/build-linux/bin/rayact_tool"
if [[ ! -f "$TOOL_BIN" ]]; then
  echo "ERROR: $TOOL_BIN not found (build the rayact_tool target)" >&2
  exit 1
fi
cp "$TOOL_BIN" "$LINUX_PKG/bin/"
chmod +x "$LINUX_PKG/bin/rayact_tool"

write_manifest "$LINUX_PKG" "linux" "x86_64"
echo "==> Linux prebuilts packed."
