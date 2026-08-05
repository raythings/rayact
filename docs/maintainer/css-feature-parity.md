# CSS feature parity — NativeWind as the reference

Reference target: **NativeWind v5**, which is a thin Tailwind-v4 plugin over
**react-native-css** (that package owns the CSS compiler, babel transform and
runtime). Taking it as the yardstick means: *whatever a Tailwind/NativeWind user
can write today should eventually resolve in rayact.*

Audited against rayact's CSS engine as of 2026-07-24:
`native/desktop/css_bridge.cpp` (property parsing) and
`third_party/raym3/src/styles/Stylesheet.cpp` (selectors, at-rules, variables).

---

## 1. Where we already match

| Feature | Notes |
|---|---|
| CSS variables (`--x`, `var()`, fallbacks, nesting) | incl. runtime re-pointing from JS |
| CSS Color 4 (`oklch/oklab/lab/lch/hwb/color()/color-mix`) | full syntax set |
| Dark mode | `@media (prefers-color-scheme)` + `.dark` variant |
| Media queries | `min/max-width`, `min/max-height`, `orientation` |
| Transitions | native engine, render-thread |
| Animations (`@keyframes`) | native engine, incl. infinite + negative delay |
| `rem` units | resolved against the CSS reference px |
| Custom CSS / arbitrary values | any class name, not a fixed utility list |
| `@font-face` | project fonts |
| Layout | flex box model, wrap, gap, inset, min/max sizing |
| Paint | background (multi-layer, `linear-gradient` + `conic-gradient`, `background-clip`/`background-origin`), border, radius, `box-shadow`, `backdrop-filter`, opacity, elevation |
| Interaction | `state-layer-color`, `ripple-color` (rayact extension) |

## 2. Gaps — selectors and variants

This is the biggest structural gap: the stylesheet only understands **a single
class name** (plus a `.dark ` prefix) and comma lists. Everything below needs a
real selector representation.

| Gap | NativeWind | Impact |
|---|---|---|
| **Pseudo-classes** `:hover` `:active` `:disabled` | supported | **DONE.** Mapped onto the existing `v2::StateStyles`, which the renderer already resolves per frame — no new runtime state. Applies to interactive nodes (`onPress`), matching NativeWind's "on compatible components"; hover is inert on Android (touch). `transition` animates the change. |
| `:focus` | supported | **Parses but never fires** — `ComputeState` never produces `ComponentState::Focused`. Needs the focus state wired into that function first. |
| **Parent-state modifiers** (`group`, `group/<name>`, `group-hover:`) | supported | Needs parent→child state propagation during resolve. |
| ~~Descendant / child combinators~~ | **NOT supported on native** | NativeWind's own `theme.css` says so explicitly and uses it as the web feature-detect: `/* Native does not support the child combinator */ @custom-variant web (@supports selector(div > div));`. **Do not chase this** — and note it also rules out the Tailwind utilities built on it (see §4). |
| **Container queries** (`@container`) | supported (except `container-type` / style queries) | Needs per-element size context at resolve time; the `@media` work is a template for the condition side. |
| Attribute/`:nth-child`-style selectors | partial | Low priority for an app framework. |

## 3. Scope — which Tailwind utilities are even in play

The ceiling isn't "all of Tailwind", it's **what maps onto a React-Native-style
prop surface** (Yoga layout + View/Text/Image styles). That's the same ceiling
NativeWind hits, because react-native-css has to compile down to RN styles.
Chasing anything in the right-hand column is wasted effort.

### In scope — target these

| Group | Utilities |
|---|---|
| Layout | `flex-*`, `basis/grow/shrink`, `gap-*`, `justify/items/self/content-*`, `aspect-*`, `hidden` (→ `display:none`), `overflow-hidden/scroll/visible` |
| Position | `static/relative/absolute`, `inset/top/right/bottom/left-*`, `z-*` |
| Sizing | `w-*`, `h-*`, `min/max-w/h-*` (px, %, fractions) |
| Spacing | `p*-*`, `m*-*` (incl. logical start/end) |
| Typography | `font-*` (family/weight/style), `text-{size,color,align}`, `tracking-*`, `leading-*` (**unitless only**), `uppercase/lowercase/capitalize`, `underline/line-through`, `line-clamp-*` |
| Backgrounds | `bg-<color>`, gradients (`bg-linear-*`) |
| Borders | `rounded-*` (incl. per-corner), `border-*` (width/color/style) |
| Effects | `opacity-*`, `shadow-*`, `elevation-*` |
| Transforms | `scale-*`, `rotate-*`, `translate-*` |
| Motion | `transition-*`, `duration/ease/delay-*`, `animate-*` |
| Interactivity | `pointer-events-*`, and rayact's `state-layer-color` / `ripple-color` |

### Out of scope — deliberately skip

| Group | Why |
|---|---|
| `grid-*`, `col-*`, `row-*`, `columns-*` | RN has no grid or multi-column |
| `block`, `inline`, `inline-block`, `table-*`, `contents` | RN `display` is only `flex` / `none` |
| `float-*`, `clear-*` | no floats in Yoga |
| `fixed`, `sticky` | RN position is `relative` / `absolute` only |
| **`space-x/y-*`, `divide-*`** | compile to `> * + *` — the child combinator native doesn't support |
| `bg-{image,repeat,size,position,attachment}` | no raster background images (gradients and `background-clip`/`background-origin` are supported) |
| `list-*`, `content-[]` / `::before` / `::after` | no pseudo-elements or list rendering |
| `scroll-*`, `snap-*`, `resize-*`, `cursor-*` | web-only interaction models |
| `mix-blend-*`, `bg-blend-*`, `isolation`, `clip-path`, `mask-*`, `will-change` | no compositing equivalents |
| `box-border` / `box-content` | RN is always border-box |
| `sr-only` | depends on several of the above |

**Partial / judgement calls:** `filter-*` (blur/brightness — RN 0.76+ has a
limited `filter`; we support `backdrop-filter` only), `object-*` (maps to image
`resizeMode`, not general `object-fit`), `outline-*` / `ring-*` (NativeWind
emulates `ring`), `caret-*`/`accent-*` (RN exposes `selectionColor` instead).

### NativeWind's RN-only additions (not Tailwind core)

Straight from its `theme.css`: `-rn-tint`, `-rn-ripple-{style,color,radius,foreground}`,
`-rn-elevation`, `corner-shape: rounded|squircle`, the `@prop` / `@map` directive
(assign a style value to an arbitrary component prop), and platform variants
`ios` / `android` / `native` / `tv` / `web`.

## 4. Gaps — properties

Ordered by how often Tailwind users hit them.

**Text:**
- ~~`font-weight`~~ **DONE** (the bridge already parsed it; css_bridge never sent it)
- ~~`text-align`~~ **DONE** (the renderer already honoured `text.alignment`; nothing populated it)
- ~~`font-style`~~ **DONE** — note italic *rendering* still needs an italic face in the atlas
- still missing: `text-transform`, `text-decoration`, `line-clamp` / `text-overflow`

**Layout / box:**
- `aspect-ratio`
- `z-index` (node has `zIndex`; no CSS property)
- per-corner radius (`border-top-left-radius`, …) and `border-style`
- logical padding/margin (`padding-inline-start`, …) and the `inset` shorthand
- `transform:` shorthand (we expose `translate-x/-y`, `scale`, `rotation` as
  separate non-standard properties — Tailwind emits `transform`)

**Paint / effects:**
- ~~multi-stop gradients~~ **DONE** — the parser dropped explicit stop positions
  and the painter interpolated only the first and last stop
  (`DrawRectangleGradientEx`), so `linear-gradient(red, yellow, blue)` rendered
  red→blue. Stops now carry real positions, normalized per css-images-3, and are
  interpolated in premultiplied alpha (a fade to `transparent` no longer greys).
- ~~gradients ignored `border-radius`~~ **DONE** — gradients paint through a mesh
  that carries the rounded outline (`v2/Gradient.cpp`), the same technique
  `Ripple.cpp` uses. No scissor or stencil, so it behaves identically on rlvk,
  rlmt, rlwg and GL — `PushRoundedStencil` degrades to a square scissor on rlwg.
- ~~`conic-gradient()`~~ **DONE** — `from <angle>` and `at <position>`. Painted as
  an angular fan; each slice carries its own centre colour so the centre
  singularity does not bleed one averaged colour outward.
- ~~`background-clip` / `background-origin` / multi-layer `background`~~ **DONE** —
  layers paint front-to-back as in CSS, each confined to its box area. This is
  what enables the standard **gradient border**:

  ```css
  border: 1px solid transparent;
  background: conic-gradient(from 0deg, #fff2, #fffc, #fff2) border-box,
              #ffffff14 padding-box;
  ```

  Note `border-image-source: <gradient>` is NOT the way to do this: per spec
  `border-image` ignores `border-radius`, so it squares the corners. `mask-composite`
  is the other web idiom and is still unsupported.
- hard stops at non-axis-aligned angles soften over about one mesh cell (~3dp);
  stop boundaries are pinned exactly for `0deg`/`90deg`/`180deg`/`270deg`
- `filter` (blur, brightness, …) — only `backdrop-filter` today
- `outline` / NativeWind's `ring-*`
- `tint-color` (NativeWind RN extension for images/icons)
- `object-fit` / image resize mode

**Functions:**
- ~~`calc()`~~ **DONE** — recursive-descent evaluator in `css_bridge.cpp`, run
  after var substitution. Keeps `px` when an operand carries a length unit,
  stays unitless otherwise (so Tailwind's `calc(1.75 / 1.125)` line-height
  ratios work). The project's own `tailwind.css` had 18 uses silently failing.
- still missing: `theme()` / nested theme functions

## 5. NativeWind extras worth mirroring

From its `theme.css` and tests: `elevation-*` (we have `elevation`), `ring`,
`shadow` / `inset-shadow`, `@prop` (map a style onto an arbitrary component
prop), platform modifiers (`@media ios` / `@media android`), ripple, tint.

Platform modifiers are cheap and useful for us: our `MediaQuery` struct already
has the shape — add a platform axis evaluated against the build target.

## 6. Runtime fonts from CSS (`@font-face` with a URL)

**Status: works on desktop only, deliberately left lean.** `@font-face { src:
url(https://…) }` already downloads and registers at runtime —
`resolveFontUrl` in `css_bridge.cpp` caches the file under the font cache dir
and hands it to `FontManager::RegisterFont`. Local `url(./foo.ttf)` paths work
everywhere.

Known limitations, in the order they'd need fixing if we make this a real
feature:

| Limitation | Detail |
|---|---|
| **Desktop only** | The fetch shells out to `curl`. iOS is hard-disabled (`#if TARGET_OS_IPHONE`), and Android / web (Emscripten) have no curl binary or usable `system()`, so a remote `@font-face` silently does nothing there. |
| **Blocking** | The download runs synchronously inside `importCSS`. On mobile that stalls the thread — see the async-fetch rule; a real implementation must not do this. |
| **No WOFF2** | `pickFontUrl` accepts only `truetype`/`opentype` (`.ttf`/`.otf`). A default Google Fonts URL serves WOFF2 and fails with *"no TTF/OTF source"*. Decoding it needs brotli vendored in; the cheaper workaround is the existing user-agent trick, which makes Google serve TTF. |
| Bypasses the real net stack | `net.cpp` already has async libcurl + worker threads + frame-wake (the JS `fetch`). The font path predates it and doesn't use it. |

**Hardening applied:** the URL is interpolated into a shell command, so
`isShellSafeUrl` now rejects anything outside a conservative RFC 3986 subset
(no quotes, `$`, backticks, `;`, whitespace). A stylesheet is untrusted input;
without this a crafted `@font-face` URL was command injection.

**If/when this is built properly:** route the download through `net.cpp`'s
async fetch, register with the existing `FontManager::RegisterFontFromMemory`,
then invalidate the glyph atlas and relayout when the bytes arrive (the same
invalidation `FontManager::SetDpiScale` already performs).

## 7. Suggested order

1. **`calc()`** — unblocks large swathes of generated Tailwind v4 output.
2. **Text properties** (`font-weight`, `text-align`, decoration/transform) —
   the fields exist; this is pure plumbing with immediate visible payoff.
3. **~~Pseudo-class selectors~~ — DONE** (`:hover`/`:active`/`:disabled`; `:focus` still needs ComputeState support).
4. **Misc properties** — `aspect-ratio`, `z-index`, per-corner radius,
   `transform` shorthand, `filter`.
5. **`group`/descendant selectors** — needs the selector engine generalised.
6. **Container queries** — build on the `@media` evaluator once selectors are
   generalised.

Items 1–2 are mostly additive to `css_bridge.cpp`. Item 3 changes
`Stylesheet`'s rule representation (selector → state), which is also the
foundation 5 and 6 build on.
