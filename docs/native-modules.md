# Native modules

Native modules are optional native capabilities shipped as separate packages —
each carries its own prebuilt binaries per platform and autolinks into your
app. The engine's module bus loads them at startup (`dlopen` on desktop,
packaged libraries on Android/iOS, browser scripts on web — see
[Web modules](#web-modules)).

## Installing

Add them like any other `@rayact/*` package vendored from the release set.
Rayact 0.0.5 includes:

- `@rayact/sensors` — accelerometer, gyroscope, magnetometer, device motion,
  and orientation streams
- `@rayact/barcode-scanner` — native barcode and QR scanning
- `@rayact/clipboard` — platform clipboard reads and writes
- `@rayact/haptics` — selection, impact, and notification feedback
- `@rayact/image-picker` — platform image-library picker
- `@rayact/linking` — external URLs, initial URLs, and deep-link events
- `@rayact/webview` — Android WebView, Apple WebKit, Windows CEF, and Web
- `@rayact/svg` — retained native SVG rendering
- `@rayact/mmkv` — fast persistent key-value storage
- `@rayact/secure-store` — Keychain/Keystore-backed secret storage
- `@rayact/crash-reporter` — native crash capture with local reports

The official dev app includes all supported first-party capabilities, while
production apps autolink only the packages they declare.

Each package owns a `rayact.module.json` manifest; autolinking follows your
declared dependencies and verifies artifact SHA-256s. It never scans arbitrary
`node_modules` folders. After adding one, re-run `rayact prebuild` so native
projects pick it up; `rayact doctor` shows what's linked.

## Configuring

`rayact.config.json` can disable or configure a module:

```json
{
  "nativeModules": [
    "@rayact/mmkv",
    { "package": "@rayact/crash-reporter", "enabled": true, "configuration": { "mode": "local" } },
    { "package": "@rayact/secure-store", "enabled": false }
  ]
}
```

Legacy `{ "name", "lib", "jsPackage" }` entries warn in 0.0.x. Run
`rayact migrate`, then `npm install`, to update imports/config and regenerate
native projects.

## APIs

### Built-in KV (`rayact/kv`) — no extra binary

```ts
import { KV } from 'rayact/kv';

KV.set('theme', 'dark');
KV.get('theme');      // 'dark' | undefined
KV.has('theme');      // boolean
KV.delete('theme');
```

Synchronous, string-valued, persisted in the app's data directory — and on web
in `localStorage`, one entry per key under `rayact_kv:`. Values are obfuscated
at rest on web (see [Storage on web](#storage-on-web)); keys are not.

### `@rayact/mmkv`

```ts
import { MMKV } from '@rayact/mmkv';

const storage = new MMKV('settings');        // instance id, 'default' if omitted
storage.set('count', 3);                     // string | number | boolean
storage.getString('name'); storage.getNumber('count'); storage.getBoolean('flag');
storage.contains('count'); storage.delete('count'); storage.clearAll();
```

Same surface shape as react-native-mmkv's core API — synchronous and fast
enough for hot paths.

### `@rayact/secure-store`

```ts
import * as SecureStore from '@rayact/secure-store';

await SecureStore.setItemAsync('token', jwt);
const token = await SecureStore.getItemAsync('token');   // string | null
await SecureStore.deleteItemAsync('token');
```

Values land in the platform keystore (macOS/iOS Keychain, Android Keystore).
Expo-secure-store-compatible signature.

### `@rayact/crash-reporter`

Captures native crashes and stores reports locally; see
[crash privacy](/crash-reporting) for what is (and is not) collected.

## Writing your own module

A module is a shared library exporting the Rayact module-bus entry point
(`rayact_module_register`) plus a package with `rayact.module.json` declaring
its artifacts per platform/architecture (path + sha256, ABI and engine ranges).
Study `@rayact/mmkv` in the repo as the reference implementation — the JS side
talks to native through the byte-oriented `sys_invoke` bus, which also reaches
WASM workers.

## Web modules

Web is not an exception to the rule that implementations live in their package.
A module contributes browser code by declaring a `web` block in
`rayact.module.json`:

```json
{
  "platforms": ["android", "ios", "web"],
  "architectures": ["arm64", "x86_64", "wasm32"],
  "web": { "script": "web/register.js" }
}
```

`rayact build --web` stages the script's **whole directory** to
`modules/<name>/` next to the app and injects a `<script>` tag ahead of the
engine; `rayact dev --web` serves the same directory at the same relative URLs.
Because the directory travels as a unit, a module that instantiates a `.wasm`,
spawns a worker, or fetches a JSON table simply refers to its own files
relatively and they resolve identically in both flows:

```js
// packages/<pkg>/web/register.js — sibling files come along
const wasm = await WebAssembly.instantiateStreaming(fetch(new URL('./codec.wasm', import.meta.url)));
```

(Note this is the only channel that works for such files: `app-assets.json`
stages into the wasm filesystem, which a browser `fetch()` and a `<script>` tag
cannot read.)

### Writing a web script

The script is plain JavaScript loaded with a `<script>` tag — no bundler, no
imports. It must **never touch `Module`**: it may load before or after the wasm
host, so registration goes through a queue the host drains.

```js
window.__rayactModuleRegistrations = window.__rayactModuleRegistrations || [];
window.__rayactModuleRegistrations.push(function (registry) {
  // Platform module: reached from JS via platformCall(name, method, payload, cb).
  // Handlers are synchronous — the caller reads the result on the same tick, so
  // anything genuinely async reports through a poll method (see @rayact/sensors).
  registry.registerModule('mymodule', function (method, payload) {
    if (method === 'ping') return 'pong';          // wrapped as { ok: true, value }
    return { ok: false, error: 'unknown: ' + method };
  });

  // Platform view: a real DOM element composited inside the rayact scene, the
  // peer of registerViewFactory on Android/iOS and register_view_factory on
  // desktop. The host owns geometry, clipping, hit-testing and overlays.
  registry.registerViewFactory('mykind', function (context) {
    const el = document.createElement('div');
    return {
      el,
      applyProps(props) { /* patch object; null means "prop removed" */ },
      dispose() {}
    };
  });
});
```

Views created before a factory registers are **parked and replayed** when it
arrives, so script load order can never break a module.

### What ships today

| Module | Browser API |
|---|---|
| `@rayact/webview` | sandboxed `<iframe>` + `postMessage` bridge |
| `@rayact/sensors` | `DeviceMotionEvent` / `DeviceOrientationEvent` |
| `@rayact/haptics` | Vibration API (no-op where unsupported) |
| `@rayact/linking` | `window.open`, scheme validation |
| `@rayact/svg` | none — renders natively (see below) |
| `@rayact/mmkv` | none — native side module over `localStorage` (see below) |

A module with no browser equivalent — `@rayact/secure-store`, because the browser
has no protected keystore — simply omits the `web` block and is rejected at build
time for a web target, rather than failing at runtime.

### Storage on web

Both the built-in `KV` and `@rayact/mmkv` persist to `localStorage`, one entry
per key (`rayact_kv:<key>` and `rayact_mmkv:<instance>:<key>`). Writes go through
immediately rather than being batched: a tab can close without any teardown hook
running, so a deferred write is a lost write.

**Key names are stored in the clear; values are obfuscated.** You can see what an
app stores in DevTools › Application › Local Storage, but not read the values out
of a browser profile directly. The obfuscation is a keystream XOR seeded from a
per-install random secret and a per-value nonce — deliberately not real
cryptography, because the only vetted primitive available (`SubtleCrypto`) is
Promise-only and both APIs are synchronous on every platform. It raises the cost
of casually reading stored data; it stops nothing that can run code on the page,
which can just call the same API. For genuine secrets use `@rayact/secure-store`
— the same advice as on Android and iOS, where MMKV is likewise unencrypted at
rest.

### Native web modules (`web.sources`)

A module whose implementation is native code does **not** ship browser JS. It ships
a **wasm side module** the host `dlopen`s at boot — the exact peer of the desktop
`.dylib` and the Android `.so`:

```json
{
  "web": {
    "sources": [
      "packages/rayact-svg/native/web_register.cpp",
      "packages/rayact-svg/native/svg_plugin.cpp",
      "third_party/raysvg/src/raysvg.cpp"
    ],
    "defines": ["RAYACT_SVG_USE_GPU_SHIM=1"]
  },
  "artifacts": [
    { "platform": "web", "architecture": "wasm32", "path": "web/wasm32/rayact_svg.wasm", "sha256": "…" }
  ]
}
```

`scripts/build-web-module-artifacts.sh` compiles the sources with
`-sSIDE_MODULE=1` into `web/wasm32/rayact_<name>.wasm` — an arch subfolder holding
only build output, mirroring `desktop/darwin-<arch>/`. The registration file is C++
and therefore lives in `native/` with the rest of the implementation (platform
folders hold platform-language bindings and artifacts, never C++); it exports the
same `rayact_module_register` entry every dlopen'd rayact module exports on every
platform. At runtime the page stages the
artifact's bytes into MEMFS and the host `dlopen`s it during boot, before the app
mounts (`native/web/web_plugin_loader.cpp`).

`@rayact/svg` takes this path. `<Svg>` is a render node, not a DOM element: it
lays out, clips, scrolls and z-orders like any other node, costs no composited
layer per instance, and produces identical pixels on every platform — none of
which a DOM `<svg>` inside a platform view could do. Its side module carries its
**own copy of raysvg** (the host contains none) and reaches the renderer through
the module ABI's GPU shim, so `web.defines` turns the shim on — `nativeDefines`
belongs to the desktop dylib and is deliberately not inherited.

Rules the side-module build lives by, each learned the hard way:

- **Runtime imports come from the host.** A side module carries no libc/libc++ of
  its own; everything it needs is the curated export surface in
  `native/web/module_sdk_exports.txt`. Engine symbols are deliberately absent —
  modules reach the engine only through the `RayactHost` function-pointer table.
  The build script verifies every artifact against the **built host**, because a
  listed symbol emcc dropped anyway (nothing referenced `__assert_fail`) passes
  the paper check and fails in the browser.
- **`-DNDEBUG` is load-bearing**, not a preference: `assert()` pulls in
  `__assert_fail`, which the host cannot be made to export.
- The host builds at **`-O2`** — wasm-opt at `-O3` strips the `__stack_pointer`
  export a MAIN_MODULE must provide, and every dlopen then fails with a
  `LinkError` about an "imported mutable global".

Because the loader is ordinary `dlopen`, this path is **open to third-party
modules**: ship the `.wasm` artifact in the package, no host relink involved. A
module that only needs browser APIs still ships `web.script` instead — it is
smaller, debuggable in devtools, and needs no emsdk.

> Use a **platform view** when you need the platform's *behaviour* (a real browser
> engine, native text editing and IME). Use **native code** when you only need
> *pixels*.
