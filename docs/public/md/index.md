# Rayact

Rayact is a cross-platform React renderer with a native raylib + QuickJS backend. You write React (with `react-navigation`, CSS, Material components) and it renders natively on desktop, Android, iOS, and the web — no DOM, no platform WebView.

## Highlights

- **Real React 19** via a custom `react-reconciler` host config.
- **Native rendering** through raylib / raym3 (Flexbox via Yoga, Material 3, CSS).
- **QuickJS** engine with ahead-of-time **bytecode** (`.qjsbc`) for instant release boot.
- **One container** — release apps ship a single [`.rayactpack`](/reference/rayactpack) carrying bytecode + CSS + icons + images.
- **Prebuilt native hosts** delivered per platform, so app builds need no C++ toolchain.

## Quick start

Rayact ships as GitHub release tarballs (not on the npm registry) — the
scaffolder vendors everything your project needs:

```sh
npx https://github.com/raythings/rayact/releases/download/v0.0.4/create-rayact-app-0.0.4.tgz \
  my-app --release-url https://github.com/raythings/rayact/releases/download/v0.0.4
cd my-app
npm run dev            # dev server + TUI + QR
```

Then build and run:

```sh
rayact run --desktop   # build + launch on desktop
rayact run --android   # build + install + launch on a device
rayact build --release # release bundle (bytecode + container)
```

See [Getting started](/guide/getting-started), [Installation](/guide/install),
the platform guides ([desktop](/guide/desktop), [Android](/guide/android),
[iOS](/guide/ios), [web](/guide/web)), and the
[components reference](/reference/components).
