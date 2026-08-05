# Rayact

Rayact is a cross-platform React renderer backed by raylib/raym3 and QuickJS. It runs React applications on Android, iOS, macOS, Windows, Linux, and the Web without using a WebView as the application runtime.

Rayact packages, native prebuilts, web hosts, and dev apps are distributed through signed GitHub Releases. They are not published to the npm registry.

## New in 0.0.5

- **Windows support** — Windows 10/11 x64 is now a Tier-1 target with a
  prebuilt Vulkan host, `rayact_tool`, native-module DLLs, and a portable dev
  app.
- **True native components** — `TextInput` uses the operating system's editing
  controls, caret, selection, keyboard, and IME. `@rayact/webview` embeds
  Android WebView, Apple WebKit, and Windows CEF instead of emulating a browser
  in JavaScript.
- **Expanded native modules** — barcode/QR scanning, clipboard, haptics, image
  picking, deep linking, sensors, SVG, WebView, MMKV, Secure Store, and Crash
  Reporter ship as autolinked first-party packages.
- **Custom iOS/Android clients** — the iOS `RayactEngine.xcframework` keeps
  `rayactDevFetch` / `devCall` for live connect and HMR; the launcher About
  page falls back to your `rayact.config.json` bundle/package id and versions
  when native app info is unavailable. Light/dark switches refresh material
  surfaces in place (no navigation remount).

See the [Windows guide](docs/guide/windows.md), [iOS guide](docs/guide/ios.md),
[components reference](docs/reference/components.md), and
[native modules](docs/native-modules.md).

## Quick start

```bash
RELEASE=https://github.com/raythings/rayact/releases/download/v0.0.5
npx "$RELEASE/create-rayact-app-0.0.5.tgz" my-app --release-url "$RELEASE"
cd my-app
npm run dev
```

## Package model

Rayact follows the Expo monorepo model: one private workspace root and independently packaged modules under `packages/`.

- `rayact` is the consumer umbrella. It includes React APIs and the built-in `rayact/kv`, `rayact/crypto`, and `rayact/worker` capabilities.
- `@rayact/shared`, `@rayact/runtime`, `@rayact/renderer`, and `@rayact/react` form the framework layer.
- `@rayact/mmkv`, `@rayact/secure-store`, `@rayact/crash-reporter`,
  `@rayact/sensors`, `@rayact/webview`, and the other first-party native
  modules are complete optional packages. Their APIs, manifests, native
  sources, artifacts, tests, and documentation are owned by those packages and
  are not bundled into the generic engine.
- `@rayact/navigation` and `@rayact/worklets` are optional framework features.
- `@rayact/cli`, `@rayact/dev-server`, `@rayact/prebuild`, `@rayact/dev-client`, and `@rayact/devtools` own the development workflow.

Legacy `rayact/mmkv` and `rayact/secure-store` imports remain deprecated compatibility shims for `0.0.x`. New applications install and import the scoped packages directly.

```bash
cd my-app
npm install file:vendor/rayact_pkgs/rayact-mmkv-0.0.5.tgz
# or
npm install file:vendor/rayact_pkgs/rayact-secure-store-0.0.5.tgz
```

Installed packages with a valid `rayact.module.json` autolink automatically. `rayact.config.json` can disable a module or provide configuration without scanning arbitrary `node_modules` directories.

## Platform status

| Target | Status |
| --- | --- |
| Android arm64, API 26+ | Tier 1 |
| iOS 16+, device and arm64/x86_64 simulator | Tier 1 |
| macOS 13+, Apple Silicon (arm64) | Tier 1 |
| Web wasm32, WebGPU + secure context + COOP/COEP | Tier 1 |
| Linux x64 | Preview |
| Windows 10/11 x64, Vulkan | Tier 1 |

## Common commands

```bash
npm run dev
npm run android
npm run ios
npm run prebuild
npm run build:web
```

Maintainers use:

```bash
npm run build
npm test
npm run test:packages
npm run verify:dev-app-modules
npm run pack:release
```

## Repository layout

```text
apps/                 official dev app and platform verification shells
packages/             independently packaged workspaces
native/               built-in engine and platform bridges only
third_party/          commit-pinned native foundation submodules
schema/               configuration and native-module schemas
scripts/              build, verification, migration, and release tooling
docs/                 consumer and maintainer documentation
```

## Documentation and policy

- [Getting started](docs/guide/getting-started.md)
- [Native modules](docs/native-modules.md)
- [Accessibility](docs/accessibility.md)
- [Crash reporting](docs/crash-reporting.md)
- [Release process](docs/releasing.md)
- [Toolchain baseline](docs/toolchains.md)
- [Support policy](SUPPORT.md)
- [Security policy](SECURITY.md)

## License

MIT
