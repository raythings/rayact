/* On-device smoke test for the bundled native plugins. Loaded over the dev
 * server into the prebuilt host — exercises mmkv (sync) + secure-store (async)
 * with no native rebuild, logging results (visible via `adb logcat | grep JS:`). */
import React, { useEffect, useState } from 'react';
import { render, View, Text } from 'rayact/react';
import { MMKV } from '@rayact/mmkv';
import { KV } from 'rayact/kv';
import { getItemAsync, setItemAsync } from '@rayact/secure-store';
import { configureCrashReporter, listCrashReports, recordCrash } from '@rayact/crash-reporter';

function App() {
  // Stable identifiers consumed by the publication gate in
  // scripts/verify-dev-app-modules.mjs.
  const registeredSmokeTests = [
    'kv-roundtrip',
    'mmkv-roundtrip',
    'secure-store-roundtrip',
    'crash-reporter-local'
  ];
  const [kvLine, setKvLine] = useState('kv: …');
  const [mmkvLine, setMmkvLine] = useState('mmkv: …');
  const [secureLine, setSecureLine] = useState('secure-store: …');
  const [crashLine, setCrashLine] = useState('crash-reporter: …');

  useEffect(() => {
    try {
      KV.set('dev-app-probe', 'kv-ok');
      const value = KV.get('dev-app-probe');
      if (value !== 'kv-ok') throw new Error('kv round-trip mismatch');
      console.log('MODTEST kv-roundtrip PASS', value);
      setKvLine('kv: ' + value);
    } catch (e) {
      console.log('MODTEST kv-roundtrip FAIL', String(e));
      setKvLine('kv ERROR: ' + String(e));
    }

    try {
      const kv = new MMKV();
      kv.set('probe', 'hello-device');
      kv.set('count', 7);
      kv.set('flag', true);
      const out = `mmkv: ${kv.getString('probe')} / ${kv.getNumber('count')} / ${kv.getBoolean('flag')}`;
      console.log('MODTEST mmkv-roundtrip PASS', out, 'keys=', kv.getAllKeys().join(','));
      setMmkvLine(out);
    } catch (e) {
      console.log('MODTEST mmkv-roundtrip FAIL', String(e));
      setMmkvLine('mmkv ERROR: ' + String(e));
    }

    (async () => {
      try {
        await setItemAsync('token', 'secret-device-123');
        const v = await getItemAsync('token');
        if (v !== 'secret-device-123') throw new Error('secure-store round-trip mismatch');
        console.log('MODTEST secure-store-roundtrip PASS', v);
        setSecureLine('secure-store: ' + String(v));
      } catch (e) {
        console.log('MODTEST secure-store-roundtrip FAIL', String(e));
        setSecureLine('secure ERROR: ' + String(e));
      }
    })();

    (async () => {
      try {
        configureCrashReporter({ mode: 'local', maxStoredReports: 2 });
        const report = await recordCrash(new Error('dev-app-local-probe'));
        const reports = await listCrashReports();
        if (!reports.some(item => item.id === report.id)) throw new Error('local crash report missing');
        console.log('MODTEST crash-reporter-local PASS', report.id);
        setCrashLine('crash-reporter: local-only PASS');
      } catch (e) {
        console.log('MODTEST crash-reporter-local FAIL', String(e));
        setCrashLine('crash-reporter ERROR: ' + String(e));
      }
    })();
  }, []);

  return (
    <View style={{ flexGrow: 1, backgroundColor: 0xff101418, padding: 40, gap: 16, justifyContent: 'center' }}>
      <Text style={{ text: { color: 0xffffffff, fontSize: 22 } }}>Native module test</Text>
      <Text style={{ text: { color: 0xffd2b7ff, fontSize: 16 } }}>{kvLine}</Text>
      <Text style={{ text: { color: 0xff8fd6ff, fontSize: 16 } }}>{mmkvLine}</Text>
      <Text style={{ text: { color: 0xffa5f3a5, fontSize: 16 } }}>{secureLine}</Text>
      <Text style={{ text: { color: 0xffffc37a, fontSize: 16 } }}>{crashLine}</Text>
      <Text style={{ text: { color: 0xff8b949e, fontSize: 12 } }}>{registeredSmokeTests.join(', ')}</Text>
    </View>
  );
}

const host = globalThis as { initRaylib?: (w: number, h: number, t: string) => void };
if (typeof host.initRaylib === 'function') host.initRaylib(420, 820, 'Module Test');
render(<App />);
