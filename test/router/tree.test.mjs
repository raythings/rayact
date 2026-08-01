import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRouteTree, findNode, initialRouteNameFor } from '../../dist/router/manifest/tree.js';

const mod = (name) => ({ default: () => null, __name: name });

test('flat app: implicit root layout hoists routes', () => {
  const tree = buildRouteTree({
    './index.tsx': mod('index'),
    './about.tsx': mod('about'),
    './profile/[id].tsx': mod('profile'),
  });
  assert.equal(tree.type, 'layout');
  assert.equal(tree.loadRoute, null, 'implicit root layout has no module');
  assert.deepEqual(tree.children.map(c => c.routeName), ['index', 'about', 'profile/[id]']);
  assert.deepEqual(tree.children[2].dynamic, [{ name: 'id', deep: false }]);
});

test('explicit layouts create nesting levels', () => {
  const tree = buildRouteTree({
    './_layout.tsx': mod('root-layout'),
    './index.tsx': mod('index'),
    './(tabs)/_layout.tsx': mod('tabs-layout'),
    './(tabs)/home.tsx': mod('home'),
    './(tabs)/settings/advanced.tsx': mod('advanced'),
  });
  assert.ok(tree.loadRoute, 'explicit root layout keeps its module');
  assert.deepEqual(tree.children.map(c => c.routeName), ['index', '(tabs)']);
  const tabs = findNode(tree, ['(tabs)']);
  assert.equal(tabs.type, 'layout');
  // settings/ has no _layout, so the route hoists into (tabs) with a compound name.
  assert.deepEqual(tabs.children.map(c => c.routeName), ['home', 'settings/advanced']);
});

test('not-found sorts last and keeps its type', () => {
  const tree = buildRouteTree({
    './index.tsx': mod('index'),
    './[user].tsx': mod('user'),
    './+not-found.tsx': mod('nf'),
  });
  assert.deepEqual(tree.children.map(c => c.routeName), ['index', '[user]', '+not-found']);
  assert.equal(tree.children[2].type, 'notFound');
});

test('initialRouteNameFor prefers unstable_settings, else first child', () => {
  const withSettings = buildRouteTree({
    './_layout.tsx': { default: () => null, unstable_settings: { initialRouteName: 'about' } },
    './index.tsx': mod('index'),
    './about.tsx': mod('about'),
  });
  assert.equal(initialRouteNameFor(withSettings), 'about');

  const plain = buildRouteTree({
    './index.tsx': mod('index'),
    './about.tsx': mod('about'),
    './+not-found.tsx': mod('nf'),
  });
  assert.equal(initialRouteNameFor(plain), 'index');
});

test('catch-all node records deep dynamic segment', () => {
  const tree = buildRouteTree({
    './index.tsx': mod('index'),
    './blog/[...slug].tsx': mod('blog'),
  });
  const blog = tree.children.find(c => c.routeName === 'blog/[...slug]');
  assert.deepEqual(blog.dynamic, [{ name: 'slug', deep: true }]);
});
