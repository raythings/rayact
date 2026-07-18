# @rayact/mmkv

Optional high-performance key/value storage backed by the package-owned
`librayact_mmkv` native module. Built-in `rayact/kv` does not require this
package.

```sh
npm install @rayact/mmkv@0.0.3
```

```ts
import { createMMKV } from '@rayact/mmkv';

const storage = createMMKV({ id: 'profile' });
storage.set('theme', 'dark');
```

The CLI discovers `rayact.module.json` through normal package resolution and
autolinks only the selected package artifacts. Disable it in
`rayact.config.json` with `{ "package": "@rayact/mmkv", "enabled": false }`.
Android arm64/x86_64, iOS device/simulator, and macOS arm64/x64 artifacts ship
inside this npm package. Run `rayact prebuild --force` after changing native
module selections.

`rayact/mmkv` remains a deprecated re-export during `0.0.x`; new code should
use `@rayact/mmkv`.

Part of [Rayact](https://github.com/raythings/rayact). See the
[native-module documentation](https://rayact.dev/native-modules).

## License

MIT
