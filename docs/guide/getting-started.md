# Getting started

Rayact runs your React app on a **prebuilt native engine** — you write the app, the engine is already compiled. This guide goes from zero to a running app on desktop, a device, and the web.

## Prerequisites

- **Node.js 18+** and npm.
- A **64-bit** OS. Every target is 64-bit (macOS x64/arm64, Linux x64, Android arm64, iOS arm64, web wasm32); 32-bit is not planned.
- **No C++ toolchain, CMake, or NDK** for a normal app — the engine arrives precompiled. You only need a toolchain if you write your own native or WebAssembly module (see [Native & WASM modules](#native--wasm-modules)).
- To deploy on a device:
  - **Android** — `adb` (platform-tools) and a device with USB debugging on.
  - **iOS** — Xcode (simulator), or a signing profile for a real device.

## Create an app

```sh
npx github:raythings/create-rayact-app#v0.0.1 my-app
cd my-app
npm install        # installs the @rayact/* packages from GitHub
```

> Rayact isn't on the npm registry yet — packages install straight from GitHub. The scaffold wires every `@rayact/*` dependency to `github:raythings/…#v0.0.1`, so a plain `npm install` just works. The prebuilt native host is downloaded from the GitHub release the first time you build.

The project has a `rayact.config.json` ([config reference](/reference/config)), a `src/App.tsx` entry, and the `@rayact/*` dependencies (pinned to GitHub).

## Your first component

```tsx
import { useState } from 'react';
import { View, Text, Button, render } from '@rayact/react';

function App() {
  const [count, setCount] = useState(0);
  return (
    <View style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
      <Text>You tapped {count} times</Text>
      <Button label="Tap me" onPress={() => setCount(count + 1)} />
    </View>
  );
}

render(<App />);
```

The same `src/App.tsx` runs unchanged on every platform.

## Develop

```sh
npm run dev        # = rayact dev — dev server + bundler, QR code, Fast Refresh
```

Then connect a target. There are two ways to run on a phone — same split as Expo:

### Use the prebuilt dev app (Expo Go style)

No native build at all. One command downloads the prebuilt dev app from the GitHub release and installs it:

```sh
npm run dev-app:android    # USB-connected Android device (adb)
npm run dev-app:ios        # iOS simulator
```

The dev app launches and connects to your dev server — scan the QR from `npm run dev`, pick the server from local-network discovery, or use the USB-forwarded localhost URL. Edits hot-reload.

### Build your own dev client (expo-dev-client style)

When you add your own native modules, build a dev client that includes them:

```sh
npm run prebuild             # once: scaffold android/ + ios/ shell projects
npm run dev-client:android   # build + install your custom dev client
npm run dev-client:ios       # iOS simulator variant
```

`prebuild` copies thin native shells into your project and links the **prebuilt engine** (downloaded from the GitHub release) — so the dev-client build compiles only the shell + your modules, never the engine. This is the one flow that needs a native toolchain (Android SDK / Xcode).

### Desktop

- `rayact run:desktop` opens a native window; it connects to the dev server if one is running, otherwise loads the built bundle.

## Run & build per platform

Building your app links your JS bundle to the prebuilt engine for the target — no engine compile. There are no user-facing shell scripts; everything is a `rayact` subcommand.

```sh
# Desktop
rayact run:desktop                 # build + launch a native window
rayact build --desktop             # package a self-contained desktop app folder

# Android  (device with USB debugging + adb)
rayact run:android                 # run against the dev server (adb reverse)
rayact build --android --install   # build an APK, install it, launch it

# iOS  (Xcode)
rayact run:ios                     # build + run on the iOS simulator
rayact build --ios --install       # build + install on the simulator

# Web  (WebGPU browser)
rayact build --web                 # WASM/WebGPU build you can serve
```

See [`rayact --help`](/reference/cli) for the full option list.

## GPU backends

Each platform renders through its native modern GPU API — nothing to configure:

| Platform        | Backend |
|-----------------|---------|
| macOS / iOS     | Metal   |
| Android / Linux | Vulkan  |
| Web             | WebGPU  |
| Windows         | DX12 *(coming soon)* |

Each backend **emulates the OpenGL 3.3 API 1:1** (with a few minor quirks), so the renderer behaves the same across Metal, Vulkan, and WebGPU.

## Build a release

```sh
rayact build --release             # desktop release (bytecode + .rayactpack)
rayact build --release --android   # release APK
rayact build --release --ios       # release iOS app
```

Release builds compile the JS bundle to QuickJS bytecode and emit a single [`.rayactpack`](/reference/rayactpack) container. The native host that compiles bytecode is fetched automatically — see [Installation](/guide/install).

## Native & WASM modules

A pure JS/TS app needs no toolchain. To add your own **native module** or **WebAssembly worker**, you implement the module ABI and compile *only your module* against the prebuilt engine — a fast incremental build, not an engine rebuild. This is the one path that requires a local toolchain.

## Next steps

- [Installation](/guide/install) — how the prebuilt engine is resolved and cached.
- [CLI reference](/reference/cli) · [Configuration](/reference/config) · [Packages](/reference/packages)
