# Installation

Rayact splits into small `@rayact/*` JavaScript packages plus per-platform
**prebuilt native hosts**. App builds never compile C++ — the right prebuilt is
resolved or downloaded for you.

## Requirements

**Node >=22 <25.** Every `rayact` command checks the running Node version and
exits with an error outside that range. npm only emits a passive `EBADENGINE`
warning at install time, which is easy to miss and does not catch switching Node
after install — so the CLI enforces it directly. On a newer Node, run
`nvm use 24`.

## Distribution model

Rayact ships as **GitHub release assets** — the `@rayact/*` packages are not on
the npm registry. Each release (`https://github.com/raythings/rayact/releases`)
attaches:

- the npm tarball for every publishable package (`rayact-*.tgz`),
- the prebuilt native engines (`rayact-prebuilt-*.tgz`),
- the web hosts (`rayact-web-<version>.tar.gz`, plus a
  `rayact-web-pthreads-<version>.tar.gz` variant for WASM workers),
- the dev apps (`rayact-dev-app.apk`, simulator zip, unsigned device ipa),
- `release-set.json` (canonical index with per-file SHA-256) and a
  `release-set.sig` ed25519 signature, plus `SHA256SUMS`.

New projects vendor the JS tarballs via `create-rayact-app --release-dir` /
`--release-url` — see [Getting started](/guide/getting-started). The generated
`package.json` uses `file:` dependencies plus an `overrides` block so npm never
consults the public registry for lockstep packages.

## Required packages {#required-packages}

`create-rayact-app` puts all of these in a new project's `package.json`. If you
are wiring a project by hand or upgrading an older one, add them yourself — each
is needed by a specific command, and missing ones only surface when you run it:

| Package | Needed by |
| --- | --- |
| `rayact`, `react` | The app itself (runtime + component APIs) |
| `@rayact/dev-server` | `rayact dev` and the Vite config |
| `@rayact/template-android`, `@rayact/template-ios` | `rayact prebuild` — **both** are required even for a desktop-only build, because prebuild materializes the native project templates up front |
| `@rayact/dev-client` | The mobile dev-client overlay served at `entry.js?platform=android` / `?platform=ios` |

`rayact doctor` verifies these are installed and resolvable, and names any that
are missing.

## Prebuilt resolution

Two binaries matter on the host machine: **`rayact_desktop`** (the runtime that
opens a window) and **`rayact_tool`** (the headless build toolchain that
compiles bytecode and writes `.rayactpack` containers — new in 0.0.4). Both ship
inside the host prebuilt package.

The CLI resolves them in this order:

1. an explicit `--desktop-bin` / `RAYACT_DESKTOP_BIN` (runtime) or
   `--tool-bin` / `RAYACT_TOOL_BIN` (toolchain),
2. an installed `@rayact/prebuilt-<platform>-<arch>` package in `node_modules`,
3. the per-user cache `~/.rayact/prebuilts/<version>/<platform>-<arch>/`,
4. a source-tree `build/bin/` fallback for maintainers.

If none are present, `rayact prebuild` downloads the matching prebuilt from the
GitHub release for your engine version and verifies it against `SHA256SUMS`.
Pre-0.0.4 prebuilt caches have no `rayact_tool`; builds fall back to
`rayact_desktop --compile` with a deprecation warning.

```sh
rayact prebuild   # ensure the host binaries are available (resolve or download)
```

Android and iOS engine libraries are pulled per-project when you target those
platforms (kept off desktop installs — the Android engine alone is ~80 MB).

## Environment overrides

| Variable | Purpose |
| --- | --- |
| `RAYACT_DESKTOP_BIN` | Use a specific desktop host binary |
| `RAYACT_TOOL_BIN` | Use a specific build-tool binary |
| `RAYACT_CACHE_DIR` | Where downloaded prebuilts are cached |
| `RAYACT_PREBUILT_BASE_URL` | Alternate release/CDN base URL (e.g. an internal mirror) |
| `RAYACT_PREBUILT_TAG` | Release tag to download from |
| `RAYACT_WEB_HOST_DIR` | Directory containing `rayact.html/js/wasm` for web builds |

## Verifying a download

Every release ships `SHA256SUMS` and a signed `release-set.json`:

```sh
node node_modules/@rayact/cli/dist/../../scripts/verify-release-set.mjs <release-dir>   # from a checkout: node scripts/verify-release-set.mjs <release-dir>
shasum -a 256 -c SHA256SUMS
```

The ed25519 public key is committed at `scripts/release-public-key.pem` in the
repository; `verify-release-set.mjs` uses it automatically (override with
`RAYACT_RELEASE_PUBLIC_KEY`).
