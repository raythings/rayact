import React from 'react';
import { View, Text, render } from 'rayact/react';

// Verification screen for the post-0.0.4 fixes:
//  1. background-color alpha (#RRGGBBAA must blend, not paint opaque)
//  2. rounded container + overflowing translucent child (scissor fallback)
//  3. percentage dimensions (width: '50%')
function App() {
  return (
    <View style={{ flex: 1, backgroundColor: 0x102030ff, padding: 24, gap: 16 }}>
      <Text style={{ text: { color: 0xffffffff, fontSize: 20 } }}>fix-verify v7 GATED</Text>

      {/* 1: translucent red over white — must read as pink, not solid red */}
      <View style={{ height: 80, backgroundColor: 0xffffffff, borderRadius: 12 }}>
        <View style={{ flex: 1, backgroundColor: '#ff000080', borderRadius: 12 }}>
          <Text style={{ text: { color: 0x000000ff } }}>alpha 50% red over white</Text>
        </View>
      </View>

      {/* 2: rounded clip — child taller than parent, must not paint below */}
      <View style={{ height: 60, borderRadius: 20, overflow: 'hidden', backgroundColor: 0x224422ff }}>
        <View style={{ height: 200, backgroundColor: '#00ff0040' }}>
          <Text style={{ text: { color: 0xffffffff } }}>clipped child</Text>
        </View>
      </View>

      {/* 4: opacity on a rounded component — corners must stay rounded and the
          whole card must fade uniformly (child text included) */}
      <View style={{ flexDirection: 'row', height: 72, gap: 12 }}>
        <View style={{ flex: 1, opacity: 0.45, backgroundColor: 0xff8800ff, borderRadius: 24 }}>
          <Text style={{ text: { color: 0x000000ff } }}>opacity 0.45 + r24</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#ff880073', borderRadius: 24 }}>
          <Text style={{ text: { color: 0x000000ff } }}>alpha bg + r24</Text>
        </View>
      </View>

      {/* 5: reduced-opacity translucent child inside rounded clipping parent —
          child overflows; must not paint outside the box */}
      <View style={{ height: 64, borderRadius: 24, overflow: 'hidden', backgroundColor: 0x552255ff }}>
        <View style={{ height: 220, opacity: 0.6, backgroundColor: '#ffffff55' }}>
          <Text style={{ text: { color: 0xffffffff } }}>opacity child in rounded clip</Text>
        </View>
      </View>

      {/* 3: percent width — left box exactly half of row */}
      <View style={{ flexDirection: 'row', height: 48 }}>
        <View style={{ width: '50%', backgroundColor: 0x3366ffff }}>
          <Text style={{ text: { color: 0xffffffff } }}>w-50%</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: 0x666666ff }} />
      </View>
    </View>
  );
}

render(<App />);
