# Rayact Dev Platform

## Create a new app

```bash
npx create-rayact-app my-app
cd my-app && npm install
npm run dev
```

**Tier 1 — zero native (default):** use the prebuilt dev app:

```bash
npx @rayact/dev-app install --platform android
npm run dev   # scan QR in the dev app
```

**Tier 2 — custom dev-client:**

```bash
npx create-rayact-app my-app --dev-client
cd my-app && npm run dev
rayact build --debug --android --install
```

**Tier 3 — production host:**

```bash
npx create-rayact-app my-app --with-native
rayact prebuild --production
rayact build --release --android
```

Or from the monorepo:

```bash
rayact init my-app --dev-client
cd my-app && npm install
```

## Prebuilt native libraries

Engine and plugins ship via npm (`@rayact/prebuilt-android-arm64`, `@rayact/mmkv`, …).  
`rayact prebuild` copies thin `android/` + `ios/` shells and links prebuilt `.so` / `.xcframework` files — **no QuickJS/raylib compile on your machine**.

Monorepo maintainers refresh prebuilts:

```bash
node scripts/build-prebuilts.mjs --target all   # Docker + macOS
./scripts/verify-prebuilts.sh
```

See [maintainer-prebuilts.md](maintainer-prebuilts.md) for Docker/macOS split and dev-app IPA workflow.

## WASM vs native — when do you need a custom dev-client?

| Need | Dev App (Tier 1) | WASM worker | Custom dev-client |
|------|------------------|-------------|-------------------|
| Hashing / crypto / parsing | — | `spawnWorker('x.wasm')` | Not needed |
| Fast KV (`mmkv`) | bundled | via `sys_invoke` → host plugin | if not in host |
| Keychain / secure store | bundled | no | yes |
| Custom BLE / NFC / HAL | no | no | yes |

WASM workers are enabled by default in prebuilt Android hosts (`rayactWasm=true`).

## Quick start (monorepo)

```bash
npm run dev
npm run rayact -- dev --android
npm run rayact -- build --debug --android --install
npm run build:prebuilts
```

## Configuration

Project settings live in `rayact.config.json`:

- `rayactAppKey` — manifest identity for pairing
- `devServer.host` / `devServer.port` / `devServer.cdpPort`
- `nativeModules` — plugins the project requires (compatibility-checked against dev app)
- `android.projectDir` / `ios.projectDir` — set by `rayact prebuild`
- `transform.minify` / `transform.bytecode` per mode (dev, debug, release)

Bundled assets are staged in `rayact-assets/` (shared by Android and iOS thin templates).

## Dev client

Debug Android builds embed `@rayact/dev-client`:

- **Connect** — enter dev server URL or scan QR
- **Recent** — persisted URLs with reachability
- **Discover** — mDNS `_rayact._tcp` (Android NSD)
- **Compatibility** — engine version + native module manifest vs host

Native bridge: global `devCall(method, data, callback)` wired to Kotlin `DevClientBridge` on Android.

## Dev App distribution

- **Now:** GitHub Releases sideload + `npx @rayact/dev-app install --platform android`
- **Follow-up:** Play Store internal testing + TestFlight

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
