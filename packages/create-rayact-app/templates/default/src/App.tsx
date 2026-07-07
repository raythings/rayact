import React, { useState } from 'react';
import { View, Text, Button, render } from 'rayact/react';
import { Platform } from 'rayact/shared';

function App() {
  const [count, setCount] = useState(0);

  return (
    <View style={{
      flexGrow: 1,
      backgroundColor: 0xFF1A237EFF,
      padding: 48,
      gap: 20,
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <Text style={{ text: { color: 0xFFFFFFFF, fontSize: 28 } }}>
        __PROJECT_NAME__
      </Text>
      <Text style={{ text: { color: 0xFF90CAF9FF, fontSize: 16 } }}>
        {`Platform: ${Platform.OS} · Taps: ${count}`}
      </Text>
      <Button label="Tap me" onPress={() => setCount(c => c + 1)} />
    </View>
  );
}

const host = globalThis as { initRaylib?: (w: number, h: number, t: string) => void };
if (typeof host.initRaylib === 'function') {
  host.initRaylib(800, 600, '__PROJECT_NAME__');
}

render(<App />);
