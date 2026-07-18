# Release rollback

Rayact does not unpublish a bad release. Choose the preceding verified
`release-set.json`, verify its signature and checksums, then restore every npm
package’s `stable` and `latest` dist-tags to the versions recorded in that set.
Move GitHub’s `latest` marker to the matching immutable release.

The release workflow’s `rollback` channel performs these dist-tag changes from
an existing GitHub Release. It does not rebuild or replace tarballs. Confirm that
the root `rayact` package and all first-party packages now resolve to one release
train, then run the external create → prebuild → release smoke path against a
clean registry/cache.

Applications recover by restoring the previous lockfile, running `npm install`,
regenerating native projects, and rebuilding with the previous signed bits.
