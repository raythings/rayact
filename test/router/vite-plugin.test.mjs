import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  findAppDir,
  scanRouteFiles,
  generateRoutesModule,
  rayactRouterPlugin,
  RAYACT_ROUTES_ID,
  RESOLVED_RAYACT_ROUTES_ID,
} from '../../dist/router/vite/plugin.js';

function makeFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-router-test-'));
  for (const file of files) {
    const abs = path.join(root, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'export default function R() { return null; }\n');
  }
  return root;
}

test('findAppDir requires a routes directory with route files', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-router-empty-'));
  assert.equal(findAppDir(empty), null, 'no app dir');
  fs.mkdirSync(path.join(empty, 'app'));
  assert.equal(findAppDir(empty), null, 'empty app dir');
  fs.writeFileSync(path.join(empty, 'app/index.tsx'), 'export default () => null;\n');
  assert.equal(findAppDir(empty), path.resolve(empty, 'app'));
  assert.equal(findAppDir(empty, 'routes'), null, 'custom appDir respected');
});

test('scanRouteFiles is sorted, recursive, and filters non-routes', () => {
  const root = makeFixture([
    'app/index.tsx',
    'app/zeta.tsx',
    'app/(tabs)/home.tsx',
    'app/profile/[id].tsx',
    'app/styles.css',
    'app/.hidden.tsx',
    'app/__tests__/x.test.tsx',
  ]);
  const keys = scanRouteFiles(path.join(root, 'app'));
  assert.deepEqual(keys, [
    './(tabs)/home.tsx',
    './index.tsx',
    './profile/[id].tsx',
    './zeta.tsx',
  ]);
});

test('generateRoutesModule emits deterministic eager imports', () => {
  const root = makeFixture(['app/index.tsx', 'app/profile/[id].tsx']);
  const code = generateRoutesModule(path.join(root, 'app'));
  assert.match(code, /import \* as R0 from ".*\/app\/index\.tsx";/);
  assert.match(code, /import \* as R1 from ".*\/app\/profile\/\[id\]\.tsx";/);
  assert.match(code, /"\.\/index\.tsx": R0,/);
  assert.match(code, /"\.\/profile\/\[id\]\.tsx": R1,/);
  assert.match(code, /export const appRoot = /);
  assert.equal(code, generateRoutesModule(path.join(root, 'app')), 'deterministic');
});

test('plugin resolves and loads the virtual module', () => {
  const root = makeFixture(['app/index.tsx']);
  const plugin = rayactRouterPlugin({ root });
  assert.equal(plugin.resolveId(RAYACT_ROUTES_ID), RESOLVED_RAYACT_ROUTES_ID);
  assert.equal(plugin.resolveId('./other.ts'), null);
  const code = plugin.load(RESOLVED_RAYACT_ROUTES_ID);
  assert.match(code, /"\.\/index\.tsx": R0/);
  assert.equal(plugin.load('some-other-id'), null);
});
