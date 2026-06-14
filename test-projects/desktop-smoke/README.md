# Rayact Desktop Smoke — standalone npm project

A minimal Rayact app set up as its own npm package with **Vite** and the **rayact dev server**.

## Setup

```bash
cd test-projects/desktop-smoke
npm install
```

Dependencies link to the monorepo packages via `file:../../packages/...`.

## Develop

Start the Rayact dev server (Vite bundler + HMR + TUI):

```bash
npm run dev
```

In another terminal, run the native desktop host against the dev server:

```bash
RAYACT_DEV_SERVER=http://127.0.0.1:8082 npm start
# or from repo root:
RAYACT_DEV_SERVER=http://127.0.0.1:8082 ../../build/bin/rayact_desktop
```

## Build

```bash
npm run build                  # release bundle → dist/bundle.js
npm run build:desktop          # bundle + native host + CSS/fonts → self-contained dist/
npm run build:android          # bundle + release APK (debug-signed) → dist/app-release.apk
npm run build:android:install  # same + adb install + launch
npm run build:debug            # dev bundle with Fast Refresh footer (Vite direct)
```

`build:desktop` output runs anywhere: `cd dist && ./rayact_desktop bundle.js`.

`vite.config.ts` uses `createRayactViteConfig` from `@rayact/dev-server`.

## Run built bundle

```bash
npm run build
npm start
```

## Test

```bash
npm run test:desktop
```

Builds with Vite, runs `rayact_desktop`, captures a screenshot to `.verify/`.

## Project layout

```
desktop-smoke/
  package.json       # npm scripts + @rayact/* deps
  vite.config.ts     # Vite + rayact plugin
  rayact.config.json # dev server / manifest settings
  tsconfig.json
  src/App.tsx
```
