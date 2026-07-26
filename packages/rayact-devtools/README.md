# @rayact/devtools

Development-only Chrome DevTools Protocol (CDP) support for Rayact hosts.

Provides the native CDP inspector bridge (element tree, style inspection,
console) that `rayact dev` exposes on the configured `cdpPort` (default 9229),
plus the JS-side helpers the dev server and dev clients use to talk to it.
Linked into hosts only when devtools are enabled; release hosts compile
against the bundled stub and carry none of this.

Part of the [Rayact](https://github.com/raythings/rayact) release set — install
the version matching your other `@rayact/*` packages. Not intended for direct
standalone use.

## Usage

Attach Chrome DevTools to a running dev session:

1. `rayact dev` (project) or `rayact dev --android` with `adb forward tcp:9229 tcp:9229`
2. Open `chrome://inspect` → Configure → add `localhost:9229`
3. Inspect the Rayact node tree, styles and console output.

See the [dev platform guide](https://github.com/raythings/rayact/blob/main/docs/dev-platform.md)
for the full workflow.
