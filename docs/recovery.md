# Recovery

If development reload fails, Rayact keeps the last running revision. Restore
network access, verify the dev-server URL, and wait for reconnect; a complete
local reload should recover without reinstalling the client. If generated native
files drift, remove only the application’s generated `android/` and `ios/`
directories, then run `npx rayact prebuild --force`.

For a broken upgrade, restore the previous lockfile and package version, run
`npm install`, regenerate native projects, and rebuild. Never mix a previous
engine binary with newer module artifacts. For crash recovery, inspect local
reports with `listCrashReports()` / `exportCrashReport()` before deleting them;
local mode never uploads.

Keep the preceding signed release set available so operators can restore npm
dist-tags and GitHub `latest` without deleting immutable artifacts.
