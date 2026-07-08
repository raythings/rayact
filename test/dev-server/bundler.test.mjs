import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRayactBundle } from '../dist/bundler.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
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
