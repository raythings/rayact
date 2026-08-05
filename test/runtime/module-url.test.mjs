import assert from 'node:assert/strict';
import test from 'node:test';
import { toRayactModuleUrl } from '../../packages/rayact-runtime/dist/moduleHmr.js';

test('toRayactModuleUrl percent-encodes dynamic route brackets', () => {
  const url = toRayactModuleUrl(
    '/Volumes/Storage/Projects/app/asset/[id].tsx',
    'http://127.0.0.1:8081',
  );
  assert.equal(
    url,
    'http://127.0.0.1:8081/rayact/m/Volumes/Storage/Projects/app/asset/%5Bid%5D.tsx',
  );
});

test('toRayactModuleUrl does not double-encode already-encoded segments', () => {
  const url = toRayactModuleUrl(
    '/rayact/m/Volumes/Storage/Projects/app/asset/%5Bid%5D.tsx',
    'http://127.0.0.1:8081',
  );
  assert.equal(
    url,
    'http://127.0.0.1:8081/rayact/m/Volumes/Storage/Projects/app/asset/%5Bid%5D.tsx',
  );
});

test('toRayactModuleUrl preserves query strings', () => {
  const url = toRayactModuleUrl(
    '/app/profile/[id].tsx?platform=ios',
    'http://127.0.0.1:8081',
  );
  assert.equal(
    url,
    'http://127.0.0.1:8081/rayact/m/app/profile/%5Bid%5D.tsx?platform=ios',
  );
});
