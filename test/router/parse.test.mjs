import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isRouteFile,
  parseRouteFile,
  isGroupSegment,
  parseDynamicSegment,
  routeNameToPath,
  routePrecedence,
  compareRouteNames,
} from '../../dist/router/manifest/parse.js';

test('isRouteFile accepts route sources and rejects non-routes', () => {
  assert.ok(isRouteFile('./index.tsx'));
  assert.ok(isRouteFile('./profile/[id].ts'));
  assert.ok(isRouteFile('./(tabs)/_layout.jsx'));
  assert.ok(isRouteFile('./deep/[...rest].js'));
  assert.ok(!isRouteFile('./styles.css'));
  assert.ok(!isRouteFile('./readme.md'));
  assert.ok(!isRouteFile('./.hidden.tsx'));
  assert.ok(!isRouteFile('./__tests__/index.test.tsx'));
  assert.ok(!isRouteFile('./sub/node_modules/x.tsx'));
});

test('parseRouteFile classifies layout, not-found, and route files', () => {
  assert.deepEqual(parseRouteFile('./_layout.tsx'), {
    contextKey: './_layout.tsx', dir: [], base: '_layout', type: 'layout',
  });
  assert.deepEqual(parseRouteFile('./(tabs)/home.tsx'), {
    contextKey: './(tabs)/home.tsx', dir: ['(tabs)'], base: 'home', type: 'route',
  });
  assert.deepEqual(parseRouteFile('./docs/+not-found.tsx'), {
    contextKey: './docs/+not-found.tsx', dir: ['docs'], base: '+not-found', type: 'notFound',
  });
});

test('dynamic segment parsing', () => {
  assert.deepEqual(parseDynamicSegment('[id]'), { name: 'id', deep: false });
  assert.deepEqual(parseDynamicSegment('[...rest]'), { name: 'rest', deep: true });
  assert.equal(parseDynamicSegment('plain'), null);
  assert.equal(parseDynamicSegment('[]'), null);
  assert.equal(parseDynamicSegment('[...]'), null);
  assert.ok(isGroupSegment('(tabs)'));
  assert.ok(!isGroupSegment('()'));
  assert.ok(!isGroupSegment('tabs'));
});

test('routeNameToPath maps conventions to react-navigation patterns', () => {
  assert.equal(routeNameToPath('index'), '');
  assert.equal(routeNameToPath('profile/[id]'), 'profile/:id');
  assert.equal(routeNameToPath('(tabs)/home'), 'home');
  assert.equal(routeNameToPath('blog/[...slug]'), 'blog/*');
  assert.equal(routeNameToPath('+not-found'), '*');
  assert.equal(routeNameToPath('docs/+not-found'), 'docs/*');
});

test('precedence: index < static < dynamic < catch-all < not-found', () => {
  assert.ok(routePrecedence('index') < routePrecedence('about'));
  assert.ok(routePrecedence('about') < routePrecedence('[id]'));
  assert.ok(routePrecedence('[id]') < routePrecedence('[...rest]'));
  assert.ok(routePrecedence('[...rest]') < routePrecedence('+not-found'));
  const sorted = ['+not-found', '[id]', 'about', 'index', '[...all]'].sort(compareRouteNames);
  assert.deepEqual(sorted, ['index', 'about', '[id]', '[...all]', '+not-found']);
});
