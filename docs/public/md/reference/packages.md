# Packages & platforms

Rayact is a monorepo of small `@rayact/*` packages plus per-platform prebuilts.

## JavaScript packages

| Package | Role |
| --- | --- |
| `@rayact/cli` | `rayact` command — dev, build, run, prebuild |
| `@rayact/dev-server` | Vite bundler, dev server, config loader + schema |
| `@rayact/prebuild` | Prebuilt resolution, downloader, plugin autolinking |
| `@rayact/react` | React adapter for the host runtime |
| `@rayact/runtime` | Renderer-agnostic host runtime |
| `@rayact/core` | React reconciler host config |
| `@rayact/renderer` | raylib graphics backend bindings |
| `@rayact/quickjs` | QuickJS engine integration |
| `@rayact/navigation` | `react-navigation` bindings |
| `@rayact/shared` / `@rayact/types` | Shared utilities + ambient types |
| `@rayact/mmkv` / `@rayact/secure-store` | Native storage plugins |
| `create-rayact-app` | Project scaffolder |

## Prebuilt native hosts

| Package | Platform | Ships |
| --- | --- | --- |
| `@rayact/prebuilt-darwin-arm64` | macOS arm64 | `rayact_desktop` + plugin dylibs |
| `@rayact/prebuilt-darwin-x64` | macOS x64 | `rayact_desktop` + plugin dylibs |
| `@rayact/prebuilt-linux-x64` | Linux x64 | `rayact_desktop` + plugin `.so` |
| `@rayact/prebuilt-android-arm64` | Android arm64 | engine + plugin `.so` (JNI) |
| `@rayact/prebuilt-ios-arm64` | iOS arm64 | `RayactEngine.xcframework` |

Each prebuilt carries a `manifest.json` (`engineVersion`, `moduleAbiVersion`,
platform, arch). The CLI gates on `moduleAbiVersion` before using a prebuilt.

## Platform support

| Target | Status |
| --- | --- |
| Desktop (macOS / Linux / Windows) | macOS/Linux prebuilts in `v0.0.1`; Windows source/build path |
| Android | Supported |
| iOS | Supported |
| Web (WASM) | Supported; requires COOP/COEP serving for SharedArrayBuffer/WebGPU |
