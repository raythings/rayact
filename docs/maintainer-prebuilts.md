# Maintainer: native prebuilts

Application developers do not run these scripts. They consume npm packages at `0.0.3`; GitHub Releases carry the exact same tarballs and native artifacts as a fallback.

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

## Build matrix

| Target | Command |
| --- | --- |
| Android arm64/x86_64 | `node scripts/build-prebuilts.mjs --target android` |
| Linux x64 preview | `node scripts/build-prebuilts.mjs --target linux` |
| macOS Apple Silicon (arm64) | `node scripts/build-prebuilts.mjs --target darwin` |
| iOS device/simulator XCFrameworks | `node scripts/build-prebuilts.mjs --target ios` |
| Web wasm32 | `npm run verify:web` |
| Official dev app | `node scripts/build-prebuilts.mjs --target dev-app` |

Then run:

```bash
./scripts/verify-prebuilts.sh
npm run test:packages
npm run verify:dev-app-modules
npm run pack:release
```

The package gate packs every workspace, installs only candidate tarballs into a clean temporary npm project, and rejects local references, cycles, missing declarations, undeclared dependencies, and source leaks.

## Dev-app installers

```bash
npx @rayact/dev-app@0.0.3 install --platform android
npx @rayact/dev-app@0.0.3 install --platform ios-device
npx @rayact/dev-app@0.0.3 install --platform ios-simulator
```

GitHub fallback:

```bash
npx https://github.com/raythings/rayact/releases/download/v0.0.3/rayact-dev-app-0.0.3.tgz install --platform android
```

## Release channels

- `canary` builds a unique prerelease for each main commit.
- `preview` publishes the final immutable candidate bits under the `preview` dist-tag.
- `stable` verifies and promotes those same tarballs to `stable` and `latest`; it never rebuilds.
- rollback restores dist-tags and GitHub `latest` to the previous signed release set without unpublishing.

`release-set.json` is signed and records each package version, native ABI, platform, dev-app build, and artifact SHA-256. Root `rayact` is always published last.
