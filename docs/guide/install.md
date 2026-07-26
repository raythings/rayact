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

The CLI resolves the desktop host (`rayact_desktop`) in this order:

1. an explicit `--desktop-bin` / `RAYACT_DESKTOP_BIN`,
2. an installed `@rayact/prebuilt-<platform>-<arch>` package in `node_modules`,
3. the per-user cache `~/.rayact/prebuilts/<version>/<platform>-<arch>/`,
4. a source-tree `build/bin/rayact_desktop` fallback for maintainers.

If none are present, `rayact prebuild` downloads the matching prebuilt from the
GitHub release for your engine version and verifies it against `SHA256SUMS`.

```sh
rayact prebuild   # ensure the host binary is available (resolve or download)
```

The desktop prebuilts are wired as `optionalDependencies` of `@rayact/cli` with
`os`/`cpu` fields, so a package manager installs only the one matching your
machine. Android and iOS engine libraries are pulled per-project when you target
those platforms (kept off desktop installs — the Android engine alone is ~80 MB).

## npm installation

Use npm for `0.0.4`. The prebuilt resolver prefers installed platform packages
and falls back to the matching, checksummed GitHub Release artifact:

```sh
npx create-rayact-app@0.0.4 my-app
```

The release attaches the exact npm tarball for every publishable package. If npm
is unavailable, run the scaffolder tarball directly:

```sh
npx https://github.com/raythings/rayact/releases/download/v0.0.4/create-rayact-app-0.0.4.tgz my-app
```

Override the download source with environment variables when needed:

| Variable | Purpose |
| --- | --- |
| `RAYACT_DESKTOP_BIN` | Use a specific host binary |
| `RAYACT_CACHE_DIR` | Where downloaded prebuilts are cached |
| `RAYACT_PREBUILT_BASE_URL` | Alternate release/CDN base URL |
| `RAYACT_PREBUILT_TAG` | Release tag to download from |
