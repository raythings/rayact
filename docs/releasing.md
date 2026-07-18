# Release process

The `0.0.3` train uses three channels:

- Canary builds are commit-specific prereleases published under `canary`.
- Preview publishes final immutable tarballs under `preview` and attaches those exact bits to GitHub Releases.
- Stable verifies the signed release set, then moves `stable` and `latest` to the already-tested versions without rebuilding.

`release-set.json` records every package, artifact hash, engine ABI, Tier-1 platform, and dev-app version. `rayact` is ordered last for publication. npm provenance and GitHub artifact attestations are emitted by the release workflow.

Rollback downloads and verifies the prior release set, restores npm `stable`/`latest`, and points GitHub `latest` at that release. Artifacts are never unpublished.
