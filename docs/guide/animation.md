# Animation

Three layers, cheapest first: **CSS transitions/animations** (declarative, run
entirely on the native render thread), **`SharedValue`** (imperative, zero-copy
into the render loop), and **React-state hooks** (`useAnimatedValue` /
`useSpring`, re-render per frame — fine for small UI, avoid for large trees).

## CSS transitions

Any supported property change animates when the matched rule declares a
transition. The native transition engine ticks on the render thread — no JS
per frame:

```css
.card {
  background-color: var(--surface);
  transition: background-color 150ms ease, transform 200ms ease-out;
}
.card:hover { background-color: var(--surface-2); }
```

Shorthand (`transition: <prop> <duration> <easing> [delay]`) and multiple
comma-separated transitions are supported; easing keywords: `linear`, `ease`,
`ease-in`, `ease-out`, `ease-in-out`.

## CSS `@keyframes` animations

```css
@keyframes pulse {
  from { scale: 1; opacity: 1; }
  50%  { scale: 1.06; opacity: 0.85; }
  to   { scale: 1; opacity: 1; }
}
.badge { animation: pulse 1.2s ease-in-out infinite; }
```

`animation` shorthand supports duration, easing, delay, iteration count
(`infinite`), `alternate`/`alternate-reverse`/`reverse` direction, and
fill modes (`forwards`, `backwards`, `both`). Animations run natively; setting
the same property from JS cancels the native track for that node (JS wins).
Offscreen nodes are paint-culled but animation state keeps ticking, so
scrolling back reveals the correct frame.

## SharedValue — imperative, render-thread driven

`SharedValue` writes into a shared float buffer the renderer reads every frame
— no reconciliation, no bridge traffic per frame. Animatable properties:
`translateX`, `translateY`, `scale`, `opacity`, `rotation`.

```tsx
import { useSharedValue, withTiming, withSpring, View } from 'rayact/react';

function Sheet({ open }: { open: boolean }) {
  const y = useSharedValue(300);

  React.useEffect(() => {
    y.value = open ? withSpring(0, 170, 26) : withTiming(300, 250);
  }, [open]);

  return <View style={{ translateY: y }}>{/* … */}</View>;
}
```

- Assign a **number** for an immediate jump, or a `withTiming(target, duration)` /
  `withSpring(target, stiffness?, damping?)` config to animate.
- Read `sv.value` for the live value.
- Pass the SharedValue directly in `style`; the reconciler binds it to the
  node's animated-style slot.

## React-state hooks

```tsx
import { useAnimatedValue, useSpring, easeInOutCubic } from 'rayact/react';

const width = useAnimatedValue(expanded ? 320 : 96, { duration: 300, easing: easeInOutCubic });
const scale = useSpring(pressed ? 0.96 : 1, { stiffness: 170, damping: 26 });
```

Both return a plain number that updates through React state each frame —
simple and composable, at re-render cost. `useAnimatedValue` options:
`duration`, `easing`, `from`, `onSettled`.

## Reduced motion

```ts
import { useReducedMotion } from 'rayact/react';
const reduce = useReducedMotion();   // respect the OS setting
```

## Choosing a layer

| Use case | Reach for |
| --- | --- |
| Hover/press feedback, theme fades | CSS transitions + `:hover`/`:active` |
| Looping decorations, attention pulses | CSS `@keyframes` |
| Gestures, sheets, drag-follow, 60fps guarantees | `SharedValue` |
| Small one-off UI morphs | `useAnimatedValue` / `useSpring` |
