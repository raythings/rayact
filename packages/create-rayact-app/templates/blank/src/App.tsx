import React from 'react';
import { View, Text, render } from 'rayact/react';

function App() {
  return (
    <View style={{ flex: 1, backgroundColor: 0x121212FF, padding: 32 }}>
      <Text style={{ text: { color: 0xFFFFFFFF, fontSize: 24 } }}>Hello Rayact</Text>
    </View>
  );
}

const host = globalThis as { initRaylib?: (w: number, h: number, t: string) => void };
if (typeof host.initRaylib === 'function') {
  host.initRaylib(640, 480, '__PROJECT_NAME__');
}

render(<App />);
