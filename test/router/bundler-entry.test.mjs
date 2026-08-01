import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRayactBundle, isBareEntrySpecifier } from '../../dist/dev-server/bundler.js';
import { resolveProjectEntry } from '../../dist/dev-server/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const smokeRoot = path.join(repoRoot, 'test-projects/router-smoke');

test('isBareEntrySpecifier: project files are not bare, module specifiers are', () => {
  assert.equal(isBareEntrySpecifier(smokeRoot, '@rayact/router/entry'), true);
  assert.equal(isBareEntrySpecifier(smokeRoot, 'app/index.tsx'), false, 'existing file wins');
  assert.equal(isBareEntrySpecifier(smokeRoot, './src/App.tsx'), false);
  assert.equal(isBareEntrySpecifier(smokeRoot, '/abs/App.tsx'), false);
});

test('resolveProjectEntry auto-detects app/ when config declares no entry', () => {
  assert.equal(resolveProjectEntry(smokeRoot, 'src/App.tsx'), '@rayact/router/entry');

  // A declared entry always wins, even with an app/ directory present.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-entry-test-'));
  fs.mkdirSync(path.join(root, 'app'));
  fs.writeFileSync(path.join(root, 'app/index.tsx'), 'export default () => null;\n');
  fs.writeFileSync(
    path.join(root, 'rayact.config.json'),
    JSON.stringify({ rayactAppKey: 'x', entry: 'src/Main.tsx' })
  );
  assert.equal(resolveProjectEntry(root, 'src/App.tsx'), 'src/Main.tsx');

  // No app dir, no declared entry: fallback.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-entry-bare-'));
  assert.equal(resolveProjectEntry(bare, 'src/App.tsx'), 'src/App.tsx');
});

test('router smoke app bundles with the bare router entry', async () => {
  const output = await buildRayactBundle({
    root: smokeRoot,
    entry: '@rayact/router/entry',
    mode: 'development',
    minify: false,
    bytecode: false
  });

  assert.equal(output.entry, '@rayact/router/entry', 'bare specifier survives the manifest');
  // The routes manifest and both route screens are inlined in the bundle.
  assert.match(output.code, /\.\/index\.tsx/);
  assert.match(output.code, /\.\/details\/\[id\]\.tsx/);
  assert.match(output.code, /Router Smoke/);
  assert.match(output.code, /Custom not found/);
});
