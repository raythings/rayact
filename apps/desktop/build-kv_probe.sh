#!/bin/bash
# Rebuild kv_probe.wasm from kv_probe.c. Needs an LLVM clang with the wasm32
# target + wasm-ld (e.g. `brew install llvm`).
set -e
cd "$(dirname "$0")"
CLANG="${CLANG:-/opt/homebrew/opt/llvm/bin/clang}"
"$CLANG" --target=wasm32 -O2 -nostdlib \
  -Wl,--no-entry -Wl,--allow-undefined -Wl,--export=_start \
  -o kv_probe.wasm kv_probe.c
echo "built kv_probe.wasm"
