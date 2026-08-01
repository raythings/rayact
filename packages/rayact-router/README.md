# @rayact/router

Expo-Router-style file-based routing for [Rayact](https://github.com/raythings/rayact).
Files in `app/` become screens — no route table, no wiring.

```
app/
  _layout.tsx        # <Stack> / <Tabs> / <Slot> layout for the directory
  index.tsx          # /
  profile/[id].tsx   # /profile/:id
  blog/[...slug].tsx # /blog/*  (slug is an array)
  (tabs)/home.tsx    # /home    (groups add no URL segment)
  +not-found.tsx     # fallback for unmatched paths
```

Zero wiring: with no `entry` in `rayact.config.json` and an `app/` directory
present, the entry defaults to `@rayact/router/entry`. Or set it explicitly:

```json
{ "entry": "@rayact/router/entry" }
```

## API

- Navigators: `Stack`, `Tabs`, `Slot` (screens auto-registered from the file
  tree; `<Stack.Screen name options>` overrides options).
- Navigation: `Link`, `Redirect`, `router` / `useRouter()`
  (`navigate` / `push` / `replace` / `back` / `setParams`).
- Hooks: `useLocalSearchParams`, `useGlobalSearchParams`, `usePathname`,
  `useSegments`, `useFocusEffect`.
- Deep links via `@rayact/linking`; browser URL sync on the web target.

Built on `@rayact/navigation` (react-navigation state) and
`@react-navigation/core`'s `getStateFromPath` / `getPathFromState`.

Docs: `docs/guide/router.md`.
