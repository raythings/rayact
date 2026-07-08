# Rayact

Rayact is a cross-platform React renderer with a native raylib/raym3 + QuickJS backend. It runs React apps on desktop, Android, iOS, and the web without a DOM or platform WebView.

`v0.0.1` is distributed through the `raythings/rayact` GitHub repo and GitHub Release assets. npm publishing is planned, but not required for the current launch.

## Install

```bash
npx https://github.com/raythings/rayact/releases/download/v0.0.1/rayact-0.0.1.tgz init my-app
cd my-app
npm install
npm run dev
```

The generated app installs one framework dependency, `rayact`. Internal JS packages, native hosts, mobile/web artifacts, templates, and dev-app binaries are resolved from the [`v0.0.1` GitHub release](https://github.com/raythings/rayact/releases/tag/v0.0.1).

## What Works Today

| Target | Status | Notes |
| --- | --- | --- |
| macOS desktop | Supported | Prebuilt arm64/x64 hosts are attached to the release. |
| Linux desktop | Supported | x64 prebuilt host is attached to the release. |
| Windows desktop | Source supported | No `v0.0.1` prebuilt attached yet. |
| Android | Supported | arm64 prebuilt engine, Gradle template, dev app, and release APK flow. |
| iOS | Supported | arm64 XCFramework, XcodeGen template, simulator app zip, unsigned device IPA. |
| Web | Supported | WASM/WebGPU host with COOP/COEP serving requirements. |

## Development Workflow

Rayact includes a first-party dev workflow:

- `rayact dev` starts the Vite-powered dev server, HMR, debugger transport, inspector transport, mDNS discovery, and QR payloads.
- `rayact/dev-client` provides the in-app launcher used by custom debug clients.
- the prebuilt first-party dev app runs project bundles without rebuilding native code.
- Release builds can emit QuickJS bytecode and package runtime assets for native hosts.

Install and launch the prebuilt dev app from a generated app:

```bash
npm run android
npm run ios
```

## Common Commands

```bash
npm run dev                         # start the dev server
npm run android                     # launch prebuilt Android dev app
npm run ios                         # launch prebuilt iOS simulator dev app
npm run prebuild                    # scaffold native shells linked to prebuilts
npm run android:dev-client          # build + install custom Android debug client
npm run build:desktop               # desktop release
npm run build:android               # Android release APK
npm run build:ios                   # iOS release app
npm run build:web                   # web bundle + host assembly
```

Maintainer verification commands:

```bash
npm run verify
npm run verify:android
npm run verify:web
node scripts/verify-packages.mjs
node scripts/bump-version.mjs --check
```

## Distribution

Apps depend on `rayact`. The monorepo still builds smaller internal packages so release assets can be cached and version-gated independently:

- `@rayact/cli` — `rayact` command for dev, build, run, prebuild, dev-app, and verify flows.
- `@rayact/dev-server` — Vite bundler, dev server, config loader, schema, HMR/debugger/inspector transports.
- `@rayact/prebuild` — native prebuilt resolution, GitHub Release downloads, integrity checks, plugin autolinking.
- `@rayact/react` and `@rayact/runtime` — React host adapter and runtime APIs.
- `@rayact/navigation` — navigation bindings.
- `@rayact/mmkv` and `@rayact/secure-store` — bundled native plugin wrappers.
- `@rayact/prebuilt-*` and `@rayact/template-*` — release-attached native hosts and thin platform templates.
- `create-rayact-app` and `@rayact/dev-app` — scaffolding and first-party dev app install path.

## Repository Layout

```text
apps/
  android/          Android app shell used by maintainer builds
  dev-app/          first-party prebuilt dev app
  desktop/          desktop sample and verification surfaces
  ios/              iOS app shell and XcodeGen project
  web/              WASM/WebGPU host project and COOP/COEP servers
native/
  android/ ios/ desktop/ web/ platform host bridges
  core/ shared/ plugins/       shared engine and plugin code
packages/
  rayact-*          JavaScript packages and native prebuilt/template packages
docs/
  VitePress docs and generated LLM-readable Markdown
```

## Documentation

- [Getting started](docs/guide/getting-started.md)
- [Installation](docs/guide/install.md)
- [CLI reference](docs/reference/cli.md)
- [Config reference](docs/reference/config.md)
- [Package and platform matrix](docs/reference/packages.md)
- [Dev platform notes](docs/dev-platform.md)
- [Maintainer prebuilt/release workflow](docs/maintainer-prebuilts.md)

## Release

The current launch release is [`v0.0.1`](https://github.com/raythings/rayact/releases/tag/v0.0.1). It includes:

- native prebuilts for Android, iOS, macOS, Linux;
- web host artifacts;
- dev-app APK, simulator zip, and unsigned device IPA;
- package tarballs for every publishable package;
- `SHA256SUMS` for asset verification.

## License

MIT
