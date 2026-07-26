# Components reference

Every component exported from `rayact/react`, grouped by role, with the sharp
edges called out where behaviour differs from React Native. Shared conventions
first — most components are thin wrappers over the same native node props.

## Shared conventions

- **`style`** — `ViewStyle & TextStyle`; text properties accepted flat or
  nested under `text:` (both work; pick one per codebase).
- **`className`** — matches imported CSS ([styling guide](/guide/styling)).
- **Press events on anything** — `onPress`, `onPressIn`, `onPressOut`,
  `onLongPress` are `BaseProps`: valid on any element, not just `Pressable`.
- **`ref`** — components with imperative handles (`ScrollView`, `TextInput`,
  `View`) expose them via ordinary refs; every handle carries
  `node: { id: number }` for advanced host APIs (worker views, etc.).
- **Material 3** — the Material components render through raym3's M3 system:
  they follow the ambient theme (colors, shape, elevation, state layers) and
  accept style overrides. See [Theming](/reference/api#theming).

## Core

### View

The flexbox container. Layout via Yoga: `flex`, `flexDirection`, `gap`,
`padding`/`margin` (+ per-edge), `position: 'absolute'`, `overflow`. Paint:
`backgroundColor` (solid/gradient), `borderRadius`, `borderWidth`/`Color`,
`opacity`, `boxShadow`/`elevation`. Transform: `translateX/Y`, `scale`,
`rotation` (also animatable via [SharedValue](/guide/animation)).

### Text

Text run with full emoji + Material-symbol fallback.

Props: `style` text keys (`color`, `fontSize`, `fontWeight` 100–900,
`fontStyle`, `fontFamily`, `letterSpacing`, `lineHeight`, `textAlign`),
`numberOfLines`-style clipping via `overflow`, press events.

**`lineHeight` caveat**: the glyph box is taller than the nominal `fontSize`
(ascenders/descenders), and font metrics are **not** added as extra padding
around the measured box. When `lineHeight` is unset it defaults to
`max(fontSize + 4, fontSize * 1.43)`. Large text stacked tightly against a
sibling can clip or overlap — set an explicit `lineHeight` (roughly
`fontSize * 1.3`) and a little margin for display-size text:

```tsx
<Text style={{ fontSize: 48, lineHeight: 62 }}>1,234.56</Text>
```

CSS `color` set on an ancestor cascades to descendant `Text` nodes.

### ScrollView

Scrollable container (vertical by default; `horizontal` prop). Mouse-wheel
scrolls on desktop and web; touch flings elsewhere. `contentContainerStyle`
styles the inner content node.

Imperative handle (react-native parity):

```tsx
import { ScrollView, type ScrollViewHandle } from 'rayact/react';

const ref = React.useRef<ScrollViewHandle>(null);
<ScrollView ref={ref} autoScrollToEnd>{/* … */}</ScrollView>

ref.current?.scrollTo({ y: 0 });   // absolute offset; omitted axes unchanged
ref.current?.scrollToEnd();        // jump to the bottom (or right, if horizontal)
```

- `scrollTo({ x?, y?, animated? })` — jump to an absolute offset; calling it
  clears `autoScrollToEnd` follow on the axis you set.
- `scrollToEnd({ animated? })` — scroll to the end of the content.
- `animated` is accepted for parity but currently performs an instant jump.
- `autoScrollToEnd` keeps the view pinned to the end as content grows (lands in
  the same layout pass a child is appended).

**`flex: 1` caveat**: `flex: 1` expands to
`flexGrow: 1; flexShrink: 1; flexBasis: 0` (standard Yoga meaning). On a
`ScrollView` — or rows inside one — the implicit `flexShrink: 1` lets
overflowing content be squeezed instead of scrolling. If rows overlap instead
of scrolling, opt out of shrinking:

```tsx
<ScrollView style={{ flexGrow: 1, flexShrink: 0 }}>
```

### Pressable

A `View` that tracks pressed state and exposes it to `style` and `children`
render-prop callbacks (`PressableStateCallbackType`). There is no separate
`TouchableOpacity`.

```tsx
<Pressable
  onPress={submit}
  onLongPress={showMenu}
  style={({ pressed }) => ({ backgroundColor: pressed ? 0x1565c0ff : 0x1976d2ff })}
>
  {({ pressed }) => <Text>{pressed ? 'Pressing…' : 'Submit'}</Text>}
</Pressable>
```

`onLongPress` fires once past ~500 ms held within the touch slop; the trailing
`onPress` on release is then suppressed (react-native parity). CSS
`:hover`/`:active` + `state-layer-color`/`ripple-color` style the same states
declaratively.

### Image

Bitmap display: `source` (staged asset or URL), `resizeMode`-style fit via
width/height + `overflow`, corner rounding via `borderRadius`.

### Icon

Material Symbols glyph: `name`, `size`, `color`. Names come from
`rayact/shared/material-icons` ([fonts & icons](/guide/fonts-and-icons)).

### Svg

Vector graphics via the raysvg engine (retained scene graph, tessellated fills
and strokes, id-keyed animation channels):

```tsx
<Svg src="./rayact-assets/pet-rig.svg" style={{ width: 240, height: 240 }} />
```

Accepts either `src` (staged asset path) or inline `content` markup. Rendered
natively on every platform, web included. Large documents parse once and
retain their scene graph; per-frame channel updates don't re-parse.

### SafeArea / SafeAreaView

Insets content away from notches, status and home-indicator areas.
`SafeAreaView` is the RN-compatible alias. For raw numbers use
`useSafeAreaInsets()`.

### StatusBar

Declarative status-bar appearance on mobile: bar style (light/dark) and
background. Render anywhere in the tree; last mounted wins.

### Modal

Full-screen overlay layer: `visible`, `onRequestClose`, transparent backdrop
support. Content mounts above the app in the native overlay layer.

### AvoidKeyboard

Wraps content that should slide out of the IME's way. Uses native keyboard
insets and animates with the CSS transition engine. Pair with `useKeyboard()`
for custom behavior.

### ExternalView / NativeTextInput

Platform-view escape hatches: `ExternalView` composites an OS-native view
(Android `AHardwareBuffer` texture path) into the render tree;
`NativeTextInput` is the raw platform text field the higher-level `TextInput`
drives. Reach for these only when the built-ins can't express something.

## Forms & input

### TextInput (alias `Input`; Material-styled `TextField`)

React-native `TextInput` prop surface mapped onto the native editing engine
(Flutter-style editing model — real caret, selection, IME):

| RN prop | Behaviour |
| --- | --- |
| `value` / `defaultValue` / `onChangeText` | Controlled or uncontrolled text |
| `placeholder`, `placeholderTextColor` | Hint text |
| `keyboardType` | `email-address`, `numeric`, `number-pad`, `decimal-pad`, `phone-pad`, `url`, `ascii-capable`, `visible-password` |
| `secureTextEntry` | Password dots (forces password input type) |
| `multiline` | Multi-line editing; `blurOnSubmit` defaults false when set |
| `returnKeyType` → IME action | `done` default; `go`/`next`/`search`/`send` |
| `autoCapitalize` (`sentences` default), `autoCorrect` | IME behaviour |
| `editable={false}` | Read-only |
| `maxLength`, `onSubmitEditing`, `onFocus`, `onBlur` | Parity semantics |
| `selection` / `onSelectionChange` | Controlled selection range |
| `caretHidden`, `selectionColor` | Caret/selection appearance |

Refs receive a `TextInputHandle`: `focus()`, `blur()`, `node`.

`TextField` is the Material 3 outlined/filled field (label, supporting text,
leading/trailing icons) over the same engine.

### Checkbox / RadioButton / Switch

Controlled boolean inputs: `checked`/`value` (Switch), `onChange`, `disabled`.
Material state layers + ripples included.

### Slider / RangeSlider

`value` (`[low, high]` for Range), `min`, `max`, `step`, `onChange`,
`onChangeEnd`. Continuous or stepped.

### DatePicker / TimePicker

Material date/time selection dialogs: `value`, `onChange`, `open`/trigger
props.

### SegmentedButton

Single or multi-select segmented control: `segments`, `selected`,
`onChange`.

### Search / SearchBar

Material search entry with leading icon and clear affordance; `value`,
`onChangeText`, `onSubmit`.

## Buttons

### Button

`label`, `onPress`, `disabled`, `icon`, Material variants (filled default;
tonal/outlined/text via props). Ripple + state layers built in.

### IconButton / Fab / ExtendedFab / FabMenu / SplitButton / ButtonGroup

Material button family: icon-only buttons, floating action buttons
(`icon`, `label` for Extended, expanding action `FabMenu`), split primary +
menu buttons, and grouped button rows. All take `onPress` (+ per-item for
menus/groups) and `disabled`.

### Chip

Compact labeled element: `label`, `icon`, `selected`, `onPress`,
assist/filter/input styles.

## Communication

### ActivityIndicator / LoadingIndicator / ProgressIndicator

Spinners and progress: `ActivityIndicator` (RN-compatible spinner),
`LoadingIndicator` (Material loader), `ProgressIndicator`
(`value` 0–1 determinate or indeterminate, linear/circular).

### Badge

Small count/status marker attached to icons or items: `value`, dot form.

### Banner / Snackbar

Inline prominent messages (`Banner`: content + actions, dismissable) and
transient toasts (`Snackbar`: `message`, `action`, `visible`, auto-dismiss
duration).

### Tooltip

Hover/long-press label for any child: `content`, positioning handled natively.

### Dialog

Modal Material dialog: `open`, `onClose`, title/content/actions slots. Renders
in the overlay layer with scrim.

## Containment

### Card

Material surface container: elevation variants, press support when `onPress`
given.

### List / MaterialList / MenuItem

`List` renders rows efficiently; `MaterialList` provides M3 list items
(leading/trailing icons, overline/supporting text). `MenuItem` is the
menu-row variant used inside `Menu`.

### DataTable

Column-configured table with header + rows; cell content is arbitrary
children.

### Divider

Hairline separator (horizontal/vertical) — the supported replacement for CSS
`divide-*` utilities.

### BottomSheet / SideSheet

Sliding sheets: `open`, `onClose`, drag-to-dismiss (Bottom), standard/modal
side panels (Side).

### Menu

Anchored popup menu: `open`, `anchor` position, `MenuItem` children.

### Carousel

Horizontally paged content with snap; page indicators via props.

## Navigation chrome

### AppBar / BottomAppBar / Toolbar / DockedToolbar / FloatingToolbar

Top/bottom app bars and toolbar variants: `title`, leading/trailing actions,
custom background (`style.backgroundColor` is preserved across partial
updates), scroll-elevation behavior.

### NavigationBar / NavigationBarItem / NavigationRail / NavigationDrawer

Material navigation surfaces: bottom bar items (`icon`, `label`, `selected`,
`onPress`), side rail, and drawer. `@rayact/navigation`'s tab navigator drives
`NavigationBar` for you ([navigation guide](/guide/navigation)).

### TabBar / Tabs

Tab strips (fixed/scrollable): `tabs`, `selected`, `onChange`.

## Colors: `ColorValue`

`ColorValue` is `number | string`. Both forms are accepted anywhere a color is
expected:

- Packed 32-bit `0xRRGGBBAA` number — e.g. `0x1976d2ff` (opaque blue). The
  alpha is the **last** byte; a fully opaque color ends in `ff`.
- Any **CSS Color 4** string.

```tsx
<View style={{ backgroundColor: 0x1976d2ff }} />
<View style={{ backgroundColor: '#1976d2' }} />
<View style={{ backgroundColor: 'oklch(0.637 0.237 25.331)' }} />
```

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
`none` keyword. This is what makes a Tailwind-style palette work unchanged —
Tailwind v4's default colors are all `oklch()`, and shadcn-style themes are
`hsl()`. Colors out of the sRGB gamut are clipped into it; unsupported
`color()` spaces (`rec2020`, `a98-rgb`, `prophoto-rgb`, `xyz`) are read as
sRGB rather than failing. `currentColor` is **not** resolved.

An unparseable color resolves to opaque black rather than throwing, so a typo
shows up as a black box.

## See also

- [CSS variables & theming API](/reference/api#css-variables) — reading and
  setting `--custom-properties` from JS.
- [CSS reference](/reference/css) — the supported-property table.
