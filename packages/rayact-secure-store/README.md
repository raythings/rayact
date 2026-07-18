# @rayact/secure-store

Optional encrypted storage backed by the package-owned
`librayact_secure_store` native module (Apple Keychain / Android Keystore).

```sh
npm install @rayact/secure-store@0.0.3
```

```ts
import { setItemAsync, getItemAsync } from '@rayact/secure-store';

await setItemAsync('session', token);
const restored = await getItemAsync('session');
```

The package autolinks from its `rayact.module.json`; it is not part of the
generic Rayact engine. Android arm64/x86_64, iOS device/simulator, and macOS
arm64/x64 artifacts ship in this package. Run `rayact prebuild --force` after
installing, removing, or disabling it. Applications should still avoid storing
data they do not need and should delete credentials on sign-out.

`rayact/secure-store` remains a deprecated re-export during `0.0.x`; new code
should use `@rayact/secure-store`.

Part of [Rayact](https://github.com/raythings/rayact). See the
[native-module documentation](https://rayact.dev/native-modules).

## License

MIT
