# Tailwind CSS

Tailwind v4 utilities work in Rayact: the Tailwind CLI generates plain CSS, the
engine parses it natively, and `className` matches the generated classes. No
Babel plugin, no runtime — it is just CSS.

## Setup

```sh
npm install -D tailwindcss @tailwindcss/cli
```

Create `tailwind/input.css`:

```css
@import "tailwindcss";
@source "./content.html";
```

Tailwind v4 tree-shakes by scanning source files. Rayact apps are TSX, which
the scanner reads fine — point `@source` at your `src/` directory, or (like the
raycalc reference app) maintain an explicit safelist file `tailwind/content.html`
containing every utility you use:

```html
<div class="flex flex-col items-center gap-4 p-6 rounded-xl bg-slate-900 text-slate-100"></div>
```

## Generate the stylesheet

```sh
npx @tailwindcss/cli -i tailwind/input.css -o rayact-assets/tailwind.css
```

Add it as an npm script (`"tailwind": "tailwindcss -i tailwind/input.css -o rayact-assets/tailwind.css --watch"`)
and import the output once from your app:

```tsx
import '../rayact-assets/tailwind.css';

<View className="flex-1 items-center justify-center gap-4 bg-slate-900">
  <Text className="text-2xl font-bold text-slate-100">Styled by Tailwind</Text>
</View>
```

Commit the generated `tailwind.css` — builds stage it like any other stylesheet
and don't run Tailwind for you.

## What works

Tailwind v4's palette is OKLCH-based, which Rayact's CSS Color 4 parser handles
natively. Utilities that compile to supported properties all work: layout/flex
(`flex`, `items-*`, `justify-*`, `gap-*`), spacing (`p-*`, `m-*`), sizing
(`w-*`, `h-*`, `min/max-*`), typography (`text-*`, `font-*`, `leading-*`,
`tracking-*`), color (`bg-*`, `text-*`, `border-*`), borders + radius,
`opacity-*`, `shadow-*`/`elevation`, `transition-*`, `animate-*`, state
variants (`hover:`, `active:`, `disabled:`) and responsive/dark variants
(`md:`, `dark:`).

## What doesn't

Utilities relying on selectors Rayact doesn't implement are no-ops — notably
`space-x-*` / `space-y-*` and `divide-*` (they compile to child combinators,
unsupported on native; use `gap-*` and `Divider` instead), plus anything
grid-based (`grid`, `col-span-*`). See the
[CSS reference](/reference/css) for the exact property support table.
