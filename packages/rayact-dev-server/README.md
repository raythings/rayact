# @rayact/dev-server

The Rayact Vite development server, bundler, HMR coordinator, native-module
asset server, CDP proxy, Web host bridge, and terminal UI.

```sh
rayact dev                 # desktop context
rayact dev --android
rayact dev --ios
rayact dev --web
```

One process maintains revisioned bundle contexts for desktop, Android, iOS, and
Web. A context includes the transformed module graph, file-based route tree,
CSS/assets, native capability requirements, browser registration scripts, and
side-module WASM. HMR invalidates only affected modules and falls back to a full
reload for config, route-set, or capability changes.

The interactive TUI can launch desktop, Android, iOS, Web, React DevTools, and
the element inspector. Desktop launch passes the active URL in both
`--dev-server` and `RAYACT_DEV_SERVER`; scripted or remote launches can set the
same environment variable directly.

Non-interactive control endpoints:

- `GET /rayact/manifest.json?platform=<desktop|android|ios|web>`
- `GET /rayact/status`
- `POST /rayact/reload`
- `GET /rayact/devtools/rn_fusebox.html`

The Web bridge serves the WASM/WebGPU host with COOP/COEP and injects the dev
origin through `?dev=<origin>`, allowing the browser shell to prefetch the
manifest and entry before the engine initializes.
