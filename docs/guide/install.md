# Installation

Rayact splits into small `@rayact/*` JavaScript packages plus per-platform
**prebuilt native hosts**. App builds never compile C++ — the right prebuilt is
resolved or downloaded for you.

## Prebuilt resolution

The CLI resolves the desktop host (`rayact_desktop`) in this order:

1. an explicit `--desktop-bin` / `RAYACT_DESKTOP_BIN`,
2. a source-tree `build/bin/rayact_desktop` (maintainers),
3. an installed `@rayact/prebuilt-<platform>-<arch>` package in `node_modules`,
4. the per-user cache `~/.rayact/prebuilts/<version>/<platform>-<arch>/`.

If none are present, `rayact prebuild` downloads the matching prebuilt from the
GitHub release for your engine version and verifies it against `SHA256SUMS`.

```sh
rayact prebuild   # ensure the host binary is available (resolve or download)
```

The native host is **not** installed from a package registry. The CLI's prebuild
resolver downloads the matching host (and the Android/iOS engine libraries when
you target those platforms) from the GitHub release for your engine version,
verified against `SHA256SUMS`. The Android engine alone is ~80 MB, so it's pulled
per-project only when you build for Android — never on a desktop install.

## Git now, npm later

The `@rayact/*` packages are **not on the npm registry yet** — they install
straight from GitHub. Scaffold with the github spec:

```sh
npx github:raythings/create-rayact-app#v0.0.1 my-app
```

The generated `package.json` pins every `@rayact/*` dependency to
`github:raythings/<repo>#v0.0.1`, so a plain `npm install` pulls the JS packages
from GitHub, and the first build downloads the prebuilt native host from the
release. No npm account or registry config is required.

Override the download source with environment variables when needed:

| Variable | Purpose |
| --- | --- |
| `RAYACT_DESKTOP_BIN` | Use a specific host binary |
| `RAYACT_CACHE_DIR` | Where downloaded prebuilts are cached |
| `RAYACT_PREBUILT_BASE_URL` | Alternate release/CDN base URL |
| `RAYACT_PREBUILT_TAG` | Release tag to download from |
