// Demo: SharedValue Animation Engine integration in Rayact.
import React from 'react';
import { View, Text, render, useTheme, useSharedValue, withTiming } from '@rayact/react';

function App() {
  const t = useTheme();
  
  // 1. Declare values using useSharedValue hook
  const translateX = useSharedValue(100);
  const opacity = useSharedValue(0.2);

  const triggerSlide = () => {
    console.log('Animation Triggered!');
    // 2. Simply animate by assigning timing/spring configs
    translateX.value = withTiming(400, 1000);
    opacity.value = withTiming(1, 1000);
  };

  const triggerReset = () => {
    console.log('Reset Triggered!');
    translateX.value = withTiming(100, 500);
    opacity.value = withTiming(0.2, 500);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.surface, padding: 48, gap: 24, alignItems: 'flex-start' }}>
      <Text text="SharedValue Animation Demo" style={{ color: t.onSurface, fontSize: 36 }} />
      <Text text="Frictionless API: standard style bindings with SharedValue" style={{ color: t.onSurfaceVariant, fontSize: 18 }} />
      
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View
          onPress={triggerSlide}
          style={{
            width: 180, height: 60, backgroundColor: 0x6750a4ff, borderRadius: 12,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text text="Animate" style={{ color: 0xffffffff, fontSize: 18 }} />
        </View>

        <View
          onPress={triggerReset}
          style={{
            width: 180, height: 60, backgroundColor: 0x4a5a92ff, borderRadius: 12,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text text="Reset" style={{ color: 0xffffffff, fontSize: 18 }} />
        </View>
      </View>

      {/* The Animated View - Standard View but style has SharedValues */}
      <View
        style={{
          width: 200,
          height: 200,
          backgroundColor: 0xff0055ff,
          borderRadius: 24,
          marginTop: 40,
          opacity: opacity, // SharedValue mapping
          transform: [
            { translateX: translateX } // SharedValue mapping inside transform
          ]
        }}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text text="Animated Box" style={{ color: 0xffffffff, fontSize: 20 }} />
        </View>
      </View>
    </View>
  );
}

const host = globalThis as any;
if (typeof host.initRaylib === 'function') host.initRaylib(900, 720, 'SharedValue Demo');

try {
  render(<App />);
} catch (e: any) {
  console.log('DEMO_ERROR: ' + (e && (e.stack || e.message || String(e))));
}
