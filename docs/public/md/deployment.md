# Deployment

Create immutable release output with `npx rayact build --release`. Release
bundles use QuickJS bytecode and contain no development bootstrap. Generate a
custom native client with `npx rayact prebuild --force`; only native modules
declared by installed package manifests and enabled in `rayact.config.json` are
copied into that client.

For Web, serve the generated host in a secure context with HTTPS, WebGPU and
hardware acceleration. Send `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. Android production builds require
your release signing key. Apple archives require the distribution certificate,
provisioning profile, bundle identifier, and Xcode archive signing configured by
your team.

Keep `release-set.json`, its detached signature, `SHA256SUMS`, npm tarballs,
native archives, SBOMs, and attestations together. The GitHub Release is the
fallback source for the exact npm bits, not a separate rebuild.
