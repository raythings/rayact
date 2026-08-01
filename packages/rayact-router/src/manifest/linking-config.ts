import { routeNameToPath } from './parse.js';
import { initialRouteNameFor } from './tree.js';
import type { RouteNode } from './types.js';

/** Subset of react-navigation's PathConfig we generate. */
export interface PathScreenConfig {
  path?: string;
  screens?: Record<string, PathScreenConfig | string>;
  initialRouteName?: string;
}

export interface LinkingScreensConfig {
  screens: Record<string, PathScreenConfig | string>;
  initialRouteName?: string;
}

/**
 * react-navigation linking config generated from the route tree, consumed by
 * @react-navigation/core getStateFromPath / getPathFromState / getActionFromState.
 * Groups and index segments contribute empty paths; dynamic segments become
 * :param patterns; catch-alls and +not-found become '*'.
 */
export function getLinkingConfig(root: RouteNode): LinkingScreensConfig {
  return {
    screens: buildScreens(root),
    initialRouteName: initialRouteNameFor(root),
  };
}

function buildScreens(node: RouteNode): Record<string, PathScreenConfig> {
  const screens: Record<string, PathScreenConfig> = {};
  for (const child of node.children) {
    const entry: PathScreenConfig = { path: routeNameToPath(child.routeName) };
    if (child.type === 'layout') {
      entry.screens = buildScreens(child);
      const initial = initialRouteNameFor(child);
      if (initial !== undefined) entry.initialRouteName = initial;
    }
    screens[child.routeName] = entry;
  }
  return screens;
}
