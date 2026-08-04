# File-based routing

`@rayact/router` gives Rayact apps Expo-Router-style file-based routing: files in
an `app/` directory become screens automatically — no route table, no manual
wiring. Under the hood it layers on [`@rayact/navigation`](/guide/navigation)
(react-navigation state) and `@react-navigation/core`'s URL machinery.

## Zero wiring

Create an `app/` directory and start the dev server. When `rayact.config.json`
declares no `entry` and `app/` contains at least one route file, the entry
defaults to `@rayact/router/entry`:

```
[rayact] Using file-based routing from app/ (@rayact/router/entry)
```

You can also make it explicit (recommended for new projects — the
`default-router` template does this):

```json
{ "entry": "@rayact/router/entry" }
```

Scaffold a ready-made project:

```bash
npx create-rayact-app my-app --template default-router
```

Install the packages in an existing project: `@rayact/router`,
`@rayact/navigation`, and `@rayact/linking` (all lockstep-versioned with
`rayact`).

## Route conventions

| File | Route |
|------|-------|
| `app/index.tsx` | `/` |
| `app/about.tsx` | `/about` |
| `app/profile/[id].tsx` | `/profile/:id` — `useLocalSearchParams().id` |
| `app/blog/[...slug].tsx` | `/blog/*` — `slug` is an array of segments |
| `app/(tabs)/home.tsx` | `/home` — `(group)` adds no URL segment |
| `app/_layout.tsx` | Layout wrapping the directory's routes |
| `app/+not-found.tsx` | Fallback for unmatched paths |

Every route file default-exports a component. Directories nest: a directory
with its own `_layout.tsx` becomes a nested navigator; without one, its files
hoist into the nearest ancestor layout (`profile/[id]` in the example above).

Matching precedence at each level: `index` → static → `[dynamic]` →
`[...catch-all]` → `+not-found`.

## Layouts

`_layout.tsx` decides how a directory's routes render:

```tsx
// app/_layout.tsx
import { Stack } from '@rayact/router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
    </Stack>
  );
}
```

- **`<Stack>`** — Rayact's stack navigator; screens are registered from the
  file tree, and `<Stack.Screen name options initialParams>` elements only
  override options. All [Rayact stack screen options](/guide/navigation)
  (`animation`, `lazy`, `cacheByName`, `detachInactiveScreens`, …) apply.
- **`<Tabs>`** — bottom-tabs navigator, same pattern.
- **`<Slot />`** — renders the focused child route with no navigator chrome.
- No `_layout.tsx` — the directory gets an implicit default `<Stack />`.

A layout can export `unstable_settings = { initialRouteName: '...' }` to pick
the initial screen.

## Navigating

```tsx
import { Link, Redirect, router, useRouter } from '@rayact/router';

<Link href="/profile/42">Open profile</Link>
<Link href={{ pathname: '/profile/[id]', params: { id: 42, tab: 'posts' } }} push>
  Push profile
</Link>
<Redirect href="/login" />

router.navigate('/profile/42'); // re-use an existing screen with the same name
router.push('/profile/42');     // always push a new screen
router.replace('/login');
router.back();
router.setParams({ tab: 'likes' });
```

`Link` renders string children as a pressable `<Text>`; other children are
wrapped in a `<Pressable>`. `style`/`className` pass through.

## Hooks

| Hook | Returns |
|------|---------|
| `useRouter()` | the imperative `router` object |
| `useLocalSearchParams()` | path + query params of this screen |
| `useGlobalSearchParams()` | params of the focused route, updates everywhere |
| `usePathname()` | current path, e.g. `/profile/42` |
| `useSegments()` | route segments incl. groups, e.g. `['(tabs)', 'profile', '[id]']` |
| `useFocusEffect(cb)` | run an effect when the screen gains focus |

## Deep linking and web URLs

- **Native** — the initial URL and `url` events come from
  [`@rayact/linking`](/guide/navigation#deep-links); custom schemes map
  `myapp://profile/42` → `/profile/42`. Declare schemes under
  `linking.schemes` in `rayact.config.json`.
- **Web** — the address bar stays in sync: navigation pushes/replaces browser
  history, back/forward buttons navigate, and loading `/profile/42` directly
  restores that screen. Desktop/mobile QuickJS hosts never touch
  `window.history`.

Unmatched deep links land on the nearest `+not-found` route (a built-in
fallback screen is used if the app doesn't define one).

## Configuration

```json
{
  "router": { "appDir": "app" }
}
```

`router.appDir` relocates the routes directory. An explicit `entry` in
`rayact.config.json` always wins over auto-detection.

## Dev loop

- Editing a route file hot-reloads it in place (React Fast Refresh).
- Adding or deleting a route file regenerates the route manifest and triggers
  a full reload automatically.
