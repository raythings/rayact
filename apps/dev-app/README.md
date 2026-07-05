# @rayact/dev-app

Standalone **Rayact dev app** — an Expo-Go-style prebuilt host. Built once with
the dev-client launcher and a curated set of bundled native plugins, it runs
arbitrary user JS bundles over a QR scan / dev server **without a native
rebuild**. WASM workers reach the same bundled plugins via `sys_invoke`, so
near-native code runs without rebuilding the host either.

## Bundled native modules

Declared in `rayact.config.json` → `nativeModules`:

| Module | npm wrapper | Backend |
|--------|-------------|---------|
| `kv` | `@rayact/runtime` (`Storage`) | built-in |
| `mmkv` | `@rayact/mmkv` | `librayact_mmkv` (file-backed) |
| `secure-store` | `@rayact/secure-store` | `librayact_secure_store` (Keychain / app-private) |

On Android these ride in the APK `jniLibs` and are auto-discovered by the module
bus's plugin loader. On desktop the CLI copies `librayact_*` next to the host in
`modules/`, found via `RAYACT_MODULE_PATH=<exeDir>/modules`.

## Build

```bash
# Android dev-client APK (launcher + bundled plugins), optionally install:
npm run build:android
npm run build:android:install

# Self-contained desktop host dir (binary + modules/ + native-modules.json):
npm run build:desktop
```

## Install from the launch release

```bash
npx github:raythings/rayact-dev-app#v0.0.1 install --platform android
npx github:raythings/rayact-dev-app#v0.0.1 install --platform ios-simulator
npx github:raythings/rayact-dev-app#v0.0.1 install --platform ios-device
```

The installer defaults to release assets from `raythings/rayact`. Override with
`RAYACT_DEV_APP_REPO` or `RAYACT_DEV_APP_VERSION` only for maintainer testing.

Branding comes from `official-app.json`; the build wrapper
(`scripts/with-branding.cjs`) injects it and the bundled-module list into the
dev-client bundle so the launcher's About tab and compatibility check reflect
this host.

## Connect

1. Start a project's dev server elsewhere: `rayact dev`.
2. Launch the dev app, **Scan QR code** (Android, ML Kit — no camera permission)
   or enter the URL, and the project bundle loads live with HMR.
