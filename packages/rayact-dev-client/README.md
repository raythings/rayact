# @rayact/dev-client

Shared development-client UI, inspector, compatibility gate, and diagnostics
used by both generated clients and `@rayact/dev-app`. The launcher reads its
visible name and bundled native modules from the app being built; custom clients
may add modules through `rayact.config.json#nativeModules`.
