import React, { useEffect, useState } from 'react';
import { Text, View, render } from '@rayact/react';
import './smoke.css';

function App() {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setUp(v => !v), 900);
    return () => clearInterval(t);
  }, []);
  return (
    <View
      style={{ flex: 1, justifyContent: 'flex-end' }}
      onPress={() => setUp(v => !v)}
    >
      <View
        className="smoke-box"
        style={{ height: 80, backgroundColor: 0x6750a4ff, marginBottom: up ? 300 : 0 }}
      >
        <Text text={up ? 'up' : 'down'} style={{ color: 0xffffffff }} />
      </View>
    </View>
  );
}

const host = globalThis as any;
if (typeof host.initRaylib === 'function') host.initRaylib(400, 600, 'Transition Smoke');
render(<App />);
