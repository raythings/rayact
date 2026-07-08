import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadRayactConfig,
  resolveTransformFlag,
  validateRayactConfig,
  rayactConfigSchemaPath,
  TRANSFORM_DEFAULTS
} from '../../dist/dev-server/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function withTempConfig(json, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-cfg-'));
  try {
    if (json !== undefined) {
      fs.writeFileSync(path.join(dir, 'rayact.config.json'), JSON.stringify(json));
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('schema file exists and is valid JSON', () => {
  const schema = JSON.parse(fs.readFileSync(rayactConfigSchemaPath(), 'utf8'));
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
});

test('loadRayactConfig returns defaults when no config present', () => {
  withTempConfig(undefined, (dir) => {
    const cfg = loadRayactConfig(dir);
    assert.equal(cfg.platform, undefined);
    assert.equal(cfg.devServer.port, 8081);
    assert.equal(cfg.rayactAppKey, 'rayact-app');
  });
});

test('loadRayactConfig merges devServer overrides', () => {
  withTempConfig({ devServer: { port: 9000 } }, (dir) => {
    const cfg = loadRayactConfig(dir);
    assert.equal(cfg.devServer.port, 9000);
    assert.equal(cfg.devServer.host, '0.0.0.0'); // default preserved
  });
});

test('resolveTransformFlag defaults: release minify+bytecode true, dev false', () => {
  const empty = {};
  assert.equal(resolveTransformFlag(empty, 'bytecode', 'release'), true);
  assert.equal(resolveTransformFlag(empty, 'minify', 'release'), true);
  assert.equal(resolveTransformFlag(empty, 'bytecode', 'dev'), false);
  assert.equal(TRANSFORM_DEFAULTS.release, true);
});

test('resolveTransformFlag honors explicit override and CLI override', () => {
  const cfg = { transform: { bytecode: { release: false } } };
  assert.equal(resolveTransformFlag(cfg, 'bytecode', 'release'), false);
  // CLI override wins over config + default
  assert.equal(resolveTransformFlag(cfg, 'bytecode', 'release', true), true);
  assert.equal(resolveTransformFlag({}, 'bytecode', 'release', false), false);
});

test('validateRayactConfig: clean config has no issues', () => {
  assert.deepEqual(validateRayactConfig({ transform: { bytecode: { release: false } } }), []);
});

test('validateRayactConfig: legacy platform is temporarily accepted', () => {
  assert.deepEqual(validateRayactConfig({ platform: 'desktop' }), []);
});

test('validateRayactConfig flags unknown top-level key', () => {
  const issues = validateRayactConfig({ notAKey: 1 });
  assert.ok(issues.some((i) => i.includes('notAKey') && i.includes('unknown key')), issues.join('; '));
});

test('validateRayactConfig flags wrong type', () => {
  const issues = validateRayactConfig({ entry: 123 });
  assert.ok(issues.some((i) => i.includes('entry') && i.includes('expected string')), issues.join('; '));
});

test('validateRayactConfig flags unknown nested transform key and bad enum', () => {
  assert.ok(validateRayactConfig({ transform: { bogus: {} } }).some((i) => i.includes('bogus')));
  assert.ok(validateRayactConfig({ platform: 'toaster' }).some((i) => i.includes('platform')));
});

test('all in-repo rayact.config.json files validate clean', () => {
  const configs = [
    'rayact.config.json',
    'apps/dev-app/rayact.config.json',
    'test-projects/desktop-smoke/rayact.config.json',
    'packages/create-rayact-app/templates/default/rayact.config.json',
    'packages/create-rayact-app/templates/blank/rayact.config.json'
  ];
  for (const rel of configs) {
    const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    assert.deepEqual(validateRayactConfig(raw), [], `${rel} should validate clean`);
  }
});
