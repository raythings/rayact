# Changelog

## 0.0.5

- Added platform-specific desktop/Android/iOS/Web bundle contexts and manifests.
- Added dependency-driven module requirements, browser registration scripts,
  side-module WASM, adjacent assets, and route-tree invalidation.
- Added file-based router entry selection and HMR for route additions/removals.
- Added build-time CSS minification and revisioned stylesheet delivery.
- Added direct macOS/Windows project launch through `RAYACT_DEV_SERVER`.
- Added the Web host bridge, manifest-first prefetch, native module asset routes,
  scriptable reload/status endpoints, and expanded CDP/DevTools source serving.
- Fixed native development bootstrap generation for projects that import CSS.
- Dev-client About metadata now includes project Android/iOS ids and versions
  from `rayact.config.json` / `package.json` for launcher fallbacks.
- `/rayact/m/` percent-decodes path segments so dynamic routes such as
  `app/assets/%5Bid%5D.tsx` resolve to the on-disk `[id].tsx` file.

## 0.0.4

- Added multi-platform manifests, the interactive terminal UI, CDP proxy,
  discovery, QR connection flow, and release/debug transform controls.

## 0.0.3

- First standalone package release.
