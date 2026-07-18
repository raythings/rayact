import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrate } from '../../dist/cli/commands/migrate.js';

test('rayact migrate rewrites optional imports, legacy config, and npm dependencies', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-migrate-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/App.ts'), [
    "import { createMMKV } from 'rayact/mmkv';",
    "import { getItemAsync } from 'rayact/secure-store';",
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture', private: true, dependencies: { rayact: '0.0.1' },
  }));
  fs.writeFileSync(path.join(root, 'rayact.config.json'), JSON.stringify({
    nativeModules: [
      { name: 'kv', lib: 'built_in' },
      { name: 'mmkv', lib: 'rayact_mmkv', jsPackage: 'rayact/mmkv', configuration: { namespace: 'profile' } },
      '@rayact/secure-store',
    ],
  }));

  const previous = process.cwd();
  try {
    process.chdir(root);
    await runMigrate();
  } finally {
    process.chdir(previous);
  }

  const source = fs.readFileSync(path.join(root, 'src/App.ts'), 'utf8');
  assert.match(source, /from '@rayact\/mmkv'/);
  assert.match(source, /from '@rayact\/secure-store'/);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'rayact.config.json'), 'utf8'));
  assert.deepEqual(config.nativeModules, [
    { package: '@rayact/mmkv', configuration: { namespace: 'profile' } },
    '@rayact/secure-store',
  ]);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@rayact/mmkv'], '0.0.3');
  assert.equal(pkg.dependencies['@rayact/secure-store'], '0.0.3');
});
