import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildRayactBundle,
  resolveDevClientAppMetadata,
  resolveProjectNativeModules,
} from '../../dist/dev-server/bundler.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const entry = 'test-projects/release-consumer-smoke/src/App.tsx';

test('official dev app resolves canonical bundled native module identities', () => {
  // Modules autolink from the dev app's declared dependencies, so assert the shape
  // rather than a fixed roster — pinning the exact list here would mean this test
  // has to be edited every time a module is installed, which is the coupling the
  // generated build wiring exists to remove.
  const modules = resolveProjectNativeModules(path.join(repoRoot, 'apps/dev-app'));
  assert.ok(modules.length > 0, 'expected the dev app to autolink its installed modules');

  const names = modules.map(module => module.name);
  assert.deepEqual(names, [...names].sort(), 'entries are sorted by name');
  assert.deepEqual(names, [...new Set(names)], 'no duplicate module names');
  for (const module of modules) {
    assert.match(module.jsPackage, /^@rayact\//, `${module.name} resolves to its npm package`);
  }

  // The first-party modules the official dev app is expected to carry.
  for (const expected of ['crash-reporter', 'mmkv', 'secure-store']) {
    assert.ok(names.includes(expected), `missing bundled module: ${expected}`);
  }
});

test('dev-client identity comes from rayact.config.json while official extras are preserved', () => {
  const metadata = resolveDevClientAppMetadata(
    path.join(repoRoot, 'apps/dev-app'),
    JSON.stringify({
      displayName: 'Stale hardcoded name',
      packageLabel: 'Stale hardcoded name',
      source: 'official',
      creditTitle: 'The official Rayact development client',
      links: [{ id: 'github', label: 'GitHub', url: 'https://github.com/raythings/rayact' }],
    }),
  );

  assert.equal(metadata.displayName, 'Rayact Dev App');
  assert.equal(metadata.packageLabel, 'Rayact Dev App');
  assert.equal(metadata.source, 'official');
  assert.equal(metadata.links?.[0]?.url, 'https://github.com/raythings/rayact');
});

test('custom dev clients use their own configured name without official-only metadata', (t) => {
  const root = fs.mkdtempSync(path.join(repoRoot, '.tmp-dev-client-name-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'rayact.config.json'), JSON.stringify({ name: 'Customer Client' }));

  assert.deepEqual(resolveDevClientAppMetadata(root, ''), {
    displayName: 'Customer Client',
    packageLabel: 'Customer Client',
  });
});

test('release bundles require bytecode and disable React Compiler transforms', async () => {
  const output = await buildRayactBundle({
    root: repoRoot,
    entry,
    platform: 'desktop',
    mode: 'release',
    minify: false,
    bytecode: false
  });

  assert.equal(output.compiler, 'none');
  // A release request cannot opt back into source bundles, even through a
  // direct bundler API call.
  assert.equal(output.bundleFormat, 'qjsbc');
  assert.ok(output.bytecode?.length > 0);
  assert.equal(output.mode, 'release');
  assert.doesNotMatch(output.code, /compilerRuntimeExports\.c\(/);
  assert.doesNotMatch(output.code, /requireReactCompilerRuntime/);
  assert.doesNotMatch(output.code, /__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__/);
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
  assert.match(output.code, /__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__/);
  assert.match(output.code, /connectWithCustomMessagingProtocol/);
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

test('web dev client excludes the in-page DevConsole capture', async () => {
  const output = await buildRayactBundle({
    root: repoRoot,
    entry,
    platform: 'web',
    mode: 'dev-client',
    minify: false,
    bytecode: false
  });

  assert.doesNotMatch(output.code, /installDevConsoleCapture\(\)/);
  assert.doesNotMatch(output.code, /__rayactDevConsoleInstalled/);
  assert.match(output.code, /Performance diagnostics/);
});
