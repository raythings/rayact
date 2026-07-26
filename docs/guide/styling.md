# Styling

Rayact has two styling inputs that compose: the **`style` prop** (React-side,
per-node) and **CSS stylesheets** matched via **`className`** (parsed and
resolved natively by the engine). Both feed the same style system; `style`
wins over matched CSS for the same property.

## The `style` prop

`Style = ViewStyle & TextStyle`. Text properties can be written **flat** or
**nested** under `text:` — both are supported everywhere:

```tsx
<Text style={{ color: 0xFFFFFFFF, fontSize: 22 }}>flat</Text>
<Text style={{ text: { color: 0xFFFFFFFF, fontSize: 22 } }}>nested</Text>
```

Colors in the `style` prop are `0xRRGGBBAA` numbers (**alpha last**) or CSS
color strings (`'#fff'`, `'oklch(70% 0.1 250)'`); an unparseable string renders
opaque black. Layout is Yoga flexbox — `flex`, `flexDirection`, `gap`,
`padding`/`margin` (+ per-edge variants), `position: 'absolute'`, etc.

## Stylesheets and `className`

Import a CSS file; classes match the `className` prop on any component:

```tsx
import './app.css';

<View className="card elevated">
  <Text className="title">Hello</Text>
</View>
```

```css
.card { padding: 16px; border-radius: 12px; background-color: var(--surface); }
.card.elevated { elevation: 2; }
.title { font-size: 22px; font-weight: 700; color: var(--ink); }
```

Under the hood `import './app.css'` becomes a call to
`globalThis.importCSS('./src/app.css')` — the engine parses the file natively
(cssparser + the raym3 stylesheet engine) and re-resolves matches when classes
or media conditions change.

::: warning Literal paths in release bundles
Release builds statically scan the bundle for **literal** `importCSS('...')`
string arguments to know which CSS files to stage. Import CSS with plain
`import './x.css'` statements (or literal `importCSS` calls) — a path built at
runtime from variables cannot be discovered and will be missing from the
packaged app.
:::

Staging is automatic per platform: CSS files travel inside `app.rayactpack`
(desktop), APK assets (Android), the app bundle (iOS), and `app-assets.json`
MEMFS preload (web).

## Selectors and state

Supported: class selectors, compound classes (`.a.b`), descendant matching,
and the state pseudo-classes `:hover`, `:active` (pressed), `:focused`,
`:disabled`:

```css
.button { background-color: var(--accent); transition: background-color 120ms ease; }
.button:hover { state-layer-color: rgb(255 255 255 / 8%); }
.button:active { ripple-color: rgb(255 255 255 / 12%); }
```

`state-layer-color` and `ripple-color` are Rayact extensions that drive the
Material-style hover dim and press ripple on any pressable view. Child (`>`)
and sibling combinators are not supported (mirroring native-platform CSS
subsets like NativeWind's).

## CSS variables

`--custom-properties` and `var()` (with fallback) work, including `:root`
scope. There is **no custom-property inheritance cascade** between arbitrary
nodes — variables resolve against `:root` and the matched rule's own scope.

Set them from JS for instant re-theming (every match re-resolves natively, no
React re-render needed):

```ts
import { setCSSVariable, setCSSVariables, useCSSVariable } from 'rayact/react';

setCSSVariable('--accent', 'oklch(70% 0.12 250)');
setCSSVariables({ '--surface': '#111', '--ink': '#eee' });
const accent = useCSSVariable('--accent');   // reactive read
```

## Color, values, functions

- **CSS Color 4**: hex, `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`,
  `oklab()`, `oklch()`, `color-mix()`, named colors, `transparent`.
- **`calc()`** with `px` / `%` / `rem` / viewport units.
- **Media queries**: `@media (prefers-color-scheme: dark)`,
  `min-/max-width/height`, `orientation` — re-evaluated live on resize,
  rotation and theme change.
- **Transitions & animations**: see the [animation guide](/guide/animation).
- **`@font-face`**: see [fonts & icons](/guide/fonts-and-icons).

The full supported-property table lives in the
[CSS reference](/reference/css).

## `color` inheritance

CSS `color` cascades to descendant `Text` nodes, so one rule re-themes whole
subtrees:

```css
.surface { color: var(--ink); }   /* every Text below .surface uses it */
```

## Tailwind

Tailwind v4 utilities work through the same pipeline — see the
[Tailwind guide](/guide/tailwind).
