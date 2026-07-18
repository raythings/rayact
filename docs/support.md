# Support policy

Rayact supports the latest two stable minor lines or twelve months, whichever is
longer. Removing a deprecated public API requires at least one stable minor and
90 days of notice. The `0.0.x` line retains the MMKV and Secure Store compatibility
imports; they are scheduled for removal in `0.2.0`.

Bug reports should include a minimal project, platform, Rayact version, Node
version, toolchain versions, and reproducible commands. Tier 1 is Android, iOS,
Apple Silicon macOS, and Web. Intel macOS and Rosetta are not supported targets. Linux x64 is preview; Windows is a graduation target. Safari and
Firefox WebGPU remain experimental until they pass the same release matrix.

Security reports follow the private process and response targets in the
[security guide](/security).
