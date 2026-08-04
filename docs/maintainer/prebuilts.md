# Maintainer: native prebuilts

Application developers do not run these scripts. They consume the package
tarballs and native artifacts attached to signed GitHub Releases.

## Reproducible inputs

Native foundations are commit-pinned submodules under `third_party/`. Start from a recursive clone:

```bash
git clone --recursive https://github.com/raythings/rayact.git
git submodule update --init --recursive
```

The release build must not read sibling repositories. Historical sibling clones are not authoritative.

## Toolchains

- Node 22 or 24 LTS
- Android API 26 minimum, compile/target API 36, AGP 8.9.1+, JDK 17, NDK `27.3.13750724`
- Xcode 26 with the iOS 26 SDK; deployment targets iOS 16 and macOS 13
- Emscripten for the wasm32 WebGPU host
- clang-cl/lld, xwin-splatted MSVC CRT/Windows SDK, and the pinned CEF minimal runtime for Windows x64

## Build matrix

| Target | Command |
| --- | --- |
| Android arm64 | `node scripts/build-prebuilts.mjs --target android` (host Gradle; falls back to Docker only if it's unavailable — x86_64 emulator target not built as of 0.0.5, see TODO) |
| Linux x64 preview | `node scripts/build-prebuilts.mjs --target linux` |
| macOS Apple Silicon (arm64) | `node scripts/build-prebuilts.mjs --target darwin` |
| iOS device/simulator XCFrameworks | `node scripts/build-prebuilts.mjs --target ios` |
| Web wasm32 | `npm run verify:web` |
| Windows x64 host + modules + dev app | `node scripts/build-prebuilts.mjs --target windows` |
| Official dev app | `node scripts/build-prebuilts.mjs --target dev-app` |

Then run:

```bash
export RAYACT_RELEASE_PRIVATE_KEY="$(cat ~/.rayact-release/rayact-release-key.pem)"
npm run release:prepare
```

The command builds the complete matrix locally, packs every workspace, installs
only candidate tarballs into a clean temporary npm project, and rejects local
references, cycles, missing declarations, undeclared dependencies, source
leaks, invalid signatures, and incomplete platform/dev-app sets.

## Dev-app installers

```bash
DEV_APP=https://github.com/raythings/rayact/releases/download/v0.0.5/rayact-dev-app-0.0.5.tgz
npx "$DEV_APP" install --platform android
npx "$DEV_APP" install --platform ios-device
npx "$DEV_APP" install --platform ios-simulator
npx "$DEV_APP" install --platform windows
```

## Publication

```bash
RAYACT_CONFIRM_PUBLISH_RELEASE=v0.0.5 npm run release:publish
```

This creates the GitHub tag and release from `release1/`. GitHub Actions only
downloads, verifies, and attests those assets. `release-set.json` records each
package version, native ABI, platform, dev-app build, and artifact SHA-256.

The dormant npm channel machinery is gated by the repository variable
`RAYACT_PUBLISH_NPM`; leaving it unset keeps all npm publication disabled.
