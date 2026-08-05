# Release rollback

Rayact does not unpublish a bad release. Choose the preceding verified
`release-set.json`, verify its signature and checksums, then move GitHub’s
`latest` marker to the matching immutable release.

The release workflow’s `rollback` channel performs that marker change from an
existing GitHub Release. It does not rebuild or replace tarballs. Confirm the
release set is internally lockstep, then run the external create → prebuild →
release smoke path against a clean cache.

Applications recover by restoring the previous lockfile, running `npm install`,
regenerating native projects, and rebuilding with the previous signed bits.
