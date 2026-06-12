import React from 'react';
import { View, Text, Button } from '@rayact/react';
import { useDevLauncher } from './DevLauncherContext.js';

export function DevMenu() {
  const launcher = useDevLauncher();
  if (!launcher.devMenuOpen) return null;

  return (
    <View style={{
      position: 'absolute',
      bottom: 24,
      right: 24,
      backgroundColor: 0xEE1E1E1EFF,
      padding: 16,
      gap: 8,
      minWidth: 200
    }}>
      <Text style={{ text: { color: 0xFFFFFFFF, fontSize: 16 } }}>Dev Menu</Text>
      <Text style={{ text: { color: 0xFFB0B0B0FF, fontSize: 11 } }}>{`Server: ${launcher.url}`}</Text>
      <Button label="Reload" onPress={launcher.reload} />
      <Button label="Inspector" onPress={() => launcher.setInspectorOpen(!launcher.inspectorOpen)} />
      <Button label="Close" onPress={() => launcher.setDevMenuOpen(false)} />
    </View>
  );
}
