# iOS

Rayact renders on iOS through Metal (rlmt backend). The engine ships as a
prebuilt `RayactEngine.xcframework`; `rayact prebuild` generates an Xcode
project around it — no C++ compilation on your machine.

## Prerequisites

- Xcode with the iOS platform installed.
- [xcodegen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) —
  the generated project is defined by `ios/project.yml`.
- A booted iOS Simulator, or a device with your own signing set up.

`rayact doctor` verifies xcodebuild, xcodegen and signing availability.

## Fastest loop: the prebuilt dev app

```sh
npm run dev     # dev server with QR
npm run ios     # rayact dev --ios: installs the dev app on the simulator + connects
```

The dev app (Expo Go-style) loads your project over the dev server with hot
reload. Shake gesture (⌃⌘Z in the simulator) opens the dev menu.

## Your own dev client

```sh
npm run prebuild          # generates ios/ from @rayact/template-ios
npm run ios:dev-client    # rayact build --debug --ios --install
```

`ios/` contains `project.yml` (source of truth — regenerate the `.xcodeproj`
with `xcodegen generate` after editing it), the Swift host sources, and
`Frameworks/RayactEngine.xcframework` copied from the prebuilt. Commit it.

The prebuilt XCFramework includes `rayactDevFetch` and `devCall` so Debug
clients can bootstrap against `rayact dev`, run module-HMR, and fill the
launcher About page (bundle id / native version / Rayact runtime). When native
`getAppInfo` is unavailable, About falls back to `ios.bundleId` /
`android.packageName` from `rayact.config.json` and the project /
`@rayact/*` package versions.

File-based routes with brackets (`app/assets/[id].tsx`) are percent-encoded on
the wire and decoded by the dev server. After the app backgrounds or the
launcher switches panes, the host recreates Metal surfaces so font/icon atlases
rebake (avoids white-square glyphs from stale GPU texture ids).

## Release build

```sh
npm run build:ios    # rayact build --release --ios
```

Builds the release configuration with the bundle compiled to bytecode and
staged into the app bundle. Install on a booted simulator:

```sh
xcrun simctl install booted <output>.app
xcrun simctl launch booted <bundle-id>
```

::: warning Signing
Rayact does not manage signing. Simulator builds need none; device builds
require your team/provisioning in Xcode (edit `ios/project.yml` settings or the
generated project). The release pipeline's device `.ipa` artifacts are
unsigned sideload builds.
:::

## Debugging

- Console output lands in the Xcode console / `xcrun simctl spawn booted log stream --predicate 'process == "<app>"'`.
- The dev client exposes the same CDP inspector as other platforms via the dev
  server (`chrome://inspect` → `localhost:9229`). See [dev platform](/dev-platform).
