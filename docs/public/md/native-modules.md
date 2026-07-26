# Native modules

Native modules are optional native capabilities shipped as separate packages —
each carries its own prebuilt binaries per platform and autolinks into your
app. The engine's module bus loads them at startup (`dlopen` on desktop,
packaged libraries on Android/iOS, built-in stubs on web).

## Installing

Add them like any other `@rayact/*` package (vendored from the release set in
a scaffolded project):

- `@rayact/mmkv` — fast persistent key-value storage (MMKV)
- `@rayact/secure-store` — Keychain/Keystore-backed secret storage
- `@rayact/crash-reporter` — native crash capture with local reports

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

Synchronous, string-valued, persisted in the app's data directory. Backed by
`localStorage` on web.

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
