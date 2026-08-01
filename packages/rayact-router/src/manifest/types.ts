import type * as React from 'react';

/** A module loaded from the app/ directory via the routes manifest. */
export interface RouteModule {
  default?: React.ComponentType<Record<string, unknown>>;
  /** Layout-only: initial route + per-group anchors, Expo Router parity. */
  unstable_settings?: { initialRouteName?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

/** Flat manifest exported by virtual:rayact-routes. */
export type RouteContext = Record<string, RouteModule>;

export type DynamicSegment = {
  /** Param name without brackets, e.g. 'id' for [id].tsx. */
  name: string;
  /** True for catch-all [...rest].tsx segments. */
  deep: boolean;
};

export type RouteNodeType = 'route' | 'layout' | 'notFound';

export interface RouteNode {
  /**
   * Route name react-navigation screens are registered under. Relative to the
   * parent layout, e.g. 'profile/[id]' or '(tabs)/home' — never starts with /.
   * The root layout node's name is ''.
   */
  routeName: string;
  /** Original manifest key, e.g. './profile/[id].tsx'. Empty for implicit nodes. */
  contextKey: string;
  type: RouteNodeType;
  /** Dynamic params contributed by this node's own segments (not ancestors). */
  dynamic: DynamicSegment[];
  children: RouteNode[];
  /** Loads the route/layout module; null for implicit (generated) layouts. */
  loadRoute: (() => RouteModule) | null;
}
