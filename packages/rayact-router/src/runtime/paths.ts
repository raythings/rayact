import { getPathFromState, getStateFromPath } from '@react-navigation/core';
import type { NavigationState, PartialState, Route } from '@react-navigation/routers';
import { parseDynamicSegment, routeNameToPath } from '../manifest/parse.js';
import type { RouteNode } from '../manifest/types.js';
import type { RouterStore, RootState } from './contexts.js';

type AnyRoute = Route<string> & {
  state?: NavigationState | PartialState<NavigationState>;
  params?: Record<string, unknown>;
};

export interface FocusedLevel {
  route: AnyRoute;
  /** Tree node for this route, when the state still matches the manifest. */
  node: RouteNode | null;
}

/** Focused route at every nesting level, root-first, paired with tree nodes. */
export function focusedChain(state: RootState, tree: RouteNode): FocusedLevel[] {
  const chain: FocusedLevel[] = [];
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  let node: RouteNode | null = tree;
  while (current && current.routes.length > 0) {
    const index = typeof current.index === 'number' ? current.index : current.routes.length - 1;
    const route = current.routes[index] as AnyRoute;
    node = node?.children.find(child => child.routeName === route.name) ?? null;
    chain.push({ route, node });
    current = route.state;
  }
  return chain;
}

/**
 * Inbound URL → navigation state via @react-navigation/core, then repair
 * catch-all params: core's '*' wildcard matches but captures nothing, so the
 * unmatched trailing segments are re-derived here and attached as the
 * [...param] value ('not-found' for +not-found routes) — Expo Router parity.
 */
export function stateFromPath(path: string, store: RouterStore): RootState {
  let state: RootState;
  try {
    state = getStateFromPath(path, {
      screens: store.linking.screens as never,
      initialRouteName: store.linking.initialRouteName,
    });
  } catch {
    return undefined;
  }
  if (!state) return undefined;

  const chain = focusedChain(state, store.tree);
  const leaf = chain[chain.length - 1];
  if (!leaf?.node) return state;
  const deep = leaf.node.dynamic.find(d => d.deep);
  const isNotFound = leaf.node.type === 'notFound';
  if (!deep && !isNotFound) return state;

  const patternParts = chain
    .flatMap(level => (level.node ? routeNameToPath(level.node.routeName).split('/') : []))
    .filter(Boolean);
  const starIndex = patternParts.indexOf('*');
  if (starIndex === -1) return state;
  const urlSegments = path.split(/[?#]/)[0].split('/').filter(Boolean).map(safeDecode);
  const rest = urlSegments.slice(starIndex);
  const paramName = deep?.name ?? 'not-found';
  leaf.route.params = { ...leaf.route.params, [paramName]: rest };
  return state;
}

const RESERVED_PARAM_KEYS = new Set(['screen', 'params', 'initial', 'state', 'path']);

/**
 * Navigation state → URL path by walking the route tree along the focused
 * chain (not core getPathFromState: its '*' segments serialize as the route
 * name, which breaks catch-all and +not-found paths). Leftover leaf params
 * become the query string.
 */
export function pathFromState(state: RootState, store: RouterStore): string {
  if (!state) return '/';
  const chain = focusedChain(state, store.tree);
  if (chain.some(level => !level.node)) {
    // State no longer matches the manifest (e.g. mid-HMR); core's serializer
    // is the best remaining approximation.
    try {
      return getPathFromState(state as NavigationState, { screens: store.linking.screens as never });
    } catch {
      return '/';
    }
  }

  const parts: string[] = [];
  const consumed = new Set<string>();
  for (const level of chain) {
    const params = (level.route.params ?? {}) as Record<string, unknown>;
    for (const segment of level.node!.routeName.split('/')) {
      if (segment === 'index' || (segment.startsWith('(') && segment.endsWith(')'))) continue;
      if (segment === '+not-found') {
        pushRestSegments(parts, params['not-found']);
        consumed.add('not-found');
        continue;
      }
      const dynamic = parseDynamicSegment(segment);
      if (!dynamic) {
        parts.push(segment);
        continue;
      }
      consumed.add(dynamic.name);
      if (dynamic.deep) {
        pushRestSegments(parts, params[dynamic.name]);
      } else {
        const value = params[dynamic.name];
        if (value !== undefined && value !== null) parts.push(encodeURIComponent(String(value)));
      }
    }
  }

  const leafParams = (chain[chain.length - 1]?.route.params ?? {}) as Record<string, unknown>;
  const query: string[] = [];
  for (const [key, value] of Object.entries(leafParams)) {
    if (consumed.has(key) || RESERVED_PARAM_KEYS.has(key) || value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      query.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
    }
  }
  return `/${parts.join('/')}${query.length ? `?${query.join('&')}` : ''}`;
}

function pushRestSegments(parts: string[], value: unknown): void {
  if (value === undefined || value === null) return;
  for (const item of Array.isArray(value) ? value : [value]) {
    parts.push(encodeURIComponent(String(item)));
  }
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
