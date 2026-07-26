# Getting started

Scaffold a new app, run it in development, then build a release.

## Create an app

```sh
npx create-rayact-app@0.0.4 my-app
cd my-app
npm install
```

The generated project has a `rayact.config.json` (see the [config reference](/reference/config)), a `src/App.tsx` entry, and the `rayact` + `react` runtime dependencies alongside the tooling packages the CLI needs (`@rayact/dev-server`, `@rayact/dev-client`, and the `@rayact/template-android` / `@rayact/template-ios` prebuild templates). See [Installation](/guide/install#required-packages) for what each one is for.

::: tip Node version
Rayact requires **Node >=22 <25**. The CLI checks this on every command and exits with an error outside that range — npm's `EBADENGINE` warning alone is easy to miss. Use `nvm use 24` if you are on a newer Node.
:::

## Develop

```sh
npm run dev
```

`rayact dev` starts the Vite-powered dev server and a terminal UI. The desktop host hot-reloads as you edit; a device running the dev app connects over the same dev server (scan the QR code).

## Run

```sh
rayact run --desktop          # build + launch on desktop
rayact run --desktop --dev     # launch against the running dev server
rayact run --android           # build + install + launch on a device
rayact run --ios               # build + launch on the iOS simulator
```

`rayact run` replaces the old `run.sh` / `run-android.sh` shell scripts — there are no user-facing shell scripts.

## Build a release

```sh
rayact build --release             # desktop release (bytecode + .rayactpack)
rayact build --release --android   # release APK
rayact build --release --ios       # release iOS app
rayact build --release --web       # bytecode web bundle + WASM/WebGPU host
```

All release builds compile the JS bundle to QuickJS bytecode. Native releases also emit a single [`.rayactpack`](/reference/rayactpack) container. The host needed to compile bytecode is fetched automatically — see [Installation](/guide/install). Web builds use the WASM/WebGPU host and must be served with COOP/COEP headers for SharedArrayBuffer/WebGPU isolation.
