import * as React from 'react';
import { NavigationContainer } from '@rayact/navigation';
import { buildRouteTree } from '../manifest/tree.js';
import { getLinkingConfig } from '../manifest/linking-config.js';
import type { RouteContext } from '../manifest/types.js';
import { createRouterStore, RouterStoreContext, type RootState } from './contexts.js';
import {
  flushPendingNavigations,
  linkTo,
  setActiveRouterStore,
} from './imperative.js';
import {
  getInitialRoutePath,
  isWebHistoryAvailable,
  subscribeToIncomingLinks,
  syncWebHistory,
} from './linking.js';
import { RouteRenderer } from './navigator.js';
import { focusedChain, pathFromState, stateFromPath } from './paths.js';

export interface RouterRootProps {
  ctx: RouteContext;
}

/**
 * Root of a file-based-routing app: builds the route tree from the
 * virtual:rayact-routes manifest, resolves the initial deep link, and mounts
 * the react-navigation container.
 */
export function RouterRoot({ ctx }: RouterRootProps): React.ReactElement | null {
  const store = React.useMemo(() => {
    const tree = buildRouteTree(ctx);
    return createRouterStore(tree, getLinkingConfig(tree));
  }, [ctx]);

  // Registered during render (not an effect): children's mount effects — e.g.
  // a <Redirect> in app/index.tsx — run before this component's own effects,
  // and they must already reach the imperative router (calls queue until the
  // container is ready).
  setActiveRouterStore(store);
  React.useEffect(() => () => setActiveRouterStore(null), [store]);

  const [initial, setInitial] = React.useState<{ ready: boolean; state?: RootState }>({
    ready: false,
  });

  React.useEffect(() => {
    let cancelled = false;
    void getInitialRoutePath().then(path => {
      if (cancelled) return;
      const state = path && path !== '/' ? stateFromPath(path, store) : undefined;
      setInitial({ ready: true, state });
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  React.useEffect(() => subscribeToIncomingLinks(path => linkTo(path, 'navigate')), [store]);

  // Web URL sync: address bar follows navigation state. New leaf route key →
  // pushState; params-only change → replaceState. syncWebHistory already
  // no-ops when the location matches, which breaks the popstate → navigate →
  // sync loop.
  React.useEffect(() => {
    if (!isWebHistoryAvailable()) return;
    let prevLeafKey: string | undefined;
    return store.subscribe(() => {
      const chain = focusedChain(store.rootState, store.tree);
      const leafKey = chain[chain.length - 1]?.route.key;
      const path = pathFromState(store.rootState, store);
      syncWebHistory(path, leafKey !== undefined && leafKey !== prevLeafKey ? 'push' : 'replace');
      prevLeafKey = leafKey;
    });
  }, [store]);

  if (!initial.ready) return null;

  return (
    <RouterStoreContext.Provider value={store}>
      <NavigationContainer
        ref={store.ref as never}
        initialState={initial.state as never}
        onReady={() => {
          store.onStateChange(store.ref.getRootState());
          flushPendingNavigations();
        }}
        onStateChange={(state: RootState) => store.onStateChange(state)}
      >
        <RouteRenderer node={store.tree} />
      </NavigationContainer>
    </RouterStoreContext.Provider>
  );
}
