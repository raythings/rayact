# Fonts & icons

## Built-in fonts

**Body text** uses a glyph atlas baked at each integer `font-size` (device-independent
dp). Glyphs start as ASCII and grow lazily from the strings you measure/draw.

- **Android / Apple / Windows / Linux** — default family is the platform UI font
  (Roboto on Android, SFNS on Apple, Segoe UI on Windows, sans-serif via
  fontconfig/common paths on Linux). No Roboto TTF is bundled in native
  packages or binaries.
- **Web** — embedded Roboto (no system font file API).

**Full-color emoji** inside `Text` runs on every platform:

- **Android / Apple** — OS emoji rasterizer (Paint/Canvas, CoreText). No Noto
  Color Emoji TTF is shipped.
- **Windows** — OS emoji rasterizer (DirectWrite/D2D, Segoe UI Emoji). Segoe has
  no ISO country-flag glyphs (regional indicators would show as `US`/`JP`), so
  Windows packages also ship a small `NotoColorEmoji-Flags.ttf` CBDT subset
  (~0.85 MB) used only for flag clusters.
- **Linux / web** — CBDT/GSUB pipeline using system or bundled
  `NotoColorEmoji.ttf` (web embeds it; Linux desktop packages it when the
  system font is missing).

Apps can still call `loadEmoji()` to register a custom CBDT font on any
platform (that overrides the OS rasterizer).

Every host also bundles Material Symbols (icons).

## Icons

```tsx
import { Icon, IconButton } from 'rayact/react';

<Icon name="alarm" size={28} color={0xFFF176FF} />
<IconButton icon="settings" onPress={openSettings} />
```

Icon names are Material Symbols identifiers. The lookup table ships as
`rayact/shared/material-icons` and is imported automatically by dev clients;
release builds stage it into the app (desktop copies it under
`resources/fonts/`).

```ts
import 'rayact/shared/material-icons';   // ensure the name → glyph map is registered
```

## Custom fonts with `@font-face`

Declare fonts in CSS; the engine loads them at runtime from your staged assets:

```css
@font-face {
  font-family: "Inter";
  src: url("./rayact-assets/Inter-Variable.ttf") format("truetype");
  font-weight: 100 900;
}

.body { font-family: "Inter"; }
```

- Supported formats: `truetype` / `opentype`.
- Put the font file under your project (conventionally `rayact-assets/`) so
  release builds stage it with the referenced CSS.
- Custom fonts extend their glyph atlas on demand from measured text.

## Typography properties

`font-family`, `font-size`, `font-weight` (100–900), `font-style` (`normal` /
`italic`), `text-decoration` / `text-decoration-line` (`underline`,
`line-through`), `letter-spacing`, `line-height` and `text-align` are supported
from CSS and the `style` prop. React Native’s `underline: true` is also honored.

`font-size` is rasterized at the exact integer dp (no coarse size bucketing), so
nearby sizes stay sharp instead of stretching a shared atlas.

Default line-height is `max(fontSize + 4, fontSize * 1.43)` — set `lineHeight`
explicitly when packing text tightly, or glyph ascenders/descenders may clip
(see [components: Text](/reference/components#text)).
