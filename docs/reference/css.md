# CSS reference

The engine parses CSS natively (cssparser + the raym3 stylesheet engine) and
resolves matches against `className` props. This page is the authoritative
support table. Usage patterns live in the [styling guide](/guide/styling).

## Selectors

| Supported | Notes |
| --- | --- |
| `.class`, `.a.b` compound | Primary matching mechanism |
| Descendant (`.card .title`) | Matches through the node tree |
| `:root` | CSS-variable scope |
| `:hover`, `:active`, `:focused`, `:disabled` | Interaction state styles (`:active` = pressed) |

Not supported: child (`>`) and sibling (`+`, `~`) combinators, attribute
selectors, `:nth-*`. (Utilities that compile to them — Tailwind `space-x`,
`divide-*` — are no-ops; use `gap` and `Divider`.)

## At-rules

| Rule | Support |
| --- | --- |
| `@media (prefers-color-scheme: dark)` | ✅ live re-resolve on theme change |
| `@media (min-width/max-width/min-height/max-height/orientation)` | ✅ live re-resolve on resize/rotation |
| `@keyframes` + `animation` | ✅ native render-thread engine ([guide](/guide/animation)) |
| `@font-face` | ✅ truetype/opentype ([guide](/guide/fonts-and-icons)) |
| `@import`, `@supports`, `@container` | ❌ |

## Properties

**Layout (Yoga flexbox)** — `display` (`flex`/`none`), `flex`, `flex-direction`,
`flex-wrap`, `flex-grow`, `flex-shrink`, `flex-basis`, `align-items`,
`align-self`, `justify-content`, `gap`, `row-gap`, `column-gap`, `position`
(`relative`/`absolute`), `top`/`right`/`bottom`/`left`, `overflow`.

**Box** — `width`, `height`, `min-/max-width`, `min-/max-height`, `padding`
(+ `padding-top/right/bottom/left`), `margin` (+ per-edge), `border-width`
(+ per-edge), `border-color`, `border-radius`, `border` shorthand.

**Paint** — `background`/`background-color` (solid + linear gradients),
`color` (cascades to descendant `Text`), `opacity`, `box-shadow`, `elevation`
(Material elevation levels), `backdrop-filter` (blur), `state-layer-color`,
`ripple-color` (Rayact extensions for hover/press feedback).

**Text** — `font-family`, `font-size`, `font-weight`, `font-style`,
`letter-spacing`, `line-height`, `text-align`.

**Transform** — `translate-x`, `translate-y`, `scale`, `rotation`.

**Interaction** — `pointer-events`.

**Motion** — `transition` (shorthand, multiple comma-separated),
`animation` (shorthand: name, duration, easing, delay, iteration count /
`infinite`, direction `normal`/`reverse`/`alternate`/`alternate-reverse`,
fill `none`/`forwards`/`backwards`/`both`).

Unknown properties are ignored with a parse warning — they never abort
rendering.

## Paint order and `position: absolute`

Rayact paints a node's children in **tree order** — the order they appear in
JSX — stable-sorted by an explicit `zIndex`. Unlike the web, `position:
absolute` does **not** promote a child above its in-flow siblings: an absolute
child written before a sibling paints *underneath* it.

`z-index` is not readable from CSS or from `style`; only the top-level
`zIndex={n}` prop reaches the node.

```jsx
// The actions layer paints UNDER the content, because it comes first.
<View style={{ overflow: 'hidden' }}>
  <View style={{ position: 'absolute', right: 0 }}>{actions}</View>
  <View>{content}</View>
</View>
```

The trap: painting underneath is not the same as being hidden. If the content
on top is translucent — a glass card, a tint overlay, anything with an alpha
background — whatever is parked behind it shows straight through, which reads
as the absolute layer being "on top". A layer that must be invisible at rest
has to actually leave the visible area: park it outside the parent's bounds and
let `overflow: hidden` clip it (translating it in with a `SharedValue` keeps a
drag-driven reveal smooth), or animate its `opacity` to 0.

## Values

- **Lengths**: `px` (density-independent), `rem`; **`calc()`** over them.
  **Percentage dimensions are not supported yet** — `width: 50%` (and
  Tailwind's fractional `w-1/2`-style utilities) parse as pixel values.
  Use flex (`flex-grow`/`flex-basis`), `gap`, or fixed sizes instead.
- **Colors (CSS Color 4)**:

| Format | Example |
| --- | --- |
| Hex (3/4/6/8) | `#09c`, `#0099ccff` |
| `rgb()` / `rgba()` | `rgb(255 255 255 / 8%)` |
| `hsl()` / `hwb()` | `hsl(210 80% 60%)` |
| `lab()` / `lch()` | `lch(70% 40 250)` |
| `oklab()` / `oklch()` | `oklch(70% 0.12 250)` — Tailwind v4's palette space |
| `color-mix()` | `color-mix(in oklch, var(--accent), black 20%)` |
| Named + `transparent` | `rebeccapurple` |

An unparseable color yields opaque black (and a console warning) — treat black
UI as a color-typo signal. `currentColor` is not supported.

## CSS variables

`--custom-properties` on `:root` and rules; `var(--x, fallback)`. No arbitrary
inheritance cascade between nodes — resolution is `:root` + the matched rule's
scope. Runtime JS API: `setCSSVariable`, `setCSSVariables`,
`resetCSSVariables`, `getCSSVariable`, `useCSSVariable`
([API reference](/reference/api#css-variables)).

## Interaction with the `style` prop

`style` and matched CSS feed the same resolved style; `style` wins per
property. JS style animation (`SharedValue`, animated styles) cancels a running
native CSS animation on the same node property.
