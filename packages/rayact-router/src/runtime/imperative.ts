import { CommonActions } from '@react-navigation/routers';
import type { NavigationState, PartialState, NavigationAction } from '@react-navigation/routers';
import type { Href } from './href.js';
import { resolveHref } from './href.js';
import { stateFromPath } from './paths.js';
import type { RouterStore } from './contexts.js';

type AnyState = NavigationState | PartialState<NavigationState>;
type AnyRoute = AnyState['routes'][number] & {
  state?: AnyState;
  params?: Record<string, unknown>;
};

let activeStore: RouterStore | null = null;
const pendingNavigations: Array<() => void> = [];

/** Called by RouterRoot on mount/unmount. */
export function setActiveRouterStore(store: RouterStore | null): void {
  activeStore = store;
}

/** Called by RouterRoot once the navigation container is ready. */
export function flushPendingNavigations(): void {
  while (pendingNavigations.length) pendingNavigations.shift()!();
}

export type NavigationKind = 'navigate' | 'push' | 'replace';

export function linkTo(href: Href, kind: NavigationKind = 'navigate'): void {
  const store = activeStore;
  if (!store) {
    console.warn('[rayact-router] Navigation attempted before the router mounted; ignoring.');
    return;
  }
  if (!store.ref.isReady()) {
    pendingNavigations.push(() => linkTo(href, kind));
    return;
  }
  const path = resolveHref(href);
  const state = stateFromPath(path, store);
  if (!state) {
    navigateToNotFound(path, store);
    return;
  }
  const rootState = store.ref.getRootState() as AnyState | undefined;
  store.ref.dispatch(getNavigateAction(state, rootState, kind));
}

function navigateToNotFound(path: string, store: RouterStore): void {
  const notFound = store.tree.children.find(child => child.type === 'notFound');
  if (!notFound) {
    console.warn(`[rayact-router] No route matches "${path}" and no app/+not-found route exists.`);
    return;
  }
  store.ref.dispatch(
    CommonActions.navigate(notFound.routeName, {
      'not-found': path.split(/[?#]/)[0].split('/').filter(Boolean),
    })
  );
}

/**
 * Convert a desired navigation state into ONE action dispatched at the
 * deepest navigator both states share (Expo Router's linkTo strategy): walking
 * to the divergence point keeps already-mounted parent navigators in place,
 * and the action type (NAVIGATE/PUSH/REPLACE) applies where the change
 * actually happens instead of resetting from the root.
 */
export function getNavigateAction(
  desired: AnyState,
  current: AnyState | undefined,
  kind: NavigationKind
): NavigationAction {
  let desiredLevel: AnyState = desired;
  let currentLevel: AnyState | undefined = current;
  let target = (current as NavigationState | undefined)?.key;

  for (;;) {
    const desiredRoute = focusedRoute(desiredLevel);
    const currentRoute = currentLevel ? focusedRoute(currentLevel) : undefined;
    if (
      desiredRoute.state &&
      currentRoute?.state &&
      currentRoute.name === desiredRoute.name &&
      (currentRoute.state as NavigationState).key
    ) {
      target = (currentRoute.state as NavigationState).key;
      desiredLevel = desiredRoute.state;
      currentLevel = currentRoute.state;
      continue;
    }
    const type = kind === 'push' ? 'PUSH' : kind === 'replace' ? 'REPLACE' : 'NAVIGATE';
    return {
      type,
      target,
      payload: { name: desiredRoute.name, params: nestedParams(desiredRoute) },
    } as NavigationAction;
  }
}

function focusedRoute(state: AnyState): AnyRoute {
  const index = typeof state.index === 'number' ? state.index : state.routes.length - 1;
  return state.routes[index] as AnyRoute;
}

/** Collapse a desired sub-state into react-navigation nested screen params. */
function nestedParams(route: AnyRoute): Record<string, unknown> | undefined {
  if (!route.state) return route.params;
  const child = focusedRoute(route.state);
  return { ...route.params, screen: child.name, params: nestedParams(child) };
}

export interface Router {
  /** Navigate to the href (re-uses an existing screen with the same name). */
  navigate(href: Href): void;
  /** Push a new screen onto the nearest stack, even for a repeated route. */
  push(href: Href): void;
  /** Replace the current screen. */
  replace(href: Href): void;
  back(): void;
  canGoBack(): boolean;
  /** Update the focused route's params. */
  setParams(params: Record<string, unknown>): void;
}

export const router: Router = {
  navigate: href => linkTo(href, 'navigate'),
  push: href => linkTo(href, 'push'),
  replace: href => linkTo(href, 'replace'),
  back: () => {
    if (activeStore?.ref.isReady()) activeStore.ref.goBack();
  },
  canGoBack: () => (activeStore?.ref.isReady() ? activeStore.ref.canGoBack() : false),
  setParams: params => {
    if (activeStore?.ref.isReady()) activeStore.ref.dispatch(CommonActions.setParams(params));
  },
};
