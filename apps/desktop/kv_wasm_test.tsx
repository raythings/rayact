// Cross-context module-bus test: the main thread writes a key into the built-in
// KV store; a WASM worker reads it back through the native module bus
// (sys_invoke) and posts the value home. Renders both the main-thread read and
// the worker's result. Runs identically on desktop and Android (built-in "kv"
// needs no plugin).
/// <reference types="@rayact/types" />
import React, { useEffect, useState } from 'react';
import { View, Text, render } from '@rayact/react';
import { Platform } from '@rayact/shared';

const EXPECTED = 'from-main';

function App() {
  const [mainRead, setMainRead] = useState('(pending)');
  const [wasmRead, setWasmRead] = useState('(waiting for worker)');

  useEffect(() => {
    Storage.set('wasmprobe', EXPECTED);
    setMainRead(Storage.getString('wasmprobe') ?? '(null)');

    onWorkerMessage = (_id, data) => {
      setWasmRead(typeof data === 'string' ? data : JSON.stringify(data));
      console.log('RAYACT_APP: worker said', data);
    };
    spawnWorker('./kv_probe.wasm');
  }, []);

  const ok = wasmRead === 'wasm-read:' + EXPECTED;
  return (
    <View style={{ flex: 1, backgroundColor: 0x10182bff, padding: 48, gap: 20 }}>
      <Text text="Module-bus WASM test" style={{ color: 0xffffffff, fontSize: 36 }} />
      <Text text={`Platform.OS = ${Platform.OS}`} style={{ color: 0x8ad0ffff, fontSize: 22 }} />
      <Text text={`main Storage.getString = ${mainRead}`} style={{ color: 0xc0c8d8ff, fontSize: 22 }} />
      <Text text={`wasm sys_invoke("kv","get") = ${wasmRead}`} style={{ color: 0xc0c8d8ff, fontSize: 22 }} />
      <View style={{ width: 360, height: 64, borderRadius: 12, backgroundColor: ok ? 0x2faa55ff : 0x8a3b3bff, justifyContent: 'center', alignItems: 'center' }}>
        <Text text={ok ? 'PASS: wasm reached native bus' : 'pending / fail'} style={{ color: 0xffffffff, fontSize: 22 }} />
      </View>
    </View>
  );
}

const host = globalThis as any;
if (Platform.OS !== Platform.ANDROID && typeof host.initRaylib === 'function') {
  host.initRaylib(820, 520, 'Rayact Module-Bus WASM Test');
}
render(<App />);
