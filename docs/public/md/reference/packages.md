# Packages and platforms

Rayact uses one private npm workspace root with independently publishable packages. All first-party packages in the `0.0.3` release set use exact lockstep versions.

## Consumer and framework

| Package | Role |
| --- | --- |
| `rayact` | Consumer umbrella; React APIs plus built-in KV, crypto, workers, and CLI forwarding |
| `@rayact/shared` | Shared protocol and utility types |
| `@rayact/runtime` | Host bridge, lifecycle, capabilities, reload state, and diagnostics |
| `@rayact/renderer` | Reconciler and native command protocol |
| `@rayact/react` | Components, hooks, themes, accessibility, and rendering entry points |

There is no public `@rayact/core` or `@rayact/quickjs` package.

## Optional features

| Package | Role |
| --- | --- |
| `@rayact/navigation` | Navigation bindings |
| `@rayact/worklets` | Worklet APIs |
| `@rayact/mmkv` | Optional high-performance storage module |
| `@rayact/secure-store` | Optional Keychain/Keystore storage module |
| `@rayact/crash-reporter` | Local-first, consent-gated crash reporting |

Each native module owns `rayact.module.json`, native source, platform artifacts, declarations, tests, README, and changelog. Installing only one optional module does not add the other modules' binaries or registrations.

## Tooling and distribution

| Package | Role |
| --- | --- |
| `@rayact/cli` | `rayact` command |
| `@rayact/dev-server` | Bundler, HMR, discovery, debugger, and inspector transport |
| `@rayact/prebuild` | Manifest-based autolinking and native project generation |
| `@rayact/dev-client` / `@rayact/devtools` | Client launcher and developer tools |
| `create-rayact-app` | npm-first project scaffolder |
| `@rayact/template-*` | Thin Android and iOS templates |
| `@rayact/prebuilt-*` | Platform-specific engine artifacts |
| `@rayact/dev-app` | Publishable official client that explicitly includes supported first-party modules |

## Platform matrix

| Target | Artifact | Status |
| --- | --- | --- |
| Android arm64 / x86_64 | engine `.so` packages | Tier 1 |
| iOS device arm64; simulator arm64/x86_64 | engine XCFramework | Tier 1 |
| macOS Apple Silicon (arm64) | desktop host package | Tier 1 |
| Web wasm32 | WebGPU host package | Tier 1 |
| Linux x64 | desktop host package | Preview |
| Windows | source build | Graduation target |

Every prebuilt carries an engine/version/ABI manifest. The CLI rejects incompatible native ABI or platform selections before linking.
