# Rayact — Roadmap

Shipped in 0.0.x: Android (Vulkan), iOS + macOS (Metal), Linux (Vulkan,
preview), Web (WebGPU/WASM), QuickJS bytecode releases, `.rayactpack`
containers, react-navigation, Material 3 components, native CSS engine
(Color 4, variables, media queries, transitions, `@keyframes`), raysvg
`<Svg>`, WASM/native workers + worker views, native modules
(mmkv/secure-store/crash-reporter), Expo-style dev apps + dev clients,
Chrome DevTools (CDP) inspection, headless `rayact_tool` build toolchain.

## Next

- [ ] Windows host via the rld12 (D3D12) raylib backend
- [ ] macOS x64 + Linux arm64 prebuilts
- [ ] Android release signing config passthrough (release APKs are debug-signed today)
- [ ] `ScrollView.scrollTo({ animated: true })` easing (currently instant)
- [ ] Play-store/App-store packaging guides (AAB, notarization)
- [ ] api-extractor-generated API reference (hand-written today, drift-gated by docs/scripts/check-api-coverage.mjs)
- [ ] Per-package CHANGELOGs
- [ ] Re-enable the `candidate` job in .github/workflows/release.yml (CI release builds) now that all native deps are submodules

Historical phase-by-phase notes live in git history (this file previously
tracked the 2025 bring-up phases, long since shipped).
