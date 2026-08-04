#!/usr/bin/env bash
# Rebuild resources/fonts/NotoColorEmoji-Flags.ttf from the full Noto CBDT font.
# Requires fonttools (pyftsubset).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/resources/fonts/NotoColorEmoji.ttf"
OUT="$ROOT/resources/fonts/NotoColorEmoji-Flags.ttf"
if [[ ! -f "$SRC" ]]; then
  echo "missing $SRC" >&2
  exit 1
fi
pyftsubset "$SRC" \
  --unicodes="U+1F1E6-1F1FF" \
  --layout-features='*' \
  --output-file="$OUT"
ls -lh "$OUT"
