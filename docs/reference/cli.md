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
| `rayact prebuild` | Ensure the native host + plugin shells are present |
| `rayact init [name]` | Scaffold a new app (alias for `create-rayact-app`) |

## Common options

| Flag | Effect |
| --- | --- |
| `--android` / `--ios` / `--desktop` | Target platform |
| `--install` | Install + launch on device after an Android/iOS build |
| `--release` / `--debug` | Build mode |
| `--minify` / `--no-minify` | Override the config's minify setting |
| `--bytecode` / `--no-bytecode` | Override bytecode emission |
| `--entry <path>` | App entry file |
| `--out <dir>` | Output directory |
| `--desktop-bin <path>` | Use a specific `rayact_desktop` host |

## No shell scripts

Everything end users need is a `rayact` subcommand — there are no `.sh` / `.bat`
/ `.ps1` scripts in the user-facing flow. The maintainer-only native build
scripts live under `tools/dev/`.
