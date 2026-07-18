# @rayact/prebuilt-ios-arm64

Ships `RayactEngine.xcframework` — a real static-library XCFramework built from
`apps/ios`'s `RayactEngineStatic` target, which shares the exact same native
sources as the `RayactIOS` dev-app target.

The release XCFramework contains device arm64 and simulator arm64/x86_64
slices. It contains only the generic engine; optional modules such as MMKV,
Secure Store, and Crash Reporter provide their own XCFrameworks.

Built with `-library`/`-headers`, **not** `-framework`: consumers bind to the
engine purely via Swift `@_silgen_name`, resolved at link time — there's no
Clang module import anywhere, so a `.framework` bundle would add ceremony
(Info.plist, module map, codesigning) for no benefit.

```bash
xcodebuild -create-xcframework \
  -library path/to/device/libRayactEngine.a -headers path/to/headers \
  -library path/to/simulator/libRayactEngine.a -headers path/to/headers \
  -output RayactEngine.xcframework
```

Build it from the monorepo with `./scripts/build-ios-xcframework.sh` (called
automatically by `./scripts/build-prebuilts-macos.sh --ios`).

## Consuming

Because this is a `-library` xcframework, link it via Xcode's normal
framework/library dependency mechanism (xcodegen's `dependencies:` target
key), not `-framework`/`FRAMEWORK_SEARCH_PATHS`:

```yaml
targets:
  YourApp:
    settings:
      base:
        OTHER_LDFLAGS:
          - -framework
          - Metal
          - -framework
          - QuartzCore
          - -framework
          - Security
          - -lc++   # libRayactEngine.a is C++; a pure-Swift app target
                    # doesn't auto-link libc++ otherwise
    dependencies:
      - framework: Frameworks/RayactEngine.xcframework
        embed: false
```

`libRayactEngine.a` doesn't carry its own transitive framework dependencies
the way an app executable's own link flags do, so `Metal`/`QuartzCore`/
`Security` must be linked explicitly by the consumer. `-lc++` is required
because the consumer app is pure Swift with no C++ sources of its own, so
Xcode won't auto-link the C++ runtime that the static archive needs
(`__cxa_throw`, `__gxx_personality_v0`, etc).

This is exactly what `packages/template-ios/project.yml` does — copy that
pattern rather than re-deriving it.
