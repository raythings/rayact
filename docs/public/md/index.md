# Rayact

Rayact is a cross-platform React renderer with a native raylib + QuickJS
backend. You write React with navigation, CSS, and Material components, and it
renders directly on desktop, Android, iOS, and the web. Native apps do not run
inside a WebView; WebView is an explicit native component when an app needs one.

## Highlights

- **Real React 19** via a custom `react-reconciler` host config.
- **Native rendering** through raylib / raym3 (Flexbox via Yoga, Material 3, CSS).
- **New Windows x64 support** with a prebuilt Vulkan host and portable dev app.
- **OS-native components** including real text editing/IME and native WebView
  engines: Android WebView, Apple WebKit, and Windows CEF.
- **First-party native modules** for sensors, barcode scanning, clipboard,
  haptics, image picking, linking, SVG, storage, security, crash reporting, and
  WebView.
- **QuickJS** engine with ahead-of-time **bytecode** (`.qjsbc`) for instant release boot.
- **One container** — release apps ship a single [`.rayactpack`](/reference/rayactpack) carrying bytecode + CSS + icons + images.
- **Prebuilt native hosts** delivered per platform, so app builds need no C++ toolchain.

## Quick start

Install the lockstep 0.0.5 packages from GitHub Releases:

```sh
RELEASE=https://github.com/raythings/rayact/releases/download/v0.0.5
npx "$RELEASE/create-rayact-app-0.0.5.tgz" my-app --release-url "$RELEASE"
cd my-app
npm run dev            # dev server + TUI + QR
```

The scaffolder verifies and vendors the release tarballs before running the
project-local npm install.

Then build and run:

```sh
rayact run --desktop   # build + launch on desktop
rayact run --android   # build + install + launch on a device
rayact build --release # release bundle (bytecode + container)
```

See [Getting started](/guide/getting-started), [Installation](/guide/install),
the platform guides ([desktop](/guide/desktop), [Windows](/guide/windows), [Android](/guide/android),
[iOS](/guide/ios), [web](/guide/web)), and the
[components reference](/reference/components). See [Native modules](/native-modules)
for the complete autolinked module set.
