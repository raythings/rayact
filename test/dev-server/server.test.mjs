import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHmrPath, claimHmrBroadcast, startRayactDevServer } from '../../dist/dev-server/server.js';

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

test('manifest advertises the pinned DevTools frontend and capabilities', async () => {
  const root = new URL('../..', import.meta.url).pathname;
  const server = await startRayactDevServer({
    root,
    host: '127.0.0.1',
    port: 0,
    entry: 'test-projects/release-consumer-smoke/src/App.tsx',
    platform: 'desktop',
  });
  try {
    const response = await fetch(`${server.localUrl}/rayact/manifest.json`);
    const manifest = await response.json();
    const requestedBase = new URL(server.localUrl);
    assert.equal(new URL(manifest.bootstrapUrl).host, requestedBase.host);
    assert.equal(new URL(manifest.hmrUrl).host, requestedBase.host);
    assert.equal(new URL(manifest.devtoolsDeviceUrl).host, requestedBase.host);
    assert.equal(manifest.devtoolsProtocolVersion, 2);
    assert.match(manifest.devtoolsFrontendUrl, /^devtools:\/\/devtools\/bundled\/inspector\.html\?ws=/);
    assert.match(manifest.reactDevtoolsFrontendUrl, /\/rayact\/devtools\/rn_fusebox\.html\?ws=/);
    assert.ok(manifest.capabilities.includes('dom-readonly'));
    assert.ok(manifest.capabilities.includes('runtime-console'));
    assert.ok(manifest.capabilities.includes('sources-readonly'));
    assert.ok(manifest.capabilities.includes('network-passive'));
    assert.ok(manifest.capabilities.includes('tracing-basic'));
    assert.ok(manifest.capabilities.includes('memory-counters'));
    const frontend = await fetch(server.devtoolsUrl);
    assert.equal(frontend.status, 200);

    const panels = await fetch(`${server.localUrl}/rayact/devtools/rayact/panels.js`);
    assert.equal(panels.status, 200);
    const panelSource = await panels.text();
    assert.match(panelSource, /class RayactElementsPanel/);
    assert.match(panelSource, /invoke_getDocument/);
    assert.match(panelSource, /class RayactPerformancePanel/);
    assert.match(panelSource, /invoke_getMetrics/);
    assert.match(panelSource, /set\("FPS", \(metrics\.get\("RayactFrameTime"\)/);
    assert.match(panelSource, /set\("Frame time", \(metrics\.get\("RayactFPS"\)/);
    assert.match(panelSource, /class RayactMemoryPanel/);
    assert.match(panelSource, /invoke_getHeapUsage/);

    const entrypoint = await fetch(
      `${server.localUrl}/rayact/devtools/entrypoints/rn_fusebox/rn_fusebox.js`,
    );
    assert.equal(entrypoint.status, 200);
    const entrypointSource = await entrypoint.text();
    assert.match(entrypointSource, /id:"elements"/);
    assert.match(entrypointSource, /RayactElementsPanel/);
    assert.match(entrypointSource, /RayactPerformancePanel/);
    assert.match(entrypointSource, /RayactMemoryPanel/);
  } finally {
    await server.close();
  }
});

test('bytecode dev mode serves qjsbc and does not advertise DevTools or HMR', async () => {
  const root = new URL('../..', import.meta.url).pathname;
  const server = await startRayactDevServer({
    root,
    host: '127.0.0.1',
    port: 0,
    cdpPort: 0,
    entry: 'test-projects/release-consumer-smoke/src/App.tsx',
    platform: 'ios',
    bytecode: true,
  });
  try {
    const manifest = await fetch(
      `${server.localUrl}/rayact/manifest.json?platform=ios`,
    ).then(response => response.json());
    assert.equal(manifest.bundleFormat, 'qjsbc');
    assert.equal(manifest.hmrMode, 'none');
    assert.deepEqual(manifest.capabilities, ['bytecode']);
    assert.equal(manifest.devtoolsDeviceUrl, undefined);
    assert.equal(manifest.hmrUrl, undefined);

    const bundle = await fetch(
      `${server.localUrl}/rayact/bundle.qjsbc?platform=ios`,
    );
    assert.equal(bundle.status, 200);
    assert.match(bundle.headers.get('content-type') ?? '', /application\/octet-stream/);
    assert.ok((await bundle.arrayBuffer()).byteLength > 0);
  } finally {
    await server.close();
  }
});
