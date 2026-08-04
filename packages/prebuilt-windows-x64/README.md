# @rayact/prebuilt-windows-x64

Prebuilt Rayact Vulkan desktop host and headless build tool for Windows x86_64.

This package contains the generic host. Optional native modules remain owned by
their own release packages and are staged into an app by `rayact prebuild` or
`rayact build --desktop`.

The CLI downloads this package from the matching signed GitHub Release when a
Windows prebuilt is not already installed or cached.

Part of [Rayact](https://github.com/raythings/rayact). See the
[documentation](https://rayact.dev).

## License

MIT
