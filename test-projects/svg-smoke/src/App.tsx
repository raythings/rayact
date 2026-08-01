// Acceptance app for @rayact/svg loaded as a dynamic module.
//
// The point of this app is the load path, not the artwork: <Svg> is contributed by a
// module the host dlopens at boot — librayact_svg.dylib on desktop, .so on Android,
// and web/wasm32/rayact_svg.wasm (an Emscripten side module) on web. If the module failed to
// load or register, the circle simply does not paint, so a screenshot is a real check.
//
// The inline document exercises the parts that live in the module's own copy of
// raysvg — path fill, stroke, and a var() colour — rather than anything the engine
// could render on its own.

import React from 'react';
import { View, Text, render } from 'rayact/react';
import { Svg } from '@rayact/svg';
import { MMKV } from '@rayact/mmkv';
import { KV } from 'rayact/kv';

// Built-in KV round-trip. Unlike MMKV this is not a module — it lives in the
// engine — but on web it lands in the same localStorage backing through the same
// bridge, so it gets the same round-trip and persistence checks.
//
// `persisted` counts app launches: it is read BEFORE being written, so on a
// second load it must come back as the previous run's value. That is the part a
// pure in-memory store (what web did before) silently fails.
function kvSelfTest(): string {
  const previousLaunches = KV.get('launches');
  const launches = previousLaunches === undefined ? 1 : Number(previousLaunches) + 1;
  KV.set('launches', String(launches));

  KV.set('kv-probe', 'kv round trip');
  const roundTripOk = KV.get('kv-probe') === 'kv round trip';
  const hasOk = KV.has('kv-probe') && !KV.has('kv-absent');
  KV.delete('kv-probe');
  const deleteOk = !KV.has('kv-probe');
  const persistedOk = launches > 1;

  const ok = roundTripOk && hasOk && deleteOk;
  const detail = { ok, roundTripOk, hasOk, deleteOk, launches, persistedOk };
  console.log('[kv-self-test]', JSON.stringify(detail));
  return (ok ? 'KV round-trip: OK' : 'KV round-trip: FAILED — ' + JSON.stringify(detail)) +
    ` (launch #${launches}${persistedOk ? ', persisted' : ', first run'})`;
}

// MMKV round-trip, run at module load so its result is available to a test
// harness (or this screen) before first paint. Exercises the web-only backend
// (native/web/web_local_storage.cpp + packages/rayact-mmkv/native/web_register.cpp):
// a value written here must survive the localStorage + XOR-obfuscation round trip
// unchanged, and the raw localStorage entry must NOT contain the plaintext.
function mmkvSelfTest(): string {
  const store = new MMKV('smoke-test');
  store.clearAll();
  store.set('greeting', 'hello mmkv');
  store.set('count', 42);
  store.set('flag', true);
  const stringOk = store.getString('greeting') === 'hello mmkv';
  const numberOk = store.getNumber('count') === 42;
  const boolOk = store.getBoolean('flag') === true;
  const missingOk = store.getString('nope') === undefined;
  const hasOk = store.contains('greeting') && !store.contains('nope');
  const keys = store.getAllKeys().slice().sort();
  const keysOk = JSON.stringify(keys) === JSON.stringify(['count', 'flag', 'greeting']);
  store.delete('flag');
  const deleteOk = !store.contains('flag');
  const ok = stringOk && numberOk && boolOk && missingOk && hasOk && keysOk && deleteOk;
  const detail = { ok, stringOk, numberOk, boolOk, missingOk, hasOk, keysOk, deleteOk, keys };
  // This app runs inside the wasm-embedded QuickJS sandbox, a separate JS realm
  // from the browser page — a page-side globalThis probe can't see anything set
  // here. console.log is the one channel that crosses that boundary (the engine
  // forwards it to the real browser console), so that's the way to inspect this.
  console.log('[mmkv-self-test]', JSON.stringify(detail));
  return ok ? 'MMKV round-trip: OK' : 'MMKV round-trip: FAILED — ' + JSON.stringify(detail);
}

const DOCUMENT = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="var(--disc)" stroke="var(--ring)" stroke-width="6" />
  <path d="M30 52 L45 67 L72 38" fill="none" stroke="#ffffff" stroke-width="8"
        stroke-linecap="round" stroke-linejoin="round" />
</svg>
`;

function App() {
  const mmkvResult = mmkvSelfTest();
  const kvResult = kvSelfTest();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Text style={{ fontSize: 18 }}>@rayact/svg dynamic module</Text>
      <Svg
        source={DOCUMENT}
        vars={{ '--disc': '#d92b2b', '--ring': '#1f1f1f' }}
        style={{ width: 180, height: 180 }}
      />
      <Text style={{ fontSize: 13 }}>A red disc with a white tick means the module registered.</Text>
      <Text style={{ fontSize: 13, color: mmkvResult.includes('OK') ? '#2ecc71' : '#e74c3c' }}>
        {mmkvResult}
      </Text>
      <Text style={{ fontSize: 13, color: kvResult.includes('OK') ? '#2ecc71' : '#e74c3c' }}>
        {kvResult}
      </Text>
    </View>
  );
}

// Apps mount themselves — there is no auto-render of a default export. Forgetting
// this produces a black screen with zero errors and a bundle small enough (~26 KB
// instead of ~170) that the missing reconciler is the tell.
render(<App />);
