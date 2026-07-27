# API reference (`rayact/react`)

Everything `rayact/react` exports beyond the [components](/reference/components):
rendering entry points, hooks, theming, keyboard/back handling, and the CSS
variable API. Subpath exports of the umbrella `rayact` package are listed at
the end.

## Rendering

```ts
render(element): RayactRoot          // render into the host's root container
createRoot(container?): RayactRoot   // explicit root (advanced/multi-root)
getOrCreateRoot(): RayactRoot        // the app-level singleton root
RayactReconciler                     // the react-reconciler instance (advanced)
createRuntime() / getDefaultRuntime()// runtime bridge management (advanced)
```

A scaffolded app guards `render(<App />)` behind the host's `initRaylib`
global so the same entry runs under dev clients (which own the window) and
release hosts.

## Hooks

| Hook | Returns |
| --- | --- |
| `useTheme()` | The active `RayactTheme` (M3 tokens); `withTheme(Component)` HOC form |
| `useColorScheme()` | `'light' \| 'dark'` — resolved scheme, reactive |
| `useColorSchemePreference()` | `'system' \| 'light' \| 'dark'` preference |
| `useKeyboard()` | `KeyboardInsets` — live IME inset (height, visible) |
| `useSafeAreaInsets()` | `SafeAreaInsets` `{ top, right, bottom, left }` |
| `useBackHandler(fn)` | Register a back-press handler (return `true` = handled) |
| `useKeyboardEvents(opts)` | Raw key/text events (desktop/web keyboards) |
| `useCSSVariable(name)` | Reactive CSS variable value |
| `useReducedMotion()` | OS reduce-motion setting |
| `useAnimatedValue` / `useSpring` / `useSharedValue` | [Animation guide](/guide/animation) |

## Color scheme

```ts
import { setColorSchemePreference, cycleColorSchemePreference } from 'rayact/react';

setColorSchemePreference('dark');     // 'system' | 'light' | 'dark'
cycleColorSchemePreference();         // system → light → dark → system
```

Changing the scheme re-themes natively: Material tokens update, CSS
`@media (prefers-color-scheme)` blocks re-resolve, and scheme-variant CSS
variables swap — no remount.

## Theming

`RayactThemeProvider` overrides Material 3 tokens for a subtree; `useTheme()`
reads the merged `RayactTheme` (color roles, typography, shape). Component
color overrides accept any [`ColorValue`](/reference/components#colors-colorvalue).

## CSS variables

Custom properties declared in an imported stylesheet resolve anywhere a value
is expected, including inside functional colors, and can be re-pointed at
runtime:

```tsx
import {
  useCSSVariable, getCSSVariable,
  setCSSVariable, setCSSVariables, resetCSSVariables
} from 'rayact/react';

const brand = useCSSVariable('--brand');   // re-renders on change
getCSSVariable('--brand');                 // one-shot read, resolved to a literal

setCSSVariable('--brand', 'lime');         // null clears the override
setCSSVariables({ '--brand': 'hsl(300 100% 50%)', '--bg': '#111' });  // batched
resetCSSVariables();                       // back to the stylesheet's values
```

- Values set from JS override the stylesheet's declarations (including
  dark/light variants) until cleared.
- Setting a variable re-resolves every mounted node's `className` styles
  natively and schedules a frame — live theming without remounting. Prefer
  `setCSSVariables` for several at once (one restyle instead of per variable).
- Variables are keyed by name and color-scheme variant, not by selector; names
  are case-sensitive; the leading `--` is optional in these calls;
  `getCSSVariable` returns `undefined` when undeclared.
- There is no custom-property *inheritance* down the element tree — `var()`
  resolves against the global declarations, not an ancestor's value.

## Keyboard

```ts
import { Keyboard, useKeyboardEvents } from 'rayact/react';

Keyboard.dismiss();
useKeyboardEvents({ capture: true }, (e) => { /* KeyboardKeyEvent | KeyboardTextInputEvent */ });
```

`useKeyboard()` gives IME insets for manual layouts; `AvoidKeyboard` handles
the common case declaratively.

## BackHandler

```ts
import { BackHandler, useBackHandler } from 'rayact/react';

const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
sub.remove();
```

Android hardware back and desktop Escape route through the same handler stack;
`@rayact/navigation` integrates automatically.

## Accessibility

```ts
import { setAccessibilityFocus, useReducedMotion } from 'rayact/react';
```

Move platform accessibility focus to a node; respect reduce-motion. See
[accessibility](/accessibility) for the current surface.

## Native components from modules (`registerNativeComponent`)

Built-in components are wired into the engine at compile time; a native module
cannot be, so it registers its component types at import scope. This is the
module-owned render node feature of **ABI 2** — the same mechanism
[`@rayact/svg`](/reference/components#svg) uses.

```ts
import { registerNativeComponent } from 'rayact/react';

registerNativeComponent('svg', {
  create: (native, props, style) =>
    native.createModuleNode!('svg', style, JSON.stringify(payload(props))),
  update: (native, nodeId, props) =>
    native.setModuleNodeProps!(nodeId, JSON.stringify(payload(props)))
});

export const Svg = (props: SvgProps) => React.createElement('rayact-svg', props);
```

It updates both registries the component needs in one call: the reconciler
learns the element type is legal, and the bridge learns how to create and update
it. Registration always precedes the first render by construction, because the
only way to render the component is to import it from the module that registers
it. See [native modules](/native-modules) for the module side.

## Umbrella package subpaths

| Import | Contents |
| --- | --- |
| `rayact/react` | Components + this API surface |
| `rayact/runtime` | Bridge/runtime internals (`createBridge`, `createDevClient`, `createAsset`) |
| `rayact/shared` | `Platform` (`Platform.OS`: `'android' \| 'ios' \| 'macos' \| 'linux' \| 'windows' \| 'web'`), shared utilities |
| `rayact/shared/material-icons` | Icon name → glyph registration |
| `rayact/kv` | Built-in key-value store ([native modules](/native-modules#apis)) |
| `rayact/crypto` | Hashing/random backed by the host |
| `rayact/worker` | Worker protocol helpers (`WorkerCanvas`, `WorkerNodeTree`, `DRAW`) — [workers guide](/guide/workers) |

Sibling packages: [`@rayact/navigation`](/guide/navigation),
[`@rayact/worklets`](/guide/workers#worklets), `@rayact/mmkv`,
`@rayact/secure-store`, `@rayact/crash-reporter`
([native modules](/native-modules)).
