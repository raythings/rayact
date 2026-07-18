# Troubleshooting

Start with `npx rayact doctor`, then verify Node 22 or 24 and the supported
platform toolchain. Common failures:

- **Module not found:** install the optional package directly; `rayact` does not
  bundle MMKV, Secure Store, or crash reporting.
- **ABI/engine mismatch:** align `rayact` and `@rayact/*` versions, run
  `npx rayact migrate`, then regenerate native projects.
- **Checksum mismatch:** clear the Rayact prebuilt cache and reinstall from npm
  or the matching GitHub Release. Do not disable verification.
- **WebGPU unavailable:** use current Chrome/Edge, HTTPS, hardware acceleration,
  and COOP/COEP headers.
- **Device cannot reach dev server:** put both devices on the same network or
  use the documented adb forwarding path; confirm the printed host/port.
- **Native module still linked after removal:** remove it from dependencies and
  config, then run `npx rayact prebuild --force`.

When reporting a problem, include Rayact/Node/toolchain versions and the failing
command. Redact local paths, credentials, source, and user data.
