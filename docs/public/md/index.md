# Rayact

Rayact is a cross-platform React renderer with a native raylib + QuickJS backend. You write React (with `react-navigation`, CSS, Material components) and it renders natively on desktop, Android, iOS, and the web — no DOM, no platform WebView.

## Highlights

- **Real React 19** via a custom `react-reconciler` host config.
- **Native rendering** through raylib / raym3 (Flexbox via Yoga, Material 3, CSS).
- **QuickJS** engine with ahead-of-time **bytecode** (`.qjsbc`) for instant release boot.
- **One container** — release apps ship a single [`.rayactpack`](/reference/rayactpack) carrying bytecode + CSS + icons + images.
- **Prebuilt native hosts** delivered per platform, so app builds need no C++ toolchain.

## Quick start

```sh
npx create-rayact-app my-app
cd my-app && npm install
npm run dev            # dev server + TUI
```

Then build and run:

```sh
rayact run --desktop   # build + launch on desktop
rayact run --android   # build + install + launch on a device
rayact build --release # release bundle (bytecode + container)
```

See [Getting started](/guide/getting-started), [Installation](/guide/install), and the [CLI reference](/reference/cli).
