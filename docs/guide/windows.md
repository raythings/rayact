# Windows

Windows support is new in Rayact 0.0.5. Windows 10/11 x64 is a Tier-1 desktop
target with a prebuilt Vulkan host, headless `rayact_tool`, native-module DLLs,
and a portable dev app. Applications do not need Visual Studio or a C++
toolchain.

## Develop

```powershell
npm run dev
# In the TUI press d, or in another terminal:
npm run desktop
```

The desktop shortcut passes the active server through both `--dev-server` and
`RAYACT_DEV_SERVER`, so the native window opens the project directly. To launch
the official client instead:

```powershell
$env:RAYACT_DEV_SERVER = "http://127.0.0.1:8081"
rayact dev-app --windows
```

When the server runs on another computer, use that computer's LAN address, not
Windows loopback.

## Build and distribute

```powershell
rayact build --release --desktop --out dist
dist\rayact_desktop.exe dist\app.rayactpack
```

Ship the entire output directory. Native modules live in `modules/`; fonts and
icon metadata live in `resources/fonts/`. `@rayact/webview` owns a windowless
CEF runtime, so WebView-enabled apps include its DLLs, subprocess, resources,
and locales and are considerably larger than the generic host.

## Rendering and native controls

- Vulkan requires a working vendor driver and Vulkan loader.
- `TextInput` is a true Windows-native editor with OS caret, selection,
  keyboard input, focus, and IME composition inside Rayact's Material field.
- `WebView` is rendered off-screen by CEF into the Rayact composition at normal
  z-order. It supports transparency, rounded/scroll clipping, Rayact overlays,
  forwarded pointer/keyboard input, and live resize.
- First-party Windows modules include clipboard, linking, image picking, SVG,
  MMKV, Secure Store, Crash Reporter, and WebView. Their DLLs autolink from
  package manifests rather than being compiled into the generic host.
- Layout, responsive CSS, hit testing, platform views, and swapchain dimensions
  update continuously while resizing.

## Supported architecture

0.0.5 ships Windows x64 only. The arm64 cross-build remains an engineering gate
but is not a supported release artifact.
