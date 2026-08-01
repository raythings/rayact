# __PROJECT_NAME__

Rayact app — React UI on QuickJS + raylib, with file-based routing (@rayact/router).

## Routing

Files in `app/` become screens automatically — no route table, no wiring:

| File | Route |
|------|-------|
| `app/index.tsx` | `/` |
| `app/details/[id].tsx` | `/details/:id` |
| `app/_layout.tsx` | layout (Stack/Tabs) wrapping the directory |
| `app/+not-found.tsx` | fallback for unmatched routes |

Also supported: `(group)` directories (no URL segment), `[...rest]` catch-alls,
nested `_layout.tsx` files. Navigate with `<Link href="/details/42">`, the
`router` object (`router.push/replace/back`), and read params with
`useLocalSearchParams()`.

## Get started

```bash
npm install
npm run dev
```

In another terminal:

```bash
npm run start:dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Rayact dev server (bundler + HMR) |
| `npm run android` | Install + launch the prebuilt Android dev app |
| `npm run ios` | Install + launch the prebuilt iOS simulator dev app |
| `npm run prebuild` | Materialize native Android/iOS shells linked to prebuilts |
| `npm run build:desktop` | Build a self-contained desktop release |
| `npm run build:android` | Build Android release |
| `npm run build:ios` | Build iOS release |
