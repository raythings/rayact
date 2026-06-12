import React, { useState } from 'react';
import { View, Text, Button, render } from '@rayact/react';
import { Platform } from '@rayact/shared';

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
      <Text style={{ text: { color: 0xFFFFFFFF, fontSize: 32 } }}>
        Rayact Desktop Smoke Test
      </Text>
      <Text style={{ text: { color: 0xFF90CAF9FF, fontSize: 18 } }}>
        {`Platform: ${Platform.OS} · Clicks: ${count}`}
      </Text>
      <Button label="Tap me" onPress={() => setCount(c => c + 1)} />
      <Text style={{ text: { color: 0xFFB0BEC5FF, fontSize: 14 } }}>
        Dev platform bundle OK
      </Text>
    </View>
  );
}

const host = globalThis as { initRaylib?: (w: number, h: number, t: string) => void };
if (typeof host.initRaylib === 'function') {
  host.initRaylib(800, 600, 'Rayact Desktop Smoke');
}

render(<App />);
