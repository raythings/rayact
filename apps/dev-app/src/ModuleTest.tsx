/* On-device smoke test for the bundled native plugins. Loaded over the dev
 * server into the prebuilt host — exercises mmkv (sync) + secure-store (async)
 * with no native rebuild, logging results (visible via `adb logcat | grep JS:`). */
import React, { useEffect, useState } from 'react';
import { render, View, Text } from 'rayact/react';
import { MMKV } from 'rayact/mmkv';
import { getItemAsync, setItemAsync } from 'rayact/secure-store';

function App() {
  const [mmkvLine, setMmkvLine] = useState('mmkv: …');
  const [secureLine, setSecureLine] = useState('secure-store: …');

  useEffect(() => {
    try {
      const kv = new MMKV();
      kv.set('probe', 'hello-device');
      kv.set('count', 7);
      kv.set('flag', true);
      const out = `mmkv: ${kv.getString('probe')} / ${kv.getNumber('count')} / ${kv.getBoolean('flag')}`;
      console.log('MODTEST', out, 'keys=', kv.getAllKeys().join(','));
      setMmkvLine(out);
    } catch (e) {
      console.log('MODTEST mmkv ERROR', String(e));
      setMmkvLine('mmkv ERROR: ' + String(e));
    }

    (async () => {
      try {
        await setItemAsync('token', 'secret-device-123');
        const v = await getItemAsync('token');
        console.log('MODTEST secure-store', v);
        setSecureLine('secure-store: ' + String(v));
      } catch (e) {
        console.log('MODTEST secure ERROR', String(e));
        setSecureLine('secure ERROR: ' + String(e));
      }
    })();
  }, []);

  return (
    <View style={{ flexGrow: 1, backgroundColor: 0xff101418, padding: 40, gap: 16, justifyContent: 'center' }}>
      <Text style={{ text: { color: 0xffffffff, fontSize: 22 } }}>Native module test</Text>
      <Text style={{ text: { color: 0xff8fd6ff, fontSize: 16 } }}>{mmkvLine}</Text>
      <Text style={{ text: { color: 0xffa5f3a5, fontSize: 16 } }}>{secureLine}</Text>
    </View>
  );
}

const host = globalThis as { initRaylib?: (w: number, h: number, t: string) => void };
if (typeof host.initRaylib === 'function') host.initRaylib(420, 820, 'Module Test');
render(<App />);
