# Fonts & icons

## Built-in fonts

Every host bundles Roboto (text), Material Symbols (icons) and Noto Color
Emoji. Full-color emoji render everywhere — including inside `Text` runs —
via the engine's CBDT/GSUB pipeline. Glyph coverage includes extended
punctuation; if a codepoint is missing from the baked atlas you'll see `?`
tofu, which is a signal to load a custom font that covers it.

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
- Custom fonts are not ASCII-limited: the loader bakes the glyphs your locale
  needs, extending the atlas on demand.

## Typography properties

`font-family`, `font-size`, `font-weight` (100–900), `font-style`,
`letter-spacing`, `line-height` and `text-align` are all supported from CSS and
the `style` prop.

Default line-height is `max(fontSize + 4, fontSize * 1.43)` — set `lineHeight`
explicitly when packing text tightly, or glyph ascenders/descenders may clip
(see [components: Text](/reference/components#text)).
