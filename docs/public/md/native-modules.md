# Native modules

Install optional capabilities as direct npm dependencies:

```sh
npm install @rayact/mmkv
npm install @rayact/secure-store
npm install @rayact/crash-reporter
```

Built-in KV remains available from `rayact/kv` and adds no optional binary. Each optional package owns `rayact.module.json`; autolinking follows declared installed dependencies and verifies artifact SHA-256 values. It never scans workspace folders or arbitrary `node_modules` directories.

Installed modules autolink automatically. `rayact.config.json` can disable or configure one:

```json
{
  "nativeModules": [
    "@rayact/mmkv",
    { "package": "@rayact/crash-reporter", "enabled": true, "configuration": { "mode": "local" } },
    { "package": "@rayact/secure-store", "enabled": false }
  ]
}
```

Legacy `{ "name", "lib", "jsPackage" }` entries warn in 0.0.x. Run `rayact migrate`, then `npm install`, to update imports/config and regenerate native projects.
