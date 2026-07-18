import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  checkManifestCompatibility,
  clearManifestFetchCache,
  compareManifestCompatibility,
  probeDevServerReachability,
  probeRecentMetaMatch,
} from '../../dist/dev-client/devServerUrl.js';
import { checkDiscoveredServerCompatibility } from '../../packages/rayact-dev-client/dist/DevLauncherContext.js';
import { clampSwipeOffset, DELETE_REVEAL } from '../../packages/rayact-dev-client/dist/components/swipeMath.js';

const bundled = [
  { name: 'mmkv', jsPackage: '@rayact/mmkv' },
  { name: 'secure-store', jsPackage: '@rayact/secure-store' },
];

test('client accepts a project when every required native module is bundled', () => {
  const result = compareManifestCompatibility({
    compiler: 'react-compiler',
    binaryCommands: true,
    nativeModules: [
      { name: 'mmkv', jsPackage: '@rayact/mmkv' },
      { name: 'secure-store', jsPackage: '@rayact/secure-store' },
    ],
  }, bundled);
  assert.deepEqual(result, { compatible: true, modules: [] });
});

test('client blocks a project that requires an unbundled native module', () => {
  const result = compareManifestCompatibility({
    nativeModules: [
      { name: 'mmkv', jsPackage: '@rayact/mmkv' },
      { name: 'crash-reporter', jsPackage: '@rayact/crash-reporter' },
    ],
  }, bundled);
  assert.equal(result.compatible, false);
  assert.deepEqual(result.modules, [
    { name: 'crash-reporter', jsPackage: '@rayact/crash-reporter' },
  ]);
});

test('legacy string requirements are gated by package identity', () => {
  assert.equal(compareManifestCompatibility({ nativeModules: ['@rayact/mmkv'] }, bundled).compatible, true);
  assert.deepEqual(
    compareManifestCompatibility({ nativeModules: ['@rayact/crash-reporter'] }, bundled).modules,
    [{ name: '@rayact/crash-reporter', jsPackage: '@rayact/crash-reporter' }],
  );
});

test('discovered servers are annotated before the server list renders', async () => {
  const checked = await checkDiscoveredServerCompatibility(
    [{ url: 'http://192.0.2.1:8081', name: 'Example project' }],
    async () => ({
      compatible: false,
      modules: [{ name: 'secure-store', jsPackage: '@rayact/secure-store' }],
    }),
  );

  assert.deepEqual(checked, [{
    url: 'http://192.0.2.1:8081',
    name: 'Example project',
    compatible: false,
    missingModules: [{ name: 'secure-store', jsPackage: '@rayact/secure-store' }],
  }]);
});

test('launcher coalesces manifest status, compatibility, and reachability reads', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearManifestFetchCache();
  });
  clearManifestFetchCache();

  let fetchCount = 0;
  let releaseFetch;
  const gate = new Promise(resolve => { releaseFetch = resolve; });
  globalThis.fetch = async () => {
    fetchCount += 1;
    await gate;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        rayactAppKey: 'termapp',
        compiler: 'react-compiler',
        nativeModules: [],
      }),
    };
  };

  const reachability = probeDevServerReachability('http://10.0.0.15:8081');
  const recent = probeRecentMetaMatch('http://10.0.0.15:8081', 'termapp');
  const compatibility = checkManifestCompatibility('http://10.0.0.15:8081');
  assert.equal(fetchCount, 1);
  releaseFetch();

  assert.deepEqual(await reachability, { kind: 'reachable_rayact' });
  assert.equal(await recent, 'matched');
  assert.deepEqual(await compatibility, {
    compatible: true,
    modules: [],
    manifestValidated: true,
  });
  assert.equal(fetchCount, 1);
});

test('a failed JS manifest read keeps native validation enabled', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearManifestFetchCache();
  });
  clearManifestFetchCache();
  globalThis.fetch = async () => { throw new Error('offline'); };

  assert.deepEqual(await checkManifestCompatibility('http://10.0.0.15:8081'), {
    compatible: true,
    modules: [],
    manifestValidated: false,
  });
});

test('saved-server swipe stays within the reveal track', () => {
  assert.equal(clampSwipeOffset(0, 20), 0);
  assert.equal(clampSwipeOffset(0, -32), -32);
  assert.equal(clampSwipeOffset(0, -500), -DELETE_REVEAL);
  assert.equal(clampSwipeOffset(-DELETE_REVEAL, 30), -DELETE_REVEAL + 30);
});

test('launcher hands project preparation directly to the native host', () => {
  const launcherUi = readFileSync(
    new URL('../../packages/rayact-dev-client/dist/DevLauncherUI.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(launcherUi, /Loading the initial project files/);
  assert.doesNotMatch(launcherUi, /Preparing project/);
});

test('launcher page titles use the shared AppBar component', () => {
  const launcherUi = readFileSync(
    new URL('../../packages/rayact-dev-client/dist/DevLauncherUI.js', import.meta.url),
    'utf8',
  );
  assert.match(launcherUi, /AppBar/);
  assert.match(launcherUi, /extendTopPaddingToAppBar/);
});

test('about links delegate to the platform external-URL bridge', () => {
  const launcherUi = readFileSync(
    new URL('../../packages/rayact-dev-client/dist/DevLauncherUI.js', import.meta.url),
    'utf8',
  );
  const nativeApi = readFileSync(
    new URL('../../packages/rayact-dev-client/dist/native.js', import.meta.url),
    'utf8',
  );
  assert.match(launcherUi, /openExternalUrl/);
  assert.match(nativeApi, /call\('openExternalUrl'/);
});

test('a parsed manifest receipt is forwarded so native clients do not probe twice', () => {
  const nativeApi = readFileSync(
    new URL('../../packages/rayact-dev-client/dist/native.js', import.meta.url),
    'utf8',
  );
  const androidBridge = readFileSync(
    new URL('../../packages/template-android/app/src/main/java/com/rayact/devclient/DevClientBridge.kt', import.meta.url),
    'utf8',
  );
  const iosBridge = readFileSync(
    new URL('../../packages/template-ios/DevClientBridge.swift', import.meta.url),
    'utf8',
  );
  assert.match(nativeApi, /manifestValidated/);
  assert.match(androidBridge, /optBoolean\("manifestValidated"/);
  assert.match(iosBridge, /data\?\["manifestValidated"\]/);
});

test('Android launcher fetches prefer adb loopback and retain LAN fallback', () => {
  const mobileNetwork = readFileSync(
    new URL('../../packages/template-android/app/src/main/java/com/rayact/engine/RayactMobileNetwork.kt', import.meta.url),
    'utf8',
  );
  assert.match(mobileNetwork, /devServerFetchCandidates/);
  assert.match(mobileNetwork, /"127\.0\.0\.1"/);
  assert.match(mobileNetwork, /listOf\(loopback, rawUrl\)/);
});
