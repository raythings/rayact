# Rayact — working notes

## `apps/web/shell.html` is a build template, not a runnable page

Do not open `apps/web/shell.html` directly in a browser (and do not point a
preview pane at it). It is the Emscripten `--shell-file` template: on its own it
has no engine, no app bundle, and no project to run, so it renders an empty
canvas behind the loading overlay and nothing else. Nothing is broken when that
happens — there is simply nothing there yet.

The file only becomes a real page at link time, when `emcc` substitutes the
`{{{ SCRIPT }}}` placeholder (last line of `<body>`) with the generated
`<script src="rayact.js">` and writes `rayact.html` next to the wasm
(`apps/web/CMakeLists.txt`, `LINK_FLAGS ... --shell-file .../shell.html`).

To actually see a project running on web:

```bash
# release: build the host, stage an app, serve it
sh scripts/build-web-release-host.sh
cd <project> && npx rayact build --web --out <dir>
npx rayact serve <dir>/web        # then open /rayact.html

# dev, with HMR
cd <project> && npx rayact dev --web
```

After editing `shell.html`, a rebuild is required before the change can be seen
— and note that `rayact build --web` stages the **release** trio
(`rayact_release.*`) when it exists, which `cmake --build build-web --target
rayact` does *not* produce. Use `scripts/build-web-release-host.sh`, or the app
keeps running the previous host with no error to explain it.

A related trap when verifying: `emcc` minifies the shell's inline JS at `-O2`,
so grepping a built `rayact.html` for a function name reports "stale" even when
the change is present. Grep for a string literal instead.

## Screenshotting a running desktop (rayact_desktop) instance

Don't use the screen-filtered screenshot tools for this — the window is often on
another monitor or Space and comes back as an empty desktop even when the app is
frontmost. Capture the window directly by its CGWindow id instead:

```bash
# 1. Find the window id (first column) — swift one-liner, no pyobjc needed:
cat > /tmp/winid.swift <<'SWIFT'
import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
for w in list {
    let owner = (w["kCGWindowOwnerName"] as? String) ?? ""
    if owner.lowercased().contains("rayact") {
        print(w["kCGWindowNumber"] as! Int, owner, w["kCGWindowBounds"] as! [String: Any])
    }
}
SWIFT
swift /tmp/winid.swift

# 2. Capture that window id (works across monitors/Spaces, no window raising):
screencapture -l<window-id> -x /tmp/rayact-window.png
```

Also useful: the process name macOS sees is `rayact_desktop` (bare executable,
not a .app bundle), and engine/JS output goes to the launching terminal's
stdout/stderr — `console.log` lines appear as `INFO: JS: ...`, so a self-test
that prints its result is often faster proof than pixels.
