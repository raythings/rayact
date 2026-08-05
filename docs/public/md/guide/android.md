# Android

Rayact apps run on Android as a native activity rendering through Vulkan
(rlvk backend). The engine ships prebuilt — `rayact prebuild` generates a
Gradle project that links `librayact.so`; your machine never compiles C++.

## Prerequisites

- Android SDK with platform tools (`adb` on PATH).
- JDK 17+ for Gradle.
- A device or emulator running **Android 8.0+ (API 26)**. 0.0.5 ships
  `arm64-v8a` engine binaries — use a physical device or an arm64 emulator
  image.

`rayact doctor` checks all of this and names anything missing.

## Fastest loop: the prebuilt dev app

No local Android build at all — install the release's dev app (Expo Go-style
host) and point it at your dev server:

```sh
npm run dev        # start the dev server (QR code in the TUI)
npm run android    # rayact dev --android: installs the dev app + connects over USB
```

The dev app scans the QR (or uses `adb reverse`, set up for you) and hot-reloads
your project. Shake the device for the dev menu.

## Your own dev client

When you add native modules or need your own application id, generate the
native shell once and build a debug **dev client** (expo-dev-client style):

```sh
npm run prebuild             # rayact prebuild: generates android/ from @rayact/template-android
npm run android:dev-client   # rayact build --debug --android --install
```

`android/` is plain Gradle — commit it. Prebuild substitutes your app name/id,
drops the prebuilt `librayact.so` + `libc++_shared.so` into
`app/src/{debug,release}/jniLibs/arm64-v8a/`, and writes
`rayact-assets/runtime/native-modules.json` for module autolinking.

## Release build

```sh
npm run build:android            # rayact build --release --android
npm run build:android:install    # …and install to the connected device
```

Produces a release APK with the bundle compiled to QuickJS bytecode and staged
into APK assets (`app.qjsbc` + your CSS under `assets/runtime/`).

::: warning Debug-signed releases
0.0.5 release APKs are signed with the debug keystore — fine for sideloading
and testing, not for Play submission. Configure your own `signingConfig` in
`android/app/build.gradle` before shipping to a store.
:::

## Debugging

- `adb logcat -s rayact` — engine + JS console output.
- Chrome DevTools: `rayact dev` exposes CDP on port 9229;
  `adb forward tcp:9229 tcp:9229`, then add `localhost:9229` in
  `chrome://inspect`. Element tree, styles and console work against the native
  node tree. See the [dev platform guide](/dev-platform).
