# Rayact Web Platform

This is the web platform host project, matching `apps/android` and `apps/ios`.
The app-side project files, shell, and COOP/COEP server live here; platform-specific
C++ shims live in `../../native/web`.

- `npm run dev` starts the Rayact dev server against `../../test-projects/desktop-smoke/src/App.tsx` with `platform=web`.
- `npm run build` bundles `../../test-projects/desktop-smoke/src/App.tsx`, configures the repo web target, and writes the WebGPU host output to `../../build-web/bin`.
- `npm run serve` serves `../../build-web/bin` with COOP/COEP headers for WebGPU and SharedArrayBuffer.

## Release verification

Web is included in the `v0.0.1` launch. Maintainers should run:

```bash
npm run verify:web
npm run pack:release
```

The release asset packer includes `build-web/bin` as `rayact-web-0.0.1.tar.gz`
and writes a top-level `SHA256SUMS` for upload to the replacement GitHub
release. Browser testing must use the COOP/COEP server or proxy because the web
host requires SharedArrayBuffer/WebGPU isolation.
