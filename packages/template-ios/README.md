# @rayact/template-ios

Thin iOS host shell. Run `rayact prebuild` to generate `ios/` in your project.

Requires `@rayact/prebuilt-ios-arm64` with `RayactEngine.xcframework` (copied to
`ios/Frameworks/` during prebuild when available). That XCFramework includes
the Debug live-connect bindings (`rayactDevFetch`, `devCall`) used by
`npm run ios:dev-client`.

Assets are synced from `rayact-assets/` at build time (same directory Android uses).
