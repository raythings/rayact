# Getting started

Scaffold a new app from a Rayact release, run it with hot reload, then build a release for any platform. Rayact renders real React (React 19, `react-reconciler`) through a native C++ engine — QuickJS for JS, the raym3 renderer for layout/paint, and a raylib backend per platform (Metal on macOS/iOS, Vulkan on Android/Linux, WebGPU on the web).

## Requirements

- **Node >= 22.** Tested through Node 24; newer majors print a one-line "untested" warning and run normally (silence it with `RAYACT_SILENCE_NODE_WARNING=1`).
- Per-platform toolchains only when you target them: Xcode + [xcodegen](https://github.com/yonaskolb/XcodeGen) for iOS, the Android SDK/NDK for Android. Desktop and web need nothing beyond Node — the native hosts come prebuilt.

## Create an app

Rayact is distributed as **GitHub release tarballs**, not through the npm registry. The scaffolder vendors the release into your project so plain `npm install` never needs the registry for `@rayact/*` packages:

```sh
npx https://github.com/raythings/rayact/releases/download/v0.0.4/create-rayact-app-0.0.4.tgz \
  my-app --release-url https://github.com/raythings/rayact/releases/download/v0.0.4
cd my-app
```

Already downloaded the release (or working from a local checkout's `release1/`)? Point at the directory instead:

```sh
npx ./create-rayact-app-0.0.4.tgz my-app --release-dir ~/Downloads/rayact-v0.0.4
```

What this produces:

- `src/App.tsx` + `src/app.css` — the app entry and a starter stylesheet wired through `className`.
- `rayact.config.json` — app name, key, dev-server ports ([config reference](/reference/config)).
- `vendor/rayact_pkgs/*.tgz` — the vendored release packages, referenced by `file:` dependencies **and** an `overrides` block so every transitive `@rayact/*` pin resolves locally, never from the npm registry. Commit `vendor/` — it is your project's toolchain.
- `--vendor-prebuilts` (optional) also vendors the native engine tarballs for fully-offline installs; otherwise `rayact prebuild` streams the right prebuilt from the GitHub release on first use.

## Develop

```sh
npm run dev
```

`rayact dev` bundles with Vite, starts the dev server (default port 8081), and opens a terminal UI with a QR code. Edits hot-reload. From here:

- `npm run desktop` — native desktop window with HMR.
- `npm run android` / `npm run ios` — install + launch the prebuilt **dev app** (Expo Go-style) on a USB device / simulator and connect it to your dev server.
- `npm run web` — the same app in a browser via the WASM/WebGPU host.

Your first edit: open `src/App.tsx`, change the title text, and watch every connected surface update. Component state (the tap counter) survives reloads.

## Build for release

```sh
npm run build:desktop   # rayact build --release --desktop
npm run build:android   # release APK
npm run build:ios       # iOS app (simulator-ready)
npm run build:web       # static web bundle + WASM host
```

Release builds compile the bundle to QuickJS bytecode with the headless `rayact_tool` and pack native desktop releases into a single [`.rayactpack`](/reference/rayactpack) container. Each platform's guide covers running and shipping the output:

- [Desktop (macOS & Linux)](/guide/desktop)
- [Android](/guide/android)
- [iOS](/guide/ios)
- [Web](/guide/web)
- [Linux specifics](/guide/linux)

## Where next

- [Styling](/guide/styling) — `style` props, `className`, importing CSS files.
- [Animation](/guide/animation) — animation hooks, CSS transitions and `@keyframes`.
- [Navigation](/guide/navigation) — react-navigation stacks and tabs.
- [Components reference](/reference/components) — every exported component and its sharp edges.
