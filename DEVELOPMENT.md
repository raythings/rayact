# Development Setup Guide

Building the Rayact **framework** from source (contributors/maintainers).
Consumers never need any of this — apps use prebuilt hosts
([docs/guide/install.md](docs/guide/install.md)).

## Prerequisites

- Node **>= 22** (tested through 24; newer majors warn but work)
- CMake 3.20+, a C++17 compiler
- macOS: Xcode + `brew install xcodegen pkg-config curl libwebsockets openssl`
- Android: SDK + NDK r27, JDK 17 (or use the Docker path below)
- Web: Emscripten 4.x (`brew install emscripten`)

## Clone

```bash
git clone --recursive https://github.com/raythings/rayact
cd rayact && nvm use 24 && npm ci && npm run build
```

Native dependencies are submodules under `third_party/` (quickjs, raylib,
raylib-backends, raym3, raysvg, rlvk, wasm3, cssparser, yoga, …). A plain
`--recursive` clone gets everything.

## Desktop host

```bash
# One-time: build QuickJS static lib
cmake -B build/quickjs-arm64 -S third_party/quickjs -DCMAKE_BUILD_TYPE=Release -DQJS_BUILD_LIBC=ON
cmake --build build/quickjs-arm64 --target qjs --parallel

# Engine: rayact_desktop (GUI runtime) + rayact_tool (headless build toolchain)
cmake -B build -S . -DENABLE_DESKTOP=ON -DCMAKE_BUILD_TYPE=Release \
  -DQUICKJS_BUILD_DIR=$PWD/build/quickjs-arm64
cmake --build build --target rayact_desktop rayact_tool --parallel
```

Outputs land in `build/bin/`; the CLI's source-tree resolution finds them
automatically when you run a test project inside the repo.

## Other hosts

| Target | Command |
| --- | --- |
| All macOS prebuilts + iOS xcframework + dev apps | `scripts/build-prebuilts-macos.sh` (or `node scripts/build-prebuilts.mjs --target darwin\|ios\|dev-app`) |
| Android (reproducible) | `node scripts/build-prebuilts.mjs --target android` (Docker) |
| Linux (reproducible) | `node scripts/build-prebuilts.mjs --target linux` (Docker) |
| Web dev host | `emcmake cmake -S . -B build-web -DENABLE_DESKTOP=OFF -DENABLE_WEB=ON && cmake --build build-web --target rayact` |
| Web release host | `sh scripts/build-web-release-host.sh` |
| Web pthreads host (WASM workers) | same as dev host + `-DRAYACT_WEB_PTHREADS=ON` into `build-web-pthreads` |

Engine-building app shells live in `apps/android` and `apps/ios` (these compile
the C++ from source); consumer projects instead link prebuilts through
`packages/template-android` / `template-ios`.

## Day-to-day loop

```bash
npm run dev            # dev server against test-projects/release-consumer-smoke
npm run desktop        # + native window
npm test               # node --test unit suites
npm run test:packages  # workspace pack/verify gate
npm run test:native    # desktop smoke test
```

## Release (maintainers)

```bash
node scripts/bump-version.mjs <version> && node scripts/bump-version.mjs --check
export RAYACT_RELEASE_PRIVATE_KEY="$(cat ~/.rayact-release/rayact-release-key.pem)"
npm run release:prepare
RAYACT_CONFIRM_PUBLISH_RELEASE=v<version> npm run release:publish
```

The prepare command builds and tests every platform locally. The GitHub workflow
only verifies and attests the uploaded release assets. npm publication remains
dormant unless `RAYACT_PUBLISH_NPM=true` is explicitly configured as a
repository variable.

`docs/maintainer/prebuilts.md` covers prebuilt packaging details;
`docs/` is the VitePress site (`npm --prefix docs run dev`), with generated
outputs gated by `npm --prefix docs run check`.
