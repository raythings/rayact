// @rayact/router — Expo-Router-style file-based routing for Rayact.
//
// Routes live in the app/ directory: index.tsx, profile/[id].tsx,
// (group)/_layout.tsx, [...rest].tsx, +not-found.tsx. The manifest is
// generated at build time (virtual:rayact-routes) and rendered onto
// @rayact/navigation navigators; @react-navigation/core owns URL <-> state
// mapping.

export { Stack, Tabs, Slot } from './runtime/navigator.js';
export type { RayactStackNavigationOptions } from './runtime/navigator.js';
export { Link, Redirect } from './runtime/Link.js';
export type { LinkProps, RedirectProps } from './runtime/Link.js';
export { router } from './runtime/imperative.js';
export type { Router } from './runtime/imperative.js';
export type { Href } from './runtime/href.js';
export { resolveHref } from './runtime/href.js';
export {
  useRouter,
  useLocalSearchParams,
  useGlobalSearchParams,
  usePathname,
  useSegments,
} from './runtime/hooks.js';
export { RouterRoot } from './runtime/RouterRoot.js';
export type { RouterRootProps } from './runtime/RouterRoot.js';

// Navigation-focus utilities, re-exported for Expo Router API parity.
export { useFocusEffect, useNavigation, useIsFocused } from '@react-navigation/core';

// Node-side manifest utilities (pure; also used by tests and the Vite plugin).
export { buildRouteTree, findNode, initialRouteNameFor } from './manifest/tree.js';
export { getLinkingConfig } from './manifest/linking-config.js';
export type { LinkingScreensConfig, PathScreenConfig } from './manifest/linking-config.js';
export {
  parseRouteFile,
  isRouteFile,
  isGroupSegment,
  parseDynamicSegment,
  routeNameToPath,
  routePrecedence,
  compareRouteNames,
} from './manifest/parse.js';
export type { ParsedRouteFile } from './manifest/parse.js';
export type { RouteContext, RouteModule, RouteNode, DynamicSegment } from './manifest/types.js';
