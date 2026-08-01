import * as React from 'react';
import type { NavigationState, PartialState } from '@react-navigation/routers';
import { createNavigationContainerRef } from '@react-navigation/core';
import type { LinkingScreensConfig } from '../manifest/linking-config.js';
import type { RouteNode } from '../manifest/types.js';

export type RootState = NavigationState | PartialState<NavigationState> | undefined;

export interface RouterStore {
  ref: ReturnType<typeof createNavigationContainerRef>;
  tree: RouteNode;
  linking: LinkingScreensConfig;
  /** Last committed root navigation state (undefined before first commit). */
  rootState: RootState;
  subscribe(listener: () => void): () => void;
  /** Called by RouterRoot on every navigation state change. */
  onStateChange(state: RootState): void;
}

export function createRouterStore(tree: RouteNode, linking: LinkingScreensConfig): RouterStore {
  const listeners = new Set<() => void>();
  const store: RouterStore = {
    ref: createNavigationContainerRef(),
    tree,
    linking,
    rootState: undefined,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onStateChange(state) {
      store.rootState = state;
      for (const listener of [...listeners]) listener();
    },
  };
  return store;
}

/** The RouteNode a layout/route component belongs to. */
export const RouteNodeContext = React.createContext<RouteNode | null>(null);

export const RouterStoreContext = React.createContext<RouterStore | null>(null);

export function useRouterStore(): RouterStore {
  const store = React.useContext(RouterStoreContext);
  if (!store) {
    throw new Error(
      'No router store found. File-based routing components must render inside the @rayact/router entry (is your rayact.config.json entry set to "@rayact/router/entry" or an app/ directory present?).'
    );
  }
  return store;
}

export function useRouteNode(): RouteNode {
  const node = React.useContext(RouteNodeContext);
  if (!node) {
    throw new Error('Navigator components from @rayact/router must render inside an app/ layout route.');
  }
  return node;
}
