import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHmrPath, claimHmrBroadcast } from '../../dist/dev-server/server.js';

test('canonicalHmrPath removes platform and cache queries', () => {
  assert.equal(canonicalHmrPath('/src/App.tsx?platform=web?t=123', 'src/App.tsx'), '/src/App.tsx');
  assert.equal(canonicalHmrPath('/src/App.tsx#fragment', 'src/App.tsx'), '/src/App.tsx');
});

test('canonicalHmrPath normalizes fallback paths', () => {
  assert.equal(canonicalHmrPath(undefined, 'src/App.tsx'), '/src/App.tsx');
  assert.equal(canonicalHmrPath('virtual:module', 'src/App.tsx'), '/src/App.tsx');
});

test('claimHmrBroadcast collapses simultaneous platform watcher events', () => {
  const claims = new Map();
  assert.equal(claimHmrBroadcast(claims, 'change:/src/App.tsx', 1000), true);
  assert.equal(claimHmrBroadcast(claims, 'change:/src/App.tsx', 1005), false);
  assert.equal(claimHmrBroadcast(claims, 'change:/src/App.tsx', 1050), true);
  assert.equal(claimHmrBroadcast(claims, 'change:/src/Other.tsx', 1005), true);
});
