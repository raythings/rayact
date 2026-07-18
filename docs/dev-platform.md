# Rayact Dev Platform

## Create a new app

```bash
npx create-rayact-app@0.0.3 my-app
cd my-app && npm install
npm run dev
```

Or from the monorepo:

```bash
rayact init my-app
cd my-app && npm install
```

## Quick start (monorepo)

```bash
# Start dev server + Ink TUI
npm run dev

# With Android adb reverse for the development server (8081)
npm run rayact -- dev --android

# Build debug APK with embedded dev launcher
npm run rayact -- build --debug --android --install

# Build release with minify + bytecode
npm run rayact -- build --release --android

# Verify desktop / Android / Web
npm run verify
npm run verify:android
npm run verify:web
```

## Configuration

Project settings live in `rayact.config.json`:

- `rayactAppKey` — manifest identity for pairing
- `devServer.host` / `devServer.port` / `devServer.cdpPort`
- `transform.minify` / `transform.bytecode` per mode (dev, debug, release)

CLI flags override config in development/debug: `--minify`, `--no-minify`, `--bytecode`, `--no-bytecode`. Release bytecode cannot be disabled.

## Dev client

Debug Android, iOS, and desktop custom dev-client builds embed `@rayact/dev-client`; the prebuilt dev app uses the same launcher UI:

- **Connect** — enter dev server URL or scan QR
- **Recent** — persisted URLs with reachability
- **Discover** — mDNS `_rayact._tcp` (Android NSD, Apple Bonjour, and Avahi's DNS-SD compatibility API on Linux)

When discovery resolves a server, native clients prefetch its revision-tagged
bootstrap, entry module, and bounded startup assets. The project transition
keeps a loading surface visible while the runtime swaps, and cached files are
only consumed when the current manifest revision still matches.

Web browsers cannot open raw mDNS sockets. The web dev URL therefore carries
the already-resolved server in `?dev=<origin>`; the shell starts the equivalent
manifest-first prefetch immediately, before WASM initialization. Only the
bootstrap and entry module gate startup, while bounded asset warming continues
in the background.

Native bridge: global `devCall(method, data, callback)` is wired to the platform dev-client bridge on Android/iOS.

### Native-module selection

`packages/first-party-modules.json` is the canonical catalog for the official
Dev App. Its capability/config files are generated from that catalog, and the
publication workflow invokes every catalog smoke test on an iOS simulator.
Publication fails if a wrapper/artifact is missing or the recorded on-device
evidence is stale or incomplete.

`rayact prebuild` follows the project's installed dependency graph and resolves
packages that declare `package.json#rayact.manifest` and a `rayact.module.json` manifest. Android
`.so` files, iOS `.xcframework`/`.framework`/`.a` files, and macOS/Linux shared
libraries are copied into the generated client automatically. Explicit
`nativeModules` entries in `rayact.config.json` can add configuration or narrow
the generated capability manifest.

Web/WASM cannot load mobile or desktop dynamic libraries. A module selected for
Web must list `web` in `platforms` and provide a JS/WASM implementation already
linked into the Web host; builds fail when a selected module does not advertise
Web support.

## Release mode

Release Android and iOS builds use dedicated embedded-project entry points.
They do not start the launcher or register discovery, HMR, inspector, or remote
debug transports. Android additionally removes local-network/cleartext
permissions and its QR-scanner dependency. Web release hosts are built with
`npm run build:web-release-host`; the dev loader, manifest/HMR fetches, URL
bootstrap, and fallback demo are compiled out, while static exports also fail
closed if their generated HTML contains a development marker. Desktop release
hosts are built separately without discovery/dev-loader sources and start the
embedded project bundle directly.

Run `rayact doctor` before prebuilding or releasing to check native toolchains,
prebuilt manifests and module ABI compatibility, signing prerequisites, and
WebGPU/COOP/COEP hosting requirements.

## HMR

- WebSocket `/rayact/hmr` — primary transport
- HTTP `/rayact/status` poll — fallback
- Bytecode incompatible with React Fast Refresh; dev server serves JS when HMR clients are connected

## Chrome DevTools (CDP)

The development server binds its InspectorProxy to `127.0.0.1:9229` (falling
back to Chrome's other default discovery port, `9222`). Android and iOS project
sessions connect outbound to `/rayact/devtools/device`; no device-side CDP port
or ADB forward/reverse for 9229 is used.

Open `chrome://inspect` with **Discover network targets** enabled. Rayact serves
`/json/list` and `/json/version` from the loopback InspectorProxy, and every
connected project session appears as a separate target.

## Rayact DevTools

The dev server exposes a pinned React-Native-derived DevTools frontend at
`/rayact/devtools/rn_fusebox.html`. The dev TUI opens it with `t` and the
development manifest publishes `devtoolsFrontendUrl`. It connects to the same
loopback CDP target as `chrome://inspect`, but is the supported frontend for
Rayact's non-browser renderer.

Elements contains native Rayact host nodes only; the developer overlay is
excluded. Sources shows the exact transformed modules currently evaluated by
QuickJS (including HMR revisions) and is read-only until QuickJS gains real
breakpoint/step support. Performance exposes live frame and QuickJS heap
metrics rather than a sampling flame chart.

## Inspector

In-app element tree via `getNodeTree()` native API. Toggle from dev menu. Selected nodes highlight with a magenta border.
