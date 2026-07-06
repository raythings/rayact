# Rayact iOS Dev Client

Native iOS host mirroring the Android dev client: dual engine sessions (launcher + project), Metal rendering, bundled `@rayact/dev-client` launcher JS, Swift-side dev-server fetch/HMR, and react-navigation stack hosting.

## Prerequisites

1. **raym3 build** — Xcode needs `raym3/build-v2/include`. Build raym3 the same way as for Android/desktop before compiling iOS.
2. **XcodeGen** — `brew install xcodegen` or download from [XcodeGen](https://github.com/yonaskolb/XcodeGen).
3. **Bundled launcher JS** — `apps/android/app/src/main/assets/app.js` (built via `rayact build` or copied from dev-client bundle). The post-build script copies `runtime/` and `app.js` from Android assets into the app bundle.

## Build

From the monorepo root:

```bash
npm run rayact -- build --debug --ios
```

Or manually:

```bash
cd apps/ios
xcodegen generate
xcodebuild -scheme RayactIOS -configuration Debug \
  -destination 'generic/platform=iOS Simulator' build
```

Use `rayact build --ios --install` to build and install on a booted simulator or connected device.

## Device builds

Set `DEVELOPMENT_TEAM` in `project.yml` (or override in Xcode) to your Apple team ID. An empty team blocks signing for physical devices.

## Verify

```bash
./scripts/verify-ios.sh
```

## Architecture

- **Native bridge** — `native/ios/ios_bridge.mm` (sessions, Metal surface, touch, insets, dev callbacks).
- **Swift app layer** — ports of Android Kotlin: `DevLauncherController`, `RayactEngineSession`, `NavigationHost`, `RayactSurfaceView`, dev-client helpers.
- **Plugins** — mmkv and secure-store are statically linked (`ios_plugins_register.cpp` registers both on the module bus).

Platform views (Android `VirtualDisplay`) use a simplified v1: native text input via `RayactSurfaceView` IME proxy; full external-view embedding is not yet parity with Android.
