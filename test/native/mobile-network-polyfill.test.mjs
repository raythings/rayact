import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

/**
 * The mobile fetch/abort polyfill lives as a C++ raw-string literal, so it is
 * never type-checked or executed until it reaches a device. Extracting and
 * running it here catches syntax and behaviour regressions in CI instead.
 */
function extractPolyfill(file, symbol) {
  const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const match = new RegExp(`${symbol} = R"JS\\(([\\s\\S]*?)\\)JS";`).exec(source);
  assert.ok(match, `${symbol} not found in ${file}`);
  return match[1];
}

const PLATFORMS = [
  ['mobile', 'native/shared/mobile_network_polyfill.h', 'kMobileNetworkPolyfill'],
];

/** Boot the polyfill in a sandbox with the native calls stubbed out. */
function bootPolyfill(source) {
  const calls = { started: [], aborted: [] };
  let queue = [];
  const sandbox = {
    Promise,
    JSON,
    Date,
    Error,
    TypeError,
    Object,
    Array,
    String,
    Number,
    Uint8Array,
    ArrayBuffer,
    setTimeout,
    clearTimeout,
    TextDecoder,
    __rayactNativeFetchStart(id, url, method, headersJson, body) {
      calls.started.push({ id, url, method, headers: JSON.parse(headersJson), body });
    },
    __rayactNativeFetchAbort(id) {
      calls.aborted.push(id);
    },
    __rayactNativeWsPollEvents() {
      const out = JSON.stringify(queue);
      queue = [];
      return out;
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return {
    G: sandbox,
    calls,
    /** Deliver a native fetch completion and run the per-frame drain. */
    deliver(event) {
      queue.push({ type: 'fetch', ...event });
      sandbox.__rayactNativeNetworkDrain();
    },
  };
}

for (const [name, file, symbol] of PLATFORMS) {
  const source = extractPolyfill(file, symbol);

  test(`${name}: AbortController and friends exist`, () => {
    const { G } = bootPolyfill(source);
    assert.equal(typeof G.AbortController, 'function');
    assert.equal(typeof G.AbortSignal, 'function');
    assert.equal(typeof G.DOMException, 'function');
    // The original failure: this threw ReferenceError on device, before the
    // caller's try/catch could run.
    assert.doesNotThrow(() => new G.AbortController());
  });

  test(`${name}: abort() flips the signal and fires listeners`, () => {
    const { G } = bootPolyfill(source);
    const controller = new G.AbortController();
    let fired = 0;
    controller.signal.addEventListener('abort', () => { fired++; });
    controller.signal.onabort = () => { fired++; };
    assert.equal(controller.signal.aborted, false);
    controller.abort();
    assert.equal(controller.signal.aborted, true);
    assert.equal(fired, 2);
    assert.equal(controller.signal.reason.name, 'AbortError');
    assert.throws(() => controller.signal.throwIfAborted(), /aborted/);
  });

  test(`${name}: a pre-aborted signal never reaches the native dispatcher`, async () => {
    const { G, calls } = bootPolyfill(source);
    const controller = new G.AbortController();
    controller.abort();
    await assert.rejects(
      G.fetch('http://example.test/health', { signal: controller.signal }),
      err => err.name === 'AbortError'
    );
    assert.deepEqual(calls.started, [], 'no native request should have been issued');
  });

  test(`${name}: aborting mid-flight cancels natively and rejects with AbortError`, async () => {
    const { G, calls } = bootPolyfill(source);
    const controller = new G.AbortController();
    const promise = G.fetch('http://example.test/health', { signal: controller.signal });
    assert.equal(calls.started.length, 1);
    controller.abort();
    // The real cancel matters: a JS-only rejection would leave the socket open.
    assert.deepEqual(calls.aborted, [calls.started[0].id]);
    await assert.rejects(promise, err => err.name === 'AbortError');
  });

  test(`${name}: AbortSignal.timeout rejects an in-flight request`, async () => {
    const { G, calls } = bootPolyfill(source);
    const promise = G.fetch('http://example.test/slow', { signal: G.AbortSignal.timeout(5) });
    await assert.rejects(promise, err => err.name === 'TimeoutError');
    assert.deepEqual(calls.aborted, [calls.started[0].id]);
  });

  test(`${name}: method, headers and body reach the native layer`, async () => {
    const { G, calls } = bootPolyfill(source);
    G.fetch('http://example.test/api/projects', {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"demo"}',
    });
    assert.equal(calls.started.length, 1);
    const sent = calls.started[0];
    // The GET-only bug: these three were previously dropped after the DevTools
    // event was emitted, so every POST/PATCH/DELETE silently became a GET.
    assert.equal(sent.method, 'POST');
    assert.deepEqual(sent.headers, { 'Content-Type': 'application/json' });
    assert.equal(sent.body, '{"name":"demo"}');
  });

  test(`${name}: a plain GET sends no body`, () => {
    const { G, calls } = bootPolyfill(source);
    G.fetch('http://example.test/health');
    assert.equal(calls.started[0].method, 'GET');
    assert.equal(calls.started[0].body ?? null, null);
  });

  test(`${name}: a native cancel event rejects with AbortError`, async () => {
    const { G, calls, deliver } = bootPolyfill(source);
    const promise = G.fetch('http://example.test/health');
    deliver({ req: calls.started[0].id, status: 0, canceled: true });
    await assert.rejects(promise, err => err.name === 'AbortError');
  });

  test(`${name}: an un-aborted request still resolves normally`, async () => {
    const { G, calls, deliver } = bootPolyfill(source);
    const promise = G.fetch('http://example.test/health');
    deliver({ req: calls.started[0].id, status: 200, body: 'ok', statusText: 'OK' });
    const response = await promise;
    assert.equal(response.status, 200);
    assert.equal(response.ok, true);
    assert.equal(await response.text(), 'ok');
  });

  test(`${name}: a network failure still rejects with a plain Error`, async () => {
    const { G, calls, deliver } = bootPolyfill(source);
    const promise = G.fetch('http://example.test/health');
    deliver({ req: calls.started[0].id, status: 0, error: 'Connection refused' });
    await assert.rejects(promise, err => err.name !== 'AbortError' && /refused/.test(err.message));
  });

  test(`${name}: an unsupported body type rejects instead of sending the wrong request`, async () => {
    const { G, calls } = bootPolyfill(source);
    await assert.rejects(
      G.fetch('http://example.test/api', { method: 'POST', body: new Uint8Array([1, 2]) }),
      TypeError
    );
    assert.deepEqual(calls.started, []);
  });
}
