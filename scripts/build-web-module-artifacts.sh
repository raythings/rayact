#!/usr/bin/env bash
# Build every first-party web module as an Emscripten SIDE_MODULE.
#
# The peer of scripts/build-macos-module-artifacts.sh: that script produces
# packages/<pkg>/desktop/darwin-<arch>/librayact_<name>.dylib, this one produces
# packages/<pkg>/web/wasm32/rayact_<name>.wasm. Both are dlopen'd by their host at boot.
#
# Output goes to web/wasm32/, mirroring desktop/darwin-<arch>/: the platform folder
# holds the sources, an arch subfolder holds only build output — never both in one
# directory. wasm32 is web's single architecture, so there is exactly one subfolder.
#
# Sources, defines and include dirs come from the module's own rayact.module.json
# `web` block, so adding a module here means adding it to the list below and nothing
# else. Flags that must match the host are set once, in emit_flags().

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v em++ >/dev/null 2>&1; then
  echo "error: em++ not found. Activate the Emscripten SDK first (emsdk_env.sh)." >&2
  exit 1
fi

# Flags that MUST match the host build (apps/web/CMakeLists.txt) or the module will
# not link into it at dlopen:
#   -sSIDE_MODULE=1   position-independent, imports its runtime from the host
#   -fwasm-exceptions the host uses wasm EH, not the legacy JS-based scheme; mixing
#                     the two produces a module whose imports the host cannot satisfy
#   -O2               never -O0: consistent with the host, and unoptimised template
#                     instantiations balloon both the module and its import list
#   -DNDEBUG          right for a release artifact, and load-bearing: assert() pulls in
#                     __assert_fail, which the host does not export (nothing in it calls
#                     assert, so emcc drops it and cannot be made to keep it by listing
#                     it in EXPORTED_FUNCTIONS). A module importing it fails at dlopen.
COMMON_FLAGS=(-O2 -DNDEBUG -sSIDE_MODULE=1 -fwasm-exceptions)

built=()
for package_name in rayact-svg rayact-mmkv; do
  library_name="${package_name#rayact-}"
  library_name="rayact_${library_name//-/_}"
  manifest="$ROOT/packages/$package_name/rayact.module.json"
  output="$ROOT/packages/$package_name/web/wasm32/${library_name}.wasm"

  # Read the manifest via node rather than mapfile: macOS still ships bash 3.2, which
  # has no mapfile, and this script must run wherever emsdk does.
  read_manifest_list() {
    node -e '
      const m = require(process.argv[1]);
      const path = process.argv[2].split(".");
      let v = m;
      for (const k of path) v = v?.[k];
      for (const item of (v ?? [])) console.log(item);
    ' "$manifest" "$1"
  }

  sources=(); defines=(); includes=()
  while IFS= read -r line; do [[ -n "$line" ]] && sources+=("$line"); done < <(read_manifest_list web.sources)
  while IFS= read -r line; do [[ -n "$line" ]] && defines+=("$line"); done < <(read_manifest_list web.defines)
  while IFS= read -r line; do [[ -n "$line" ]] && includes+=("$line"); done < <(read_manifest_list nativeIncludeDirs)

  if [[ ${#sources[@]} -eq 0 ]]; then
    echo "skip $package_name: no web.sources"
    continue
  fi

  # RAYACT_WEB tells shared sources they are in the web module build — svg_plugin.cpp
  # uses it to yield rayact_module_register to the module's web_register.cpp.

  # "${arr[@]}" on an EMPTY array throws "unbound variable" under `set -u` on
  # bash 3.2 (still the default /bin/bash on macOS) — a module with no
  # web.defines, like mmkv, hits this. `${arr[@]+"${arr[@]}"}` is the portable
  # guard: it expands to nothing when arr is unset/empty instead of erroring.
  args=("${COMMON_FLAGS[@]}" -DRAYACT_WEB=1 -I"$ROOT/native/core")
  for d in ${defines[@]+"${defines[@]}"}; do args+=("-D$d"); done
  for d in ${includes[@]+"${includes[@]}"}; do args+=(-I"$ROOT/$d"); done
  for s in ${sources[@]+"${sources[@]}"}; do args+=("$ROOT/$s"); done

  echo "building $package_name -> ${output#"$ROOT"/}"
  mkdir -p "$(dirname "$output")"
  em++ "${args[@]}" -o "$output"
  built+=("$output")
done

# Every module must stay inside the host's export surface, or it fails at dlopen in the
# browser with a LinkError naming a mangled symbol. Check against the BUILT HOST when one
# is present, not just the declared list: the two can disagree. __assert_fail is the case
# that proved it — listing a symbol in EXPORTED_FUNCTIONS does not guarantee emcc keeps it
# if nothing in the host references it, so the declared surface said fine and the browser
# said otherwise. Fall back to the list when no host has been built yet.
surface="$ROOT/native/web/module_sdk_exports.txt"
host_wasm="$ROOT/build-web/bin/rayact_release.wasm"
[[ -f "$host_wasm" ]] || host_wasm="$ROOT/build-web/bin/rayact.wasm"

if [[ -f "$host_wasm" ]]; then
  echo "checking imports against $(basename "$host_wasm")"
  available="$(node -e '
    const fs = require("fs");
    const m = new WebAssembly.Module(fs.readFileSync(process.argv[1]));
    for (const e of WebAssembly.Module.exports(m)) console.log(e.name);
  ' "$host_wasm" | sort -u)"
else
  echo "warning: no built web host found; checking against the declared surface only" >&2
  available="$(grep -vE '^[[:space:]]*(#|$)' "$surface" | sort -u)"
fi

status=0
for artifact in ${built[@]+"${built[@]}"}; do
  missing="$(comm -23 \
    <(node "$ROOT/tools/web/module-imports.mjs" "$artifact" 2>/dev/null | sort -u) \
    <(echo "$available"))"
  if [[ -n "$missing" ]]; then
    echo "error: ${artifact#"$ROOT"/} imports symbols the host does not provide:" >&2
    echo "$missing" | sed 's/^/  /' >&2
    echo "Add them to native/web/module_sdk_exports.txt and rebuild the host; if emcc" >&2
    echo "still drops one, the module must stop importing it (see -DNDEBUG above)." >&2
    status=1
  fi
done
[[ $status -eq 0 ]] || exit $status

node "$ROOT/scripts/update-module-artifact-hashes.mjs"
echo "web module artifacts up to date"
