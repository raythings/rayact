import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEVTOOLS_CAPABILITIES,
  DEVTOOLS_PROTOCOL_VERSION,
  stockDevtoolsFrontendUrl,
} from '@rayact/devtools/server';

test('devtools package exposes stock Chrome discovery separately from React DevTools', () => {
  assert.equal(DEVTOOLS_PROTOCOL_VERSION, 2);
  assert.match(stockDevtoolsFrontendUrl('127.0.0.1', 9229, 'devtools/page/1'), /^devtools:\/\/devtools\/bundled\/inspector\.html\?ws=/);
  assert.deepEqual(DEVTOOLS_CAPABILITIES, [
    'dom-readonly',
    'runtime-console',
    'sources-readonly',
    'network-passive',
    'tracing-basic',
    'memory-counters',
    'react-devtools',
  ]);
});

test('native build configuration physically excludes devtools from release builds', async () => {
  const [desktop, android, ios] = await Promise.all([
    readFile(new URL('../../native/desktop/CMakeLists.txt', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/android/app/src/main/cpp/CMakeLists.txt', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/ios/project.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(desktop, /RAYACT_ENABLE_DEVTOOLS/);
  assert.match(android, /RAYACT_ENABLE_DEVTOOLS/);
  assert.match(android, /if\(NOT RAYACT_RELEASE_HOST\)[\s\S]*dev_client_bridge\.cpp/);
  assert.match(android, /RAYACT_RELEASE_HOST=\$<BOOL:/);
  assert.match(ios, /EXCLUDED_SOURCE_FILE_NAMES: "[^"]*devtools\.cpp[^"]*cdp_handler\.cpp[^"]*dev_client_bridge\.cpp[^"]*"/);
  assert.match(ios, /-DRAYACT_RELEASE_HOST=1/);
  assert.match(ios, /DevLauncherController\.swift/);
  assert.match(desktop, /if\(NOT RAYACT_RELEASE_HOST\)/);
});

test('core runtime capabilities cannot be disabled by Android build properties', async () => {
  const [gradle, cmake] = await Promise.all([
    readFile(new URL('../../apps/android/app/build.gradle', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/android/app/src/main/cpp/CMakeLists.txt', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(gradle, /rayact(?:Wasm|Full)/);
  assert.doesNotMatch(cmake, /RAYACT_ANDROID_(?:WASM|FULL)|RAYACT_NO_(?:NET|WORKERS)/);
  assert.match(cmake, /native\/desktop\/worker_wasm\.cpp/);
  assert.match(cmake, /RAYACT_PLATFORM_NET_BACKEND/);
});
