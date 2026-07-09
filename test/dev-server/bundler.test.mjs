import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildRayactBundle } from '../../dist/dev-server/bundler.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const entry = 'test-projects/release-consumer-smoke/src/App.tsx';

test('release bundles disable React Compiler transforms', async () => {
  const output = await buildRayactBundle({
    root: repoRoot,
    entry,
    platform: 'desktop',
    mode: 'release',
    minify: false,
    bytecode: false
  });

  assert.equal(output.compiler, 'none');
  assert.equal(output.bundleFormat, 'js');
  assert.equal(output.mode, 'release');
  assert.doesNotMatch(output.code, /compilerRuntimeExports\.c\(/);
  assert.doesNotMatch(output.code, /requireReactCompilerRuntime/);
});

test('development bundles keep React Compiler metadata', async () => {
  const output = await buildRayactBundle({
    root: repoRoot,
    entry,
    platform: 'desktop',
    mode: 'development',
    minify: false,
    bytecode: false
  });

  assert.equal(output.compiler, 'react-compiler');
  assert.match(output.code, /compilerRuntimeExports\.c\(/);
});

test('static assets are returned in the build manifest', async (t) => {
  const root = fs.mkdtempSync(path.join(repoRoot, '.tmp-asset-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'font.ttf'), Buffer.from([0, 1, 2, 3]));
  fs.writeFileSync(path.join(root, 'entry.ts'), "import font from './font.ttf'; globalThis.__font = font;\n");

  const output = await buildRayactBundle({
    root: repoRoot,
    entry: path.relative(repoRoot, path.join(root, 'entry.ts')),
    mode: 'release',
    minify: false,
    bytecode: false
  });

  assert.equal(output.platform, 'desktop');
  assert.equal(output.assets.length, 1);
  assert.equal(output.assets[0].name, 'font.ttf');
  assert.match(output.code, /font\.ttf/);
});
