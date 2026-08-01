import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveHref } from '../../dist/router/runtime/href.js';

test('string hrefs normalize', () => {
  assert.equal(resolveHref('/profile/42'), '/profile/42');
  assert.equal(resolveHref('profile/42'), '/profile/42');
  assert.equal(resolveHref('/about/'), '/about');
  assert.equal(resolveHref('/'), '/');
});

test('object hrefs interpolate dynamic segments', () => {
  assert.equal(
    resolveHref({ pathname: '/profile/[id]', params: { id: 42 } }),
    '/profile/42'
  );
  assert.equal(
    resolveHref({ pathname: '/blog/[...slug]', params: { slug: ['2024', 'hello'] } }),
    '/blog/2024/hello'
  );
});

test('leftover params become the query string', () => {
  assert.equal(
    resolveHref({ pathname: '/profile/[id]', params: { id: 1, tab: 'posts' } }),
    '/profile/1?tab=posts'
  );
  assert.equal(resolveHref({ pathname: '/search', params: { q: 'a b' } }), '/search?q=a%20b');
});

test('param values are URI-encoded in segments', () => {
  assert.equal(
    resolveHref({ pathname: '/file/[name]', params: { name: 'a/b c' } }),
    '/file/a%2Fb%20c'
  );
});
