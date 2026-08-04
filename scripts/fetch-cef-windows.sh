#!/usr/bin/env bash
# Fetch the pinned CEF minimal binary distributions used by rayact-webview.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CEF_VERSION="151.3.14+g5d67476+chromium-151.0.7922.72"
CACHE="$ROOT/.cef-cache"
BASE_URL="https://cef-builds.spotifycdn.com"

mkdir -p "$CACHE"

fetch_arch() {
  local cef_arch="$1"
  local archive="$CACHE/cef-$cef_arch.tar.bz2"
  local destination="$CACHE/$cef_arch"
  local filename="cef_binary_${CEF_VERSION}_${cef_arch}_minimal.tar.bz2"
  if [[ -f "$destination/Release/libcef.lib" ]]; then
    echo "CEF $cef_arch already present"
    return
  fi
  echo "Fetching CEF $cef_arch ($CEF_VERSION)"
  curl --fail --location --retry 3 --output "$archive" \
    "$BASE_URL/${filename//+/%2B}"
  local extract_dir
  extract_dir="$(mktemp -d "$CACHE/extract-$cef_arch.XXXXXX")"
  tar -xjf "$archive" -C "$extract_dir"
  local extracted
  extracted="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d -name 'cef_binary_*' -print -quit)"
  if [[ -z "$extracted" ]]; then
    echo "error: CEF archive did not contain its expected root directory" >&2
    exit 1
  fi
  mv "$extracted" "$destination"
  rmdir "$extract_dir"
}

if (($#)); then
  for arch in "$@"; do fetch_arch "$arch"; done
else
  fetch_arch windows64
  fetch_arch windowsarm64
fi
