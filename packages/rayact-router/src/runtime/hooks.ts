import * as React from 'react';
import { useRoute } from '@react-navigation/core';
import { useRouterStore } from './contexts.js';
import type { RootState } from './contexts.js';
import { focusedChain, pathFromState } from './paths.js';
import { router, type Router } from './imperative.js';

export function useRouter(): Router {
  return router;
}

/** Committed root navigation state, updated on every navigation. */
function useRootState(): RootState {
  const store = useRouterStore();
  return React.useSyncExternalStore(
    store.subscribe,
    () => store.rootState,
    () => store.rootState
  );
}

const RESERVED = new Set(['screen', 'params', 'initial', 'state', 'path']);

function cleanParams(params: Record<string, unknown> | undefined): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (RESERVED.has(key) || value === undefined || value === null) continue;
    result[key] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return result;
}

/** URL params of the route this hook is rendered in (path + query params). */
export function useLocalSearchParams<
  T extends Record<string, string | string[]> = Record<string, string | string[]>,
>(): T {
  const route = useRoute();
  const params = route.params as Record<string, unknown> | undefined;
  return React.useMemo(() => cleanParams(params) as T, [params]);
}

/** URL params of the globally focused route; updates even when unfocused. */
export function useGlobalSearchParams<
  T extends Record<string, string | string[]> = Record<string, string | string[]>,
>(): T {
  const store = useRouterStore();
  const state = useRootState();
  return React.useMemo(() => {
    const chain = focusedChain(state, store.tree);
    const leaf = chain[chain.length - 1];
    return cleanParams(leaf?.route.params as Record<string, unknown> | undefined) as T;
  }, [state, store]);
}

/** Current URL path without the query string, e.g. '/profile/42'. */
export function usePathname(): string {
  const store = useRouterStore();
  const state = useRootState();
  return React.useMemo(() => pathFromState(state, store).split('?')[0], [state, store]);
}

/**
 * Focused route's segments including groups, e.g. ['(tabs)', 'profile', '[id]'].
 * 'index' segments are omitted (Expo Router parity).
 */
export function useSegments<T extends string[] = string[]>(): T {
  const store = useRouterStore();
  const state = useRootState();
  return React.useMemo(() => {
    const segments: string[] = [];
    for (const level of focusedChain(state, store.tree)) {
      const name = level.node?.routeName ?? level.route.name;
      for (const segment of name.split('/')) {
        if (segment && segment !== 'index') segments.push(segment);
      }
    }
    return segments as T;
  }, [state, store]);
}
