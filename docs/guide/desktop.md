# Desktop (macOS & Linux)

The desktop host is a prebuilt native binary (`rayact_desktop`) — Metal-backed on
macOS, Vulkan on Linux — that runs your bundle directly. No Electron, no
webview: the window is a raylib surface painted by the raym3 renderer.

Supported hosts in 0.0.4: **macOS arm64** and **Linux x64** (preview). macOS
x64 is not shipped this release.

## Develop

```sh
npm run desktop        # rayact dev --desktop: dev server + native window, HMR
npm run start:dev      # rayact start --dev: window against an already-running dev server
```

The dev host connects to the dev server, hot-reloads on edit, and exposes the
[dev platform](/dev-platform) overlay (dev menu, element inspector, console).

## Debug build

```sh
rayact build --debug --desktop --out dist-debug
```

Produces a runnable app directory without release stripping — useful when you
want a build artifact but still readable stack traces.

## Release build

```sh
npm run build:desktop        # rayact build --release --desktop
```

Output (in `dist/` by default):

| File | Purpose |
| --- | --- |
| `rayact_desktop` (or `rayact_release`) | The host binary, copied next to your app |
| `app.rayactpack` | Single-file container: bytecode bundle + CSS + fonts + images ([format](/reference/rayactpack)) |
| `app.qjsbc` / `bundle.qjsbc` | The QuickJS bytecode bundle (also inside the pack) |
| `native-modules.json` | Which native modules the host should load |
| `modules/` | Bundled native plugin dylibs/sos (mmkv, secure-store, …) if the app uses them |
| `resources/fonts/` | Icon + emoji fonts the host loads at startup |

Run it:

```sh
cd dist && ./rayact_desktop app.rayactpack
```

The bytecode compile and packing steps run through the headless `rayact_tool`
binary (shipped in the host prebuilt since 0.0.4), so CI machines without a
display or GPU can produce desktop releases; only *running* the app needs one.

## Distribution notes

- The release host (`rayact_release`) strips every development entry point —
  no dev-server discovery, no HMR, no CDP inspector.
- Ship the whole output directory; the host resolves `app.rayactpack`,
  `modules/` and `resources/` relative to its own location.
- macOS: the binary is not notarized by the build; sign/notarize with your own
  identity before distributing outside your machine.
