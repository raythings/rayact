# CLI reference

The `rayact` command (from `@rayact/cli`) drives development, building, and running.

## Commands

| Command | Description |
| --- | --- |
| `rayact dev` | Start the dev server + bundler + terminal UI |
| `rayact run --desktop` | Build and launch on desktop (`--dev` to attach to the dev server) |
| `rayact run --android` | Build, install, and launch on a device (`--dev` wires `adb reverse`) |
| `rayact run --ios` | Build, install, and launch on the iOS simulator |
| `rayact build` | Build a bundle (add `--android` / `--ios` / `--desktop`) |
| `rayact build --release` | Release build: minify + bytecode + `.rayactpack` |
| `rayact export` | Alias for `rayact build --release` |
| `rayact compile <in> <out>` | Compile a JS bundle to QuickJS bytecode |
| `rayact start` | Launch the packaged desktop app from the last build (`--dev` to attach to the dev server) |
| `rayact serve <dir>` | Static server with the COOP/COEP headers web builds require (`--web-port <n>`) |
| `rayact verify <file>` | Inspect a `.rayactpack` / validate a build artifact |
| `rayact dev-app` | Install + launch the prebuilt dev app on Android, iOS, or Windows, wired to the dev server |
| `rayact prebuild` | Ensure the native host + plugin shells are present |
| `rayact doctor` | Check toolchains, prebuilt integrity/ABI, module support, signing, and Web hosting requirements |
| `rayact migrate` | Rewrite legacy config/import forms to the current ones |
| `rayact init [name]` | Scaffold a new app (alias for `create-rayact-app`) |

## Common options

| Flag | Effect |
| --- | --- |
| `--android` / `--ios` / `--desktop` / `--web` | Target platform |
| `--install` | Install + launch on device after an Android/iOS build |
| `--release` / `--debug` | Build mode |
| `--minify` / `--no-minify` | Override the config's minify setting |
| `--bytecode` / `--no-bytecode` | Override bytecode emission in development/debug; release always emits bytecode |
| `--entry <path>` | App entry file |
| `--out <dir>` | Output directory |
| `--desktop-bin <path>` | Use a specific `rayact_desktop` host (runtime) |
| `--tool-bin <path>` | Use a specific `rayact_tool` binary (bytecode compile + pack); env `RAYACT_TOOL_BIN` |
| `--web-port <n>` | Port for `rayact serve` / the web dev proxy |
| `--windows` | `dev-app`: download/extract/launch the Windows x64 app |

## Dev loop {#dev-loop}

`rayact dev` runs an interactive terminal UI (Ink) that reads single keypresses
(`c`/`d`/`a`/`i`/`w`/`r`/`t`/`q`) from an attached TTY. When stdin is not a TTY —
piped, backgrounded, or run under an agent/CI — those keys never register. Use
the non-interactive primitives below instead of driving the TUI.

### Non-interactive / scripted dev loop

None of these need the TUI:

```bash
# Start the dev server and auto-run `adb reverse` (no keypress needed):
rayact dev --android
rayact dev --ios

# One-shot: install the dev-client, set up adb reverse, and launch — fully
# standalone, no TUI:
rayact dev-app --android

# Point the app at a specific dev-server URL (also honoured by `dev-app`):
RAYACT_DEV_SERVER=http://127.0.0.1:8081 rayact dev-app --android

# Windows: download the portable client and open this project directly:
RAYACT_DEV_SERVER=http://127.0.0.1:8081 rayact dev-app --windows

# Raw equivalent: launch the installed dev-client already connected, skipping
# the manual "Connect to dev server" screen. The Android app reads the
# RAYACT_DEV_SERVER intent extra and auto-connects:
adb shell am start -n com.rayact.app/.DevLauncherActivity \
  --es RAYACT_DEV_SERVER "http://127.0.0.1:8081"

# Trigger a full reload of every connected client without the TUI or a
# websocket client:
curl -X POST http://127.0.0.1:8081/rayact/reload
```

Launching an installed APK directly with `am start` does **not** set up
`adb reverse` — go through `rayact dev --android` / `rayact dev-app --android`,
or run `adb reverse tcp:8081 tcp:8081` yourself, or the device can't reach the
dev server on its own loopback.

## No shell scripts

Everything end users need is a `rayact` subcommand — there are no `.sh` / `.bat`
/ `.ps1` scripts in the user-facing flow. The maintainer-only native build
scripts live under `tools/dev/`.
