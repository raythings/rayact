# Navigation And Windowing Status

Rayact no longer exposes the early prototype `createWindow` / `registerScreen`
JavaScript API that older notes described. App navigation is now handled through
the Rayact React host, platform templates, and `@rayact/navigation`.

## Current Model

- Desktop runs a native raylib/raym3 host process with a QuickJS runtime and
  platform window lifecycle hooks.
- Android uses the Gradle template, engine session, activity/fragment shell,
  platform views, back navigation, dev-client bridge, and project HMR transport.
- iOS uses the XcodeGen template, engine session, view-controller shell,
  Metal-backed surface, dev-client bridge, and project HMR transport.
- Web uses the WASM/WebGPU host and a single canvas surface served with
  COOP/COEP headers for SharedArrayBuffer/WebGPU isolation.

## Navigation

Use `@rayact/navigation` for app-level navigation. The package provides Rayact
bindings over `@react-navigation/core` and ships stack/native/bottom-tab entry
points:

```ts
import { NavigationContainer } from '@rayact/navigation';
import { createStackNavigator } from '@rayact/navigation/stack';
```

Generated apps can run against the prebuilt dev app, or they can prebuild native
shells and build a custom dev client when they need app-specific native modules.

## Platform Support

| Target | Status |
| --- | --- |
| Desktop | Supported |
| Android | Supported |
| iOS | Supported |
| Web | Supported |

The next windowing/navigation work is view transitions and deeper multi-surface
optimization, not basic Android/Web enablement.
