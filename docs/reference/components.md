# Components reference

Notes on component APIs and layout behaviour that differ from React Native or are otherwise easy to trip over. This is not an exhaustive prop list — it covers the sharp edges.

## ScrollView

`ScrollView` accepts a `ref` exposing an imperative handle (react-native parity):

```tsx
import { ScrollView, type ScrollViewHandle } from 'rayact';

function Log() {
  const ref = React.useRef<ScrollViewHandle>(null);
  return (
    <ScrollView ref={ref} autoScrollToEnd>
      {/* … */}
    </ScrollView>
  );
}

// Elsewhere:
ref.current?.scrollTo({ y: 0 });   // absolute offset; omitted axes unchanged
ref.current?.scrollToEnd();        // jump to the bottom (or right, if horizontal)
```

- `scrollTo({ x?, y?, animated? })` — jump to an absolute offset. Omitted axes are left unchanged. Calling it clears `autoScrollToEnd` follow on the axis you set.
- `scrollToEnd({ animated? })` — scroll to the end of the content.
- `animated` is accepted for parity but currently performs an instant jump (no easing yet).

`autoScrollToEnd` keeps the view pinned to the end as content grows; it now lands
correctly in the same layout pass a child is appended (no one-row clip on the
newest item).

### `flex: 1` on scroll containers

`flex: 1` expands to `flexGrow: 1; flexShrink: 1; flexBasis: 0` — the standard
Yoga/CSS/React Native meaning. On a `ScrollView` (or a row inside one) the
implicit `flexShrink: 1` lets overflowing content be squeezed instead of
scrolling. If rows overlap instead of scrolling, set them to
`flexGrow: 1, flexShrink: 0` (or give the scroll container a fixed/`flex`-sized
parent and let content overflow):

```tsx
<ScrollView style={{ flexGrow: 1, flexShrink: 0 }}>
```

## Text: `lineHeight`

The glyph box is taller than the nominal `fontSize` (ascenders/descenders), and
font metrics are **not** added as extra padding around the measured box. When
`lineHeight` is unset it defaults to `max(fontSize + 4, fontSize * 1.43)`. Large
text stacked tightly against a sibling can clip or overlap — set an explicit
`lineHeight` (roughly `fontSize * 1.3`) and a little margin for display-size
text:

```tsx
<Text style={{ fontSize: 48, lineHeight: 62 }}>1,234.56</Text>
```

## Pressable

`Pressable` is a `View` that tracks pressed state and exposes it to `style` and
`children` render-prop callbacks. There is no separate `TouchableOpacity`; any
element also accepts a bare `onPress`.

```tsx
import { Pressable } from 'rayact';

<Pressable
  onPress={submit}
  onLongPress={showMenu}
  style={({ pressed }) => ({
    backgroundColor: pressed ? 0x1565c0ff : 0x1976d2ff,
  })}
>
  {({ pressed }) => <Text>{pressed ? 'Pressing…' : 'Submit'}</Text>}
</Pressable>
```

Press events available on `Pressable` (and, individually, on any element via
`BaseProps`): `onPress`, `onPressIn` (touch-down), `onPressOut`
(release/cancel), and `onLongPress` (fires once past ~500ms held without moving
beyond the touch slop). When `onLongPress` fires, the trailing `onPress` on
release is suppressed (react-native parity).

## Colors: `ColorValue`

`ColorValue` is `number | string`. Both forms are accepted anywhere a color is
expected:

- Packed 32-bit `0xRRGGBBAA` number — e.g. `0x1976d2ff` (opaque blue). Note the
  alpha is the **last** byte; a fully opaque color ends in `ff`.
- Any **CSS Color 4** string.

```tsx
<View style={{ backgroundColor: 0x1976d2ff }} />
<View style={{ backgroundColor: '#1976d2' }} />
<View style={{ backgroundColor: 'oklch(0.637 0.237 25.331)' }} />
```

### Supported color syntax

| Form | Examples |
| --- | --- |
| Hex | `#f00`, `#f00a`, `#1976d2`, `#1976d2cc` |
| Named | all 148 CSS names, plus `transparent` |
| `rgb()` / `rgba()` | `rgb(255 0 0)`, `rgb(255, 0, 0)`, `rgb(100% 0% 0%)`, `rgb(255 0 0 / 50%)` |
| `hsl()` / `hsla()` | `hsl(0 100% 50%)`, `hsl(0.5turn 100% 50% / 0.5)` |
| `hwb()` | `hwb(0 20% 10%)` |
| `lab()` / `lch()` | `lab(54.29% 80.8 69.89)`, `lch(54.29% 106.84 40.85)` |
| `oklab()` / `oklch()` | `oklch(0.637 0.237 25.331)` |
| `color()` | `color(srgb 1 0 0)`, `color(srgb-linear …)`, `color(display-p3 1 0 0)` |
| `color-mix()` | `color-mix(in oklab, red 50%, transparent)` |

Both legacy comma syntax and modern space syntax are accepted, along with `/`
alpha, percentage channels, angle units (`deg`/`rad`/`grad`/`turn`), and the
`none` keyword.

This is what makes a Tailwind-style palette work unchanged — Tailwind v4's
default colors are all `oklch()`, and shadcn-style themes are `hsl()`. Colors
out of the sRGB gamut (some `oklch`/`lab`/`display-p3` values) are clipped into
it. Unsupported `color()` spaces (`rec2020`, `a98-rgb`, `prophoto-rgb`, `xyz`)
are read as sRGB rather than failing. `currentColor` is **not** resolved.

An unparseable color resolves to opaque black rather than throwing, so a typo
shows up as a black box.

## CSS variables

Custom properties declared in an imported stylesheet resolve anywhere a value is
expected, including inside functional colors, and can be re-pointed at runtime.

```css
:root {
  --brand: oklch(0.637 0.237 25.331);
  --bg: white;
  --surface: var(--bg);          /* references resolve transitively */
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #111111; }
}
.dark { --bg: #111111; }          /* the .dark class form works too */

.card {
  background-color: var(--surface);
  border: 2px solid var(--brand);
  padding: var(--pad, 12px);      /* fallback used when undeclared */
}
```

Variables are keyed by name and color-scheme variant, not by selector — a
`--name` declared anywhere applies globally, which covers the usual
`:root` / `.dark` / `@media (prefers-color-scheme)` authoring pattern. Names are
case-sensitive (`--myVar` ≠ `--myvar`).

### Reading and updating from JS

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

Values set from JS override the stylesheet's own declarations (including the
dark/light variants) until cleared. Setting a variable re-resolves every mounted
node's `className` styles natively and schedules a frame, so live theming works
without remounting. Prefer `setCSSVariables` when changing several at once — it
restyles once instead of per variable.

The leading `--` is optional in these calls (`getCSSVariable('brand')` works),
and `getCSSVariable` returns `undefined` for an undeclared variable.

::: warning
`var()` is resolved against these declarations only. There is no CSS
custom-property *inheritance* down the element tree, so a `var()` in one rule
cannot pick up a different value from an ancestor element.
:::
