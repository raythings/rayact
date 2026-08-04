# Desktop (macOS, Windows & Linux)

The desktop host is a prebuilt native binary (`rayact_desktop`) — Metal-backed on
macOS and Vulkan on Windows/Linux — that runs your bundle directly. No
Electron: the window is a raylib surface painted by the raym3 renderer.

Supported hosts in 0.0.5: **macOS arm64** and **Windows x64**. **Linux x64** is
preview. macOS x64 and Windows arm64 are not shipped this release.

Windows support is new in 0.0.5. Desktop rendering remains Rayact-native rather
than Electron, while components that require OS behavior use true platform
controls: `TextInput` delegates editing and IME to the operating system, and
`@rayact/webview` uses Apple WebKit or Windows CEF inside Rayact's layout,
clipping, and z-order.

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
| `rayact_desktop` / `.exe` (or `rayact_release`) | The host binary, copied next to your app |
| `app.rayactpack` | Single-file container: bytecode bundle + CSS + fonts + images ([format](/reference/rayactpack)) |
| `app.qjsbc` / `bundle.qjsbc` | The QuickJS bytecode bundle (also inside the pack) |
| `native-modules.json` | Which native modules the host should load |
| `modules/` | Bundled native plugin dylibs/sos (mmkv, secure-store, …) if the app uses them |
| `resources/fonts/` | Icon + emoji fonts the host loads at startup |

Run it:

```sh
cd dist && ./rayact_desktop app.rayactpack
```

On Windows, run `rayact_desktop.exe app.rayactpack` from PowerShell or Explorer.

The bytecode compile and packing steps run through the headless `rayact_tool`
binary (shipped in the host prebuilt since 0.0.5), so CI machines without a
display or GPU can produce desktop releases; only *running* the app needs one.

## Distribution notes

- The release host (`rayact_release`) strips every development entry point —
  no dev-server discovery, no HMR, no CDP inspector.
- Ship the whole output directory; the host resolves `app.rayactpack`,
  `modules/` and `resources/` relative to its own location.
- macOS: the binary is not notarized by the build; sign/notarize with your own
  identity before distributing outside your machine.
- Windows: distribute the complete directory. A selected WebView copies CEF,
  its subprocess, resources, and locales under `modules/`; those adjacent files
  are required at runtime.
