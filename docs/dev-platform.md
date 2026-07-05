# Rayact Dev Platform

## Create a new app

```bash
npx github:raythings/create-rayact-app#v0.0.1 my-app
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

# With Android adb reverse (8081 + 9229)
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

CLI flags override config: `--minify`, `--no-minify`, `--bytecode`, `--no-bytecode`.

## Dev client

Debug Android and iOS custom dev-client builds embed `@rayact/dev-client`; the prebuilt dev app uses the same launcher UI:

- **Connect** — enter dev server URL or scan QR
- **Recent** — persisted URLs with reachability
- **Discover** — mDNS `_rayact._tcp` (Android NSD)

Native bridge: global `devCall(method, data, callback)` is wired to the platform dev-client bridge on Android/iOS.

## HMR

- WebSocket `/rayact/hmr` — primary transport
- HTTP `/rayact/status` poll — fallback
- Bytecode incompatible with React Fast Refresh; dev server serves JS when HMR clients are connected

## Chrome DevTools (CDP)

Set `RAYACT_DEBUG=1` or `RAYACT_DEVTOOLS=1` to start CDP on port 9229 (override with `RAYACT_CDP_PORT`).

```bash
adb reverse tcp:9229 tcp:9229
```

Open `chrome://inspect` — Rayact exposes `/json/list` and `/json/version`.

## Inspector

In-app element tree via `getNodeTree()` native API. Toggle from dev menu. Selected nodes highlight with a magenta border.
