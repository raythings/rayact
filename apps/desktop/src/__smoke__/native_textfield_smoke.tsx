import React, { useState } from 'react';
import { Card, NativeTextInput, ScrollView, Text, View, render, AvoidKeyboard } from '@rayact/react';

function App() {
  const [value, setValue] = useState('');
  const [secret, setSecret] = useState('s3cr3t');
  return (
    <AvoidKeyboard behavior="padding" style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, backgroundColor: 0x1c1b1fff }}>
        <View style={{ padding: 16, gap: 16, flexShrink: 0 }}>
          <Text text="NativeTextInput" style={{ fontSize: 22, color: 0xffffffff }} />
          <Card style={{ gap: 12, flexShrink: 0 }}>
            <Text text="Native text input (tap to focus):" />
            <NativeTextInput
              value={value}
              placeholder="Type here — CJK/emoji welcome"
              onChangeText={setValue}
              style={{ width: 320, height: 48, borderRadius: 8, backgroundColor: 0x2b2930ff }}
            />
            <Text text={`JS value: ${value}`} style={{ color: 0xcac4d0ff }} />
          </Card>
          <Card style={{ gap: 12, flexShrink: 0 }}>
            <Text text="Secure (must survive focus/typing elsewhere):" />
            <NativeTextInput
              value={secret}
              secure
              placeholder="Secret"
              onChangeText={setSecret}
              style={{ width: 320, height: 48, borderRadius: 8, backgroundColor: 0x2b2930ff }}
            />
            <Text text={`JS secret length: ${secret.length}`} style={{ color: 0xcac4d0ff }} />
          </Card>
        </View>
      </ScrollView>
    </AvoidKeyboard>
  );
}

const host = globalThis as any;
if (typeof host.initRaylib === 'function') host.initRaylib(500, 700, 'NativeTextInput Smoke');
render(<App />);
