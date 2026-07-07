import React, { useState } from 'react';
import { View, Text, Button, Icon, render } from 'rayact/react';
import { Platform } from 'rayact/shared';

function App() {
  const [count, setCount] = useState(0);

  return (
    <View style={{
      flex: 1,
      backgroundColor: 0x1A237EFF,
      padding: 48,
      gap: 20,
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <Text style={{ text: { color: 0xFFFFFFFF, fontSize: 28 } }}>
        runtime-app HMR confirmed
      </Text>
      <Text style={{ text: { color: 0x90CAF9FF, fontSize: 16 } }}>
        {`Platform: ${Platform.OS} · Taps: ${count}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="alarm" size={32} color={0xFFF176FF} />
        <Text style={{ text: { color: 0xFFFFFFFF, fontSize: 28 } }}>
          Web icons + emoji ✅ 🚀
        </Text>
      </View>
      <Button label="Tap me" onPress={() => setCount(c => c + 1)} />
    </View>
  );
}

const host = globalThis as { initRaylib?: (w: number, h: number, t: string) => void };
if (typeof host.initRaylib === 'function') {
  host.initRaylib(800, 600, 'runtime-app');
}

render(<App />);
