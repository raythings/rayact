import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRouteTree } from '../../dist/router/manifest/tree.js';
import { getLinkingConfig } from '../../dist/router/manifest/linking-config.js';
import { stateFromPath, pathFromState, focusedChain } from '../../dist/router/runtime/paths.js';

const mod = (name) => ({ default: () => null, __name: name });

function makeStore(ctx) {
  const tree = buildRouteTree(ctx);
  return { tree, linking: getLinkingConfig(tree) };
}

function leafOf(state, tree) {
  const chain = focusedChain(state, tree);
  return chain[chain.length - 1];
}

test('static and dynamic paths round-trip through state', () => {
  const store = makeStore({
    './index.tsx': mod('index'),
    './about.tsx': mod('about'),
    './profile/[id].tsx': mod('profile'),
  });

  const aboutState = stateFromPath('/about', store);
  assert.ok(aboutState, 'about resolves');
  assert.equal(pathFromState(aboutState, store), '/about');

  const profileState = stateFromPath('/profile/42', store);
  const leaf = leafOf(profileState, store.tree);
  assert.equal(leaf.route.name, 'profile/[id]');
  assert.equal(leaf.route.params.id, '42');
  assert.equal(pathFromState(profileState, store), '/profile/42');

  const rootState = stateFromPath('/', store);
  assert.ok(rootState, 'index resolves');
  assert.equal(pathFromState(rootState, store), '/');
});

test('group segments are transparent in URLs but present in state', () => {
  const store = makeStore({
    './_layout.tsx': mod('root'),
    './(tabs)/_layout.tsx': mod('tabs'),
    './(tabs)/home.tsx': mod('home'),
    './(tabs)/profile/[id].tsx': mod('profile'),
  });

  const state = stateFromPath('/profile/7', store);
  assert.ok(state, 'group-nested dynamic route resolves without the group in the URL');
  const chain = focusedChain(state, store.tree);
  assert.deepEqual(chain.map(l => l.route.name), ['(tabs)', 'profile/[id]']);
  assert.equal(chain[1].route.params.id, '7');
  assert.equal(pathFromState(state, store), '/profile/7');

  const home = stateFromPath('/home', store);
  assert.ok(home, 'group static route resolves');
  assert.equal(pathFromState(home, store), '/home');
});

test('catch-all captures rest segments as an array', () => {
  const store = makeStore({
    './index.tsx': mod('index'),
    './blog/[...slug].tsx': mod('blog'),
  });
  const state = stateFromPath('/blog/2024/07/hello', store);
  const leaf = leafOf(state, store.tree);
  assert.equal(leaf.route.name, 'blog/[...slug]');
  assert.deepEqual(leaf.route.params.slug, ['blog', '2024', '07', 'hello'].slice(1));
  assert.equal(pathFromState(state, store), '/blog/2024/07/hello');
});

test('unmatched path returns undefined; +not-found matches when present', () => {
  const bare = makeStore({ './index.tsx': mod('index') });
  assert.equal(stateFromPath('/nope/nothing', bare), undefined);

  const withNotFound = makeStore({
    './index.tsx': mod('index'),
    './+not-found.tsx': mod('nf'),
  });
  const state = stateFromPath('/nope/nothing', withNotFound);
  assert.ok(state, '+not-found catches unmatched paths');
  const leaf = leafOf(state, withNotFound.tree);
  assert.equal(leaf.node.type, 'notFound');
  assert.deepEqual(leaf.route.params['not-found'], ['nope', 'nothing']);
  assert.equal(pathFromState(state, withNotFound), '/nope/nothing');
});

test('query params survive the round trip', () => {
  const store = makeStore({ './search.tsx': mod('search'), './index.tsx': mod('index') });
  const state = stateFromPath('/search?q=hello&page=2', store);
  const leaf = leafOf(state, store.tree);
  assert.equal(leaf.route.params.q, 'hello');
  assert.equal(leaf.route.params.page, '2');
  const path = pathFromState(state, store);
  assert.ok(path.startsWith('/search?'), path);
  assert.ok(path.includes('q=hello') && path.includes('page=2'), path);
});

test('static wins over dynamic for the same URL', () => {
  const store = makeStore({
    './settings.tsx': mod('settings'),
    './[user].tsx': mod('user'),
    './index.tsx': mod('index'),
  });
  const state = stateFromPath('/settings', store);
  assert.equal(leafOf(state, store.tree).route.name, 'settings');
  const userState = stateFromPath('/alice', store);
  assert.equal(leafOf(userState, store.tree).route.name, '[user]');
  assert.equal(leafOf(userState, store.tree).route.params.user, 'alice');
});
