# Linux

Linux is a **preview platform** in 0.0.5: the x64 host prebuilt is built and
released, but gets less routine testing than macOS.

## Using the prebuilt

Nothing Linux-specific: `rayact prebuild` resolves
`@rayact/prebuilt-linux-x64` (or downloads it from the release), and every
command from the [desktop guide](/guide/desktop) works the same. The host
renders through Vulkan (rlvk); install your distribution's Vulkan loader
(`libvulkan1`) and up-to-date GPU drivers.

Optional: `libdns_sd` (Avahi's compatibility package) enables dev-server
discovery; without it, enter the dev-server URL manually in the dev client.

## Building the host reproducibly

Maintainers build the Linux prebuilt in Docker — the container pins the
toolchain so builds are reproducible on any machine (including macOS):

```sh
node scripts/build-prebuilts.mjs --target linux
```

This drives `docker/prebuilts/Dockerfile.linux` + `build-linux.sh`: QuickJS,
then the engine (`rayact_desktop` + the headless `rayact_tool`), then packs
`packages/prebuilt-linux-x64`. The same container is the release gate for the
platform — if it builds there, it ships.

## Known gaps

- x64 only; no arm64 Linux prebuilt yet.
- Wayland runs through the host's compatibility path; X11 is the tested route.
