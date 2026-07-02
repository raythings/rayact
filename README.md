# Rayact

**Build apps with React that render on the GPU.** One React codebase draws its own UI — flexbox layout and Material 3 — on iOS, Android, macOS, Linux, and the web.

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-iOS%20·%20Android%20·%20macOS%20·%20Linux%20·%20Web-blue)](#platform-support)
[![React](https://img.shields.io/badge/React-19-149eca)](https://react.dev)

Rayact runs your React code on a small embedded JavaScript engine ([QuickJS](https://github.com/quickjs-ng/quickjs)) and paints every pixel itself with a GPU renderer ([raylib](https://github.com/raysan5/raylib) + a Material 3 layer). Like Flutter, it uses **no webview and no OS-native widgets** — the entire UI is drawn on the GPU, so it looks and behaves identically on every platform.

## Why Rayact

- **One codebase, everywhere** — iOS, Android, macOS, Linux, and web from the same React tree: flexbox (Yoga), Material 3, text, scrolling, and input.
- **No toolchain to install** — the engine ships precompiled per platform and downloads from the GitHub release on your first build. A pure JS/TS app never touches CMake, the NDK, or a C++ compiler. You only need a toolchain if you add your *own* native or WebAssembly module — and that's a fast incremental build against the prebuilt engine.
- **A stack you already know** — React 19, [`react-navigation`](https://reactnavigation.org), and React Native-style components (`View`, `Text`, `Button`, `ScrollView`, `FlatList`, `TextInput`).
- **Tailwind out of the box** — style with inline styles, CSS, or Tailwind classes; components take a `className` prop the built-in CSS engine applies.
- **Dev app + hot reload** — load your bundle on a device over USB or your network with Fast Refresh, like Expo Go.

## Quick start

```bash
npx github:raythings/create-rayact-app#v0.0.1 my-app
cd my-app
npm install      # installs the @rayact/* packages from GitHub
npm run dev      # first run downloads the prebuilt engine from the GitHub release
```

Run it on a phone with the **prebuilt dev app** (Expo Go style — no native build):

```bash
npm run dev-app:android   # or dev-app:ios — installs + launches the dev app,
                          # which hot-reloads from your dev server
```

Adding your own native modules? `npm run prebuild` scaffolds native shells, then `npm run dev-client:android` builds your **custom dev client** (expo-dev-client style) — only the thin shell compiles; the engine stays prebuilt.

> Packages aren't on npm yet — they install straight from GitHub (the scaffold wires the `@rayact/*` deps to `github:raythings/…`), and the prebuilt engine is fetched from the GitHub release on first build.

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

The same file runs unchanged on every platform.

## Platform support

| Platform | Arch | GPU backend |
|----------|------|-------------|
| macOS (Apple Silicon & Intel) | x64 / arm64 | Metal |
| iOS (device & simulator) | arm64 | Metal |
| Android | arm64 | Vulkan |
| Linux | x64 | Vulkan |
| Web | wasm32 | WebGPU |
| Windows | x64 | DX12 *(coming soon)* |

**64-bit only** — 32-bit is not planned.

Every backend **emulates the OpenGL 3.3 API 1:1** (with a few minor quirks), so the renderer behaves the same whether it's running on Metal, Vulkan, or WebGPU.

## What's included

- **Components** — `View`, `Text`, `Button`, `ScrollView`, `FlatList`, `TextInput`, `Image`, and a Material 3 set.
- **Navigation** — real `react-navigation` via `@rayact/navigation`.
- **Styling** — flexbox, CSS, Tailwind (`className`), transitions, and automatic dark mode.
- **Native & WASM modules** — storage, secure storage, and a module ABI for your own native code or WebAssembly workers (a fast incremental build, not an engine rebuild).

## CLI

```text
rayact dev                Start the dev server
rayact run:desktop        Run a native desktop window
rayact build --android    Build an APK            (--install to deploy)
rayact build --ios        Build an iOS app        (--install to deploy)
rayact build --web        Build a WebGPU/WASM bundle
rayact build --release    Production bundle (QuickJS bytecode)
```

Run `rayact --help` for everything.

## Documentation

- [Getting started](docs/guide/getting-started.md) · [Installation](docs/guide/install.md)
- [CLI](docs/reference/cli.md) · [Configuration](docs/reference/config.md) · [Packages](docs/reference/packages.md)

## License

MIT — see [LICENSE](LICENSE).
