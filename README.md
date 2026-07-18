# Rayact

Rayact is a cross-platform React renderer backed by raylib/raym3 and QuickJS. It runs React applications on Android, iOS, macOS, and the Web without a DOM or platform WebView.

The first npm stable candidate is `0.0.3`. npm is the supported installation path; the same package tarballs and native artifacts are attached to the matching GitHub Release as a verified fallback.

## Quick start

```bash
npx create-rayact-app@0.0.3 my-app
cd my-app
npm install
npm run dev
```

GitHub fallback:

```bash
npx https://github.com/raythings/rayact/releases/download/v0.0.3/create-rayact-app-0.0.3.tgz my-app
```

## Package model

Rayact follows the Expo monorepo model: one private workspace root and independently publishable packages under `packages/`.

- `rayact` is the consumer umbrella. It includes React APIs and the built-in `rayact/kv`, `rayact/crypto`, and `rayact/worker` capabilities.
- `@rayact/shared`, `@rayact/runtime`, `@rayact/renderer`, and `@rayact/react` form the framework layer.
- `@rayact/mmkv`, `@rayact/secure-store`, and `@rayact/crash-reporter` are complete optional packages. Their JS APIs, manifests, native sources, artifacts, tests, and documentation are owned by those packages and are not bundled into the generic engine.
- `@rayact/navigation` and `@rayact/worklets` are optional framework features.
- `@rayact/cli`, `@rayact/dev-server`, `@rayact/prebuild`, `@rayact/dev-client`, and `@rayact/devtools` own the development workflow.

Legacy `rayact/mmkv` and `rayact/secure-store` imports remain deprecated compatibility shims for `0.0.x`. New applications install and import the scoped packages directly.

```bash
npm install @rayact/mmkv@0.0.3
# or
npm install @rayact/secure-store@0.0.3
```

Installed packages with a valid `rayact.module.json` autolink automatically. `rayact.config.json` can disable a module or provide configuration without scanning arbitrary `node_modules` directories.

## Platform status

| Target | Status |
| --- | --- |
| Android arm64 / x86_64, API 26+ | Tier 1 |
| iOS 16+, device and arm64/x86_64 simulator | Tier 1 |
| macOS 13+, Apple Silicon (arm64) | Tier 1 |
| Web wasm32, WebGPU + secure context + COOP/COEP | Tier 1 |
| Linux x64 | Preview |
| Windows | Graduation target |

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
packages/             independently publishable npm workspaces
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
