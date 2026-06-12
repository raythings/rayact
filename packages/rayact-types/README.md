# @rayact/types

Ambient TypeScript declarations for the global APIs the rayact native engine
injects into every JS context (main runtime + workers): `Storage`,
`AsyncStorage`, the module bus (`__rayact_invoke` / `__rayact_invoke_async`),
workers (`spawnWorker`, `postToWorker`, `onWorkerMessage`), `initRaylib`, and the
asset/`createAsset` shape.

rayact is **not** a browser and **not** Node — it provides its own host globals.
So target `ES2020` (no `DOM`) and let this package supply the host globals plus
the few web-ish ones the engine exposes (`console`, timers,
`TextEncoder`/`TextDecoder`). Avoid pulling `@types/node` or `DOM` into app code,
or `Storage`/`console`/`TextEncoder` will clash with their web definitions.

## Usage

Add to the app `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "lib": ["ES2020"],
    "types": ["@rayact/types"]   // excludes auto-included @types/node
  }
}
```

…or reference per file:

```ts
/// <reference types="@rayact/types" />
Storage.set("k", "v");
const v = Storage.getString("k");
const buf = __rayact_invoke("kv", "get", new TextEncoder().encode("k").buffer);
```
