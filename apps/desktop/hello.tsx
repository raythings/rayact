// Minimal bring-up app: validates native engine + raylib external-surface +
// React 19 render on a device. Explicit colors (no useTheme) so rendering is
// independent of theme wiring.
import React from 'react';
import { View, Text, render } from '@rayact/react';
import { Platform } from '@rayact/shared';

function App() {
  return (
    <View style={{ flex: 1, backgroundColor: 0x1b2a4aff, padding: 64, gap: 24 }}>
      <Text text="Rayact on Android" style={{ color: 0xffffffff, fontSize: 44 }} />
      <Text text={`Platform.OS = ${Platform.OS}`} style={{ color: 0x8ad0ffff, fontSize: 26 }} />
      <Text text="React 19 . QuickJS . raym3 . raylib (SurfaceView)" style={{ color: 0xc0c8d8ff, fontSize: 18 }} />
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 24 }}>
        <View style={{ width: 100, height: 100, backgroundColor: 0xe94560ff, borderRadius: 16 }} />
        <View style={{ width: 100, height: 100, backgroundColor: 0x44cc66ff, borderRadius: 16 }} />
        <View style={{ width: 100, height: 100, backgroundColor: 0xffc94aff, borderRadius: 16 }} />
      </View>
    </View>
  );
}

const host = globalThis as any;
// Desktop drives the window from JS; on Android the JNI host owns InitWindow.
if (Platform.OS !== Platform.ANDROID && typeof host.initRaylib === 'function') {
  host.initRaylib(900, 650, 'Rayact Hello');
}
render(<App />);
