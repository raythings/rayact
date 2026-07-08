# Installation

Rayact splits into small `@rayact/*` JavaScript packages plus per-platform
**prebuilt native hosts**. App builds never compile C++ — the right prebuilt is
resolved or downloaded for you.

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

## Git now, npm later

Until the packages are on the npm registry, install the framework packages from
GitHub refs and let the prebuilt resolver fetch native hosts from GitHub
releases:

```sh
npx https://github.com/raythings/rayact/releases/download/v0.0.1/rayact-0.0.1.tgz init my-app
```

The release also attaches an `npm pack` tarball for every publishable package, so
generated templates can reference those tarball URLs in the interim.

Override the download source with environment variables when needed:

| Variable | Purpose |
| --- | --- |
| `RAYACT_DESKTOP_BIN` | Use a specific host binary |
| `RAYACT_CACHE_DIR` | Where downloaded prebuilts are cached |
| `RAYACT_PREBUILT_BASE_URL` | Alternate release/CDN base URL |
| `RAYACT_PREBUILT_TAG` | Release tag to download from |
