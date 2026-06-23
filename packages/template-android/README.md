# @rayact/template-android

Thin Android Gradle shell for Rayact consumer apps. Generated into your project by `rayact prebuild`.

- Links prebuilt `librayact.so` from `@rayact/prebuilt-android-arm64`
- Plugin `.so` files copied from `@rayact/*` packages with `rayact.plugin.json`
- Assets loaded from `rayact-assets/` (no duplicate copy into `app/src/main/assets`)
- **No CMake / NDK compile** for the engine — Gradle + Kotlin only
