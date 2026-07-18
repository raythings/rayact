import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getClientCapabilities,
  getDiagnostics,
  getReloadState,
  subscribeReloadState,
} from '../../packages/rayact-runtime/dist/index.js';
import { setReloadState } from '../../packages/rayact-runtime/dist/reloadState.js';

test('client capability contract accepts v1 host metadata and falls back conservatively', () => {
  const manifest = getClientCapabilities({
    __RAYACT_CLIENT_CAPABILITIES__: JSON.stringify({
      schemaVersion: 1,
      engineVersion: '0.0.3',
      engineAbiVersion: 1,
      platform: 'android',
      architecture: 'x86_64',
      modules: [{ name: 'mmkv', package: '@rayact/mmkv', version: '0.0.3', abiVersion: 1 }],
      features: { accessibility: true },
    }),
  });
  assert.equal(manifest.modules[0].package, '@rayact/mmkv');
  assert.equal(manifest.architecture, 'x86_64');

  const fallback = getClientCapabilities({ __RAYACT_CLIENT_CAPABILITIES__: '{bad' });
  assert.equal(fallback.schemaVersion, 1);
  assert.deepEqual(fallback.modules, []);
});

test('reload state uses the stable lifecycle and subscriptions unsubscribe', () => {
  setReloadState('idle');
  const states = [];
  const unsubscribe = subscribeReloadState(state => states.push(state));
  for (const state of ['fetching', 'restarting', 'running', 'failed']) setReloadState(state);
  unsubscribe();
  setReloadState('idle');
  assert.deepEqual(states, ['fetching', 'restarting', 'running', 'failed']);
  assert.equal(getReloadState(), 'idle');
});

test('diagnostics expose versioned available and unavailable metrics', () => {
  const diagnostics = getDiagnostics({
    __rayactGetFrameDiagnostics: () => ({ frameTimeMs: 8.2, fps: 120 }),
    __rayactGetProcessDiagnostics: () => ({ memoryMb: 87 }),
    __rayactPlatform: { target: 'darwin' },
    __RAYACT_ENGINE_VERSION__: '0.0.3',
  });
  assert.equal(diagnostics.schemaVersion, 1);
  assert.deepEqual(diagnostics.frameTime, { available: true, value: 8.2, unit: 'ms' });
  assert.equal(diagnostics.cpu.available, false);
  assert.equal(diagnostics.platform, 'darwin');
});
