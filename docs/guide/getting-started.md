# Getting started

Scaffold a new app, run it in development, then build a release.

## Create an app

```sh
npx https://github.com/raythings/rayact/releases/download/v0.0.1/rayact-0.0.1.tgz init my-app
cd my-app
npm install
```

The generated project has a `rayact.config.json` (see the [config reference](/reference/config)), a `src/App.tsx` entry, and only the public `rayact` and `react` dependencies.

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
rayact build --web --no-bytecode   # web bundle + WASM/WebGPU host
```

Native release builds compile the JS bundle to QuickJS bytecode and emit a single [`.rayactpack`](/reference/rayactpack) container. The native host needed to compile bytecode is fetched automatically — see [Installation](/guide/install). Web builds use the WASM/WebGPU host and must be served with COOP/COEP headers for SharedArrayBuffer/WebGPU isolation.
