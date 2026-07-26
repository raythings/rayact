# Web

The entire engine — QuickJS, the raym3 renderer, and the rlwg WebGPU raylib
backend — compiles to a single WebAssembly module. Your app runs unchanged in
the browser, painted onto a canvas with WebGPU (4× MSAA), falling back to a
WebGL2 host build where WebGPU is unavailable.

## Develop

```sh
npm run web    # rayact dev --web
```

Starts the dev server plus a COOP/COEP proxy (default port 8768) and opens the
dev host. Edits hot-reload like every other platform.

## Release build

```sh
npm run build:web    # rayact build --release --web
```

Output in `dist/web/`:

| File | Purpose |
| --- | --- |
| `rayact.html` / `index.html` | Host page (release-sanitized: no dev bootstrap) |
| `rayact.js` + `rayact.wasm` | The engine |
| `app.qjsbc` (or `app.js`) | Your bundle, compiled to QuickJS bytecode |
| `app-assets.json` | Manifest of runtime files the host preloads into MEMFS |
| `rayact-assets/…`, `assets/…` | Staged CSS and bundled assets (worker `.wasm`, images) |

The host fetches `app-assets.json` before boot and copies every listed file
into the WASM filesystem, so `importCSS(...)`, `spawnWorker(...)` and asset
reads behave exactly as they do natively.

## Serving — COOP/COEP required

WebGPU + SharedArrayBuffer require a **cross-origin isolated** page. Serve with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`rayact serve` does this for you:

```sh
rayact serve dist/web --web-port 8771
```

For production, set the two headers in your web server/CDN config. Everything
is static files — any host works once the headers are right.

## Canvas sizing

The browser owns the canvas resolution: the page sets the backing store to
CSS size × devicePixelRatio and the engine treats it as read-only, so zoom,
resize and fractional-DPI displays stay crisp. Mouse-wheel events scroll
`ScrollView`s natively.

## WASM workers need the pthreads host

`spawnWorker()` with a `.wasm` worker runs the worker on a real thread, which on
the web requires SharedArrayBuffer — a **pthreads-enabled host build**. The
release attaches `rayact-web-pthreads-<version>.tar.gz`; point builds at it:

```sh
RAYACT_WEB_HOST_DIR=/path/to/pthreads-host npm run build:web
```

The default host stays non-pthreads (the dev module loader is incompatible with
pthreads), so apps without WASM workers need nothing special. JS-side code and
worker *views* work on both hosts; only spawning WASM/native workers needs the
pthreads variant.

## Limitations on web

- `@rayact/mmkv` / `@rayact/secure-store` native modules are stubbed to
  in-memory/`localStorage`-backed KV.
- File-system paths refer to the in-memory MEMFS staged from `app-assets.json`.
