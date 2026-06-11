import React, { useState } from 'react';
import { AvoidKeyboard, Card, ScrollView, Text, TextInput, View, render } from '@rayact/react';

function Smoke() {
  const [value, setValue] = useState('cafe');
  const [secret, setSecret] = useState('s3cr3t');

  return (
    <AvoidKeyboard behavior="padding" style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, backgroundColor: 0x19181cff }}>
        <View style={{ padding: 16, gap: 16 }}>
          <Text text="raym3 TextInput smoke" style={{ color: 0xffffffff, fontSize: 24 }} />
          <Card style={{ gap: 12 }}>
            <Text text="Filled, autocorrect on" />
            <TextInput
              value={value}
              variant="filled"
              label="Filled field"
              placeholder="Tap, type, long-press, drag handles"
              inputType="text"
              autocorrect={true}
              imeAction="done"
              onChangeText={setValue}
            />
            <Text text={`Value: ${value}`} />
          </Card>
          <Card style={{ gap: 12 }}>
            <Text text="Outlined, secure" />
            <TextInput
              value={secret}
              variant="outlined"
              label="Password"
              placeholder="Secret"
              secure={true}
              autocorrect={false}
              inputType="password"
              imeAction="done"
              onChangeText={setSecret}
            />
            <Text text={`Secret length: ${secret.length}`} />
          </Card>
        </View>
      </ScrollView>
    </AvoidKeyboard>
  );
}

const host = globalThis as any;
if (typeof host.initRaylib === 'function') host.initRaylib(540, 860, 'raym3 TextInput Smoke');
render(<Smoke />);
