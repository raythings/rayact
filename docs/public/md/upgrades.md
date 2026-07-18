# Upgrades and migration

Commit the application before upgrading. Install the desired Rayact version and
run:

```sh
npm install rayact@0.0.3
npx rayact migrate
npm install
npx rayact prebuild --force
```

`rayact migrate` rewrites legacy package imports, converts legacy
`{ name, lib, jsPackage }` native-module entries, updates npm dependencies, and
regenerates existing native projects. Review the diff before building.

When a module ABI or engine range does not match, prebuild stops with the host
and package ranges and asks you to upgrade them together. Do not copy binaries
manually to bypass that check. The `rayact/mmkv` and `rayact/secure-store` shims
are deprecated for `0.0.x`; canonical imports are `@rayact/mmkv` and
`@rayact/secure-store`.
