# Release process

All platform artifacts are built and tested on a maintainer macOS machine.
GitHub Actions never rebuilds release artifacts.

```sh
export RAYACT_RELEASE_PRIVATE_KEY="$(cat ~/.rayact-release/rayact-release-key.pem)"
npm run release:prepare
RAYACT_CONFIRM_PUBLISH_RELEASE=v0.0.5 npm run release:publish
```

`release:prepare` builds Android and Linux through local Docker, macOS and iOS
with local Xcode, Web with Emscripten, and Windows through the local cross
toolchain. It runs the package, dev-app, reproducibility, consumer, and platform
gates before producing the signed `release1/` directory.

`release:publish` verifies the release set again, creates the GitHub tag and
release, and uploads the local artifacts. A lightweight GitHub workflow
downloads those exact assets, verifies signatures and checksums, and emits
attestations without compiling anything.

Optional npm publication code remains available for a future distribution
change, but its workflow step only runs when the repository variable
`RAYACT_PUBLISH_NPM` is explicitly set to `true`. It is disabled by default and
is not part of the supported release process.

Rollback only moves GitHub's `latest` marker to a preceding immutable signed
release. Artifacts are never deleted or rebuilt.
