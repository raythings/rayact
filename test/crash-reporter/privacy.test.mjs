import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureCrashReporter,
  flushCrashReports,
  listCrashReports,
  recordCrash,
  setCrashConsent,
} from '../../packages/rayact-crash-reporter/dist/index.js';

function storageFixture() {
  let reports = [];
  return {
    storage: {
      async load() { return [...reports]; },
      async save(next) { reports = [...next]; },
    },
  };
}

test('local mode redacts sensitive values, caps envelopes, and makes no requests', async () => {
  const fixture = storageFixture();
  let requests = 0;
  configureCrashReporter({
    mode: 'local',
    storage: fixture.storage,
    fetch: async () => { requests++; return new Response(null, { status: 204 }); },
  });
  setCrashConsent('granted');
  const report = await recordCrash(new Error(
    `failed at /Users/alice/project/source.ts?token=secret user@example.com 192.168.1.4 ${'a'.repeat(70000)}`,
  ));
  const encoded = new TextEncoder().encode(JSON.stringify(report));
  assert.ok(encoded.byteLength <= 64 * 1024);
  assert.doesNotMatch(JSON.stringify(report), /alice|secret|user@example\.com|192\.168\.1\.4/);
  assert.equal((await flushCrashReports()).uploaded, 0);
  assert.equal(requests, 0);
});

test('upload requires HTTPS and explicit granted consent, with bounded retry', async () => {
  assert.throws(() => configureCrashReporter({ mode: 'upload', endpoint: 'http://example.com' }), /HTTPS/);
  const fixture = storageFixture();
  let attempts = 0;
  configureCrashReporter({
    mode: 'upload',
    endpoint: 'https://crash.example.test/reports',
    storage: fixture.storage,
    maxRetries: 1,
    fetch: async () => {
      attempts++;
      return new Response(null, { status: attempts === 1 ? 503 : 204 });
    },
  });
  await recordCrash(new Error('probe'));
  setCrashConsent('unknown');
  assert.equal((await flushCrashReports()).uploaded, 0);
  assert.equal(attempts, 0);
  setCrashConsent('granted');
  assert.deepEqual(await flushCrashReports(), { uploaded: 1, remaining: 0 });
  assert.equal(attempts, 2);
  assert.equal((await listCrashReports()).length, 0);
});
