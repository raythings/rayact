# Maintainer dev scripts

These shell scripts are **maintainer-only** helpers for building the native
engine from source. End users do not need them — the published `rayact` CLI
fetches a prebuilt host (`rayact prebuild`) and builds/runs apps with no shell
scripts.

Run them from the **repo root** (their paths are relative to it):

| Script | Purpose | User-facing equivalent |
| --- | --- | --- |
| `tools/dev/build_macos.sh` | Compile the desktop engine on macOS | `rayact prebuild` (prebuilt host) |
| `tools/dev/build_linux.sh` | Compile the desktop engine on Linux | `rayact prebuild` |
| `tools/dev/build_windows.bat` | Compile the desktop engine on Windows | `rayact prebuild` |
| `tools/dev/run.sh` | Rebuild native deps + run a file on desktop | `rayact run --desktop` |
| `tools/dev/run-android.sh` | Bundle + APK + install + launch (legacy push flow) | `rayact run --android` |

For everyday app development use the CLI:

```sh
rayact dev              # dev server + TUI
rayact run --desktop    # build + launch on desktop
rayact run --android    # build + install + launch on a device
rayact build --android  # build a release APK
```
