# Maintainer: Prebuilt Native Libraries

**App developers never run these scripts.** Until npm publishing exists, they install Rayact packages from `github:raythings/*#v0.0.1`; native prebuilts and dev-app binaries come from the `raythings/rayact` GitHub release.

## Quick reference

| Target | Command | Host |
|--------|---------|------|
| Android prebuilts | `node scripts/build-prebuilts.mjs --target android` | Docker (any OS) |
| Linux desktop | `node scripts/build-prebuilts.mjs --target linux` | Docker |
| macOS desktop | `node scripts/build-prebuilts.mjs --target darwin` | macOS only |
| iOS prebuilts | `node scripts/build-prebuilts.mjs --target ios` | macOS only |
| Dev-app APK/IPA | `node scripts/build-prebuilts.mjs --target dev-app` | macOS (iOS); APK also via Docker |
| Everything | `node scripts/build-prebuilts.mjs --target all` | Docker + macOS |

Verify outputs:

```bash
./scripts/verify-prebuilts.sh
./scripts/verify-prebuilts.sh --skip darwin,ios,dev-app   # after Docker-only build
```

Legacy entrypoint: `./scripts/build-prebuilts.sh` forwards to the Node orchestrator.

## Prerequisites

### Super-repo layout

Docker and native builds expect sibling checkouts next to `rayact/`:

```
projects/
  rayact/          # this repo
  quickjs/
  raylib/
  raym3/
  raylib-backends/
  ...
```

### Docker (Android + Linux)

- Docker Desktop or engine on Linux/macOS/Windows WSL2
- Images: `docker/prebuilts/Dockerfile.android`, `Dockerfile.linux`
- NDK **27.2.12479018** pinned in the Android image

### macOS (Darwin + iOS + dev-app)

- Xcode 15+, XcodeGen (`brew install xcodegen`)
- raym3 built: `raym3/build-v2/include` must exist
- Built CLI packages: `packages/rayact-cli`, `rayact-dev-server`, `rayact-prebuild`

## Dev-app artifacts

Built by [`scripts/build-dev-app.mjs`](scripts/build-dev-app.mjs) into `apps/dev-app/dist/`:

| File | Use |
|------|-----|
| `rayact-dev-app.apk` | Android sideload |
| `rayact-dev-app-device-unsigned.ipa` | Physical device — **re-sign required** |
| `rayact-dev-app-simulator.zip` | Simulator — unzip and `xcrun simctl install booted Rayact.app` |

### Re-sign unsigned device IPA

```bash
fastlane resign rayact-dev-app-device-unsigned.ipa \
  --signing-cert "Apple Development: Your Name (TEAMID)" \
  -p YourProfile.mobileprovision
```

Install with Xcode Devices, `ios-deploy`, or Apple Configurator.

### Install via npm script

```bash
npx https://github.com/raythings/rayact/releases/download/v0.0.1/rayact-dev-app-0.0.1.tgz install --platform android
npx https://github.com/raythings/rayact/releases/download/v0.0.1/rayact-dev-app-0.0.1.tgz install --platform ios-device
npx https://github.com/raythings/rayact/releases/download/v0.0.1/rayact-dev-app-0.0.1.tgz install --platform ios-simulator
```

## CI

[`.github/workflows/prebuilts.yml`](../.github/workflows/prebuilts.yml) runs on `v*` tags:

1. **ubuntu** — Docker android + linux prebuilts
2. **macos-14** — darwin, ios, dev-app APK + IPA/simulator
3. **release** — merge, verify, `npm pack`, GitHub Release upload

Binaries are **not** committed to git. They ship on GitHub Releases and in npm tarballs per tag.

## Publishing

```bash
git tag -f v0.0.1 && git push -f origin v0.0.1
# CI uploads .tgz + APK + IPAs + SHA256SUMS
```

Local pack for testing:

```bash
npm pack -C packages/prebuilt-android-arm64
```
