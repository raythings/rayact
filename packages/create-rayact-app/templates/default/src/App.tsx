import React, { useState } from 'react';
import { View, Text, Button, Icon, render } from 'rayact/react';
import { Platform } from 'rayact/shared';

const isDesktop = Platform.OS === 'macos' || Platform.OS === 'windows' || Platform.OS === 'linux';
const metrics = isDesktop
  ? { padding: 28, gap: 14, titleSize: 22, detailSize: 14, iconSize: 28 }
  : { padding: 48, gap: 20, titleSize: 28, detailSize: 16, iconSize: 32 };

function App() {
  const [count, setCount] = useState(0);

  return (
    <View style={{
      flex: 1,
      backgroundColor: 0x1A237EFF,
      padding: metrics.padding,
      gap: metrics.gap,
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <Text style={{ text: { color: 0xFFFFFFFF, fontSize: metrics.titleSize } }}>
        __PROJECT_NAME__
      </Text>
      <Text style={{ text: { color: 0x90CAF9FF, fontSize: metrics.detailSize } }}>
        {`Platform: ${Platform.OS} · Taps: ${count}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="alarm" size={metrics.iconSize} color={0xFFF176FF} />
        <Text style={{ text: { color: 0xFFFFFFFF, fontSize: metrics.titleSize } }}>
          Icons + emoji ✅ 🚀
        </Text>
      </View>
      <Button label="Tap me" onPress={() => setCount(c => c + 1)} />
    </View>
  );
}

const host = globalThis as { initRaylib?: (w: number, h: number, t: string) => void };
if (typeof host.initRaylib === 'function') {
  host.initRaylib(800, 600, '__PROJECT_NAME__');
}

render(<App />);
