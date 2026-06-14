// Perf fixture: 500 keyed rows (Row component, so the React Compiler can memoize
// it) that reverse on a timer. Reversal exercises update commits; the compiler
// lets unchanged rows skip reconciliation. Compare commit.end / [mountwall]
// across: legacy vs RAYACT_BINARY / debug.rayact.binary, and with/without the
// compiler. Enable __RAYACT_PROF for the host-config breakdown. Animation-free.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, render } from '@rayact/react';

(globalThis as { __RAYACT_PERF_LOG?: boolean }).__RAYACT_PERF_LOG = true;

const N = 500;

function Row({ i }: { i: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 4,
        gap: 8,
        backgroundColor: i % 2 ? 0x1a1a1aff : 0x262626ff,
      }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 4, backgroundColor: 0x3366ffff }} />
      <Text style={{ color: 0xffffffff, fontSize: 14 }}>{`Row ${i}`}</Text>
    </View>
  );
}

function App() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setTick(n);
      if (n >= 6) clearInterval(id);
    }, 600);
    return () => clearInterval(id);
  }, []);

  const items = useMemo(() => {
    const arr = Array.from({ length: N }, (_, i) => i);
    if (tick % 2 === 1) arr.reverse();
    return arr;
  }, [tick]);

  return (
    <View style={{ flexGrow: 1, padding: 12, gap: 2, backgroundColor: 0x000000ff }}>
      {items.map((i) => (
        <Row key={i} i={i} />
      ))}
    </View>
  );
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const t0 = now();
render(<App />);
Promise.resolve().then(() =>
  Promise.resolve().then(() => {
    // eslint-disable-next-line no-console
    console.log(`[mountwall] ms=${(now() - t0).toFixed(2)} N=${N}`);
  }),
);
