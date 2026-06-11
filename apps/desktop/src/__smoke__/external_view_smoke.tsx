import React, { useState } from 'react';
import { Button, Card, ExternalView, ScrollView, Text, View, render } from '@rayact/react';

// P1 verification: animated stub producer composited inside a clipped, rounded
// Card inside a ScrollView, with rayact content above and below — proves
// texture node, z-order, clipping, scroll compositing, and frame scheduling.
function App() {
  const [big, setBig] = useState(false);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: 0x1c1b1fff }}>
      <View style={{ padding: 16, gap: 16, flexShrink: 0, minHeight: 1600 }}>
        <Text text="ExternalView stub" style={{ fontSize: 22, color: 0xffffffff }} />
        <Card style={{ gap: 12, flexShrink: 0, borderRadius: 24, overflow: 'hidden' }}>
          <Text text="Inside rounded Card:" />
          <ExternalView
            kind="stub"
            style={{ width: big ? 320 : 220, height: 140, borderRadius: 16 }}
          />
          <Button label={big ? 'Shrink' : 'Grow'} onPress={() => setBig(v => !v)} />
        </Card>
        <View style={{ height: 60, backgroundColor: 0x6750a4ff, borderRadius: 12 }}>
          <Text text="rayact content below" style={{ color: 0xffffffff }} />
        </View>
        <ExternalView kind="stub" style={{ width: 360, height: 100 }} />
        <Text text="scroll me" style={{ color: 0xcac4d0ff }} />
      </View>
    </ScrollView>
  );
}

const host = globalThis as any;
if (typeof host.initRaylib === 'function') host.initRaylib(500, 700, 'ExternalView Smoke');
render(<App />);
