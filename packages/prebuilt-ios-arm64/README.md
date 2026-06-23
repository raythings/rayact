# @rayact/prebuilt-ios-arm64

Ships `RayactEngine.xcframework` built from the monorepo iOS target.

CI builds with:

```bash
xcodebuild -create-xcframework \
  -framework path/to/device/RayactEngine.framework \
  -framework path/to/simulator/RayactEngine.framework \
  -output RayactEngine.xcframework
```

Until published, run `./scripts/build-prebuilts.sh` from the monorepo and build iOS from source via `apps/ios`.
