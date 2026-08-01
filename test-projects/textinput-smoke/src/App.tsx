import React, { useState } from 'react';
import { render } from 'rayact/react';
import { View, Text, TextInput } from 'rayact/react';

function App() {
  const [v, setV] = useState('hello');
  return (
    <View style={{ flexGrow: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
      <Text style={{ text: { fontSize: 18 } }}>TextInput smoke</Text>
      <TextInput value={v} onChangeText={setV} placeholder="type here" style={{ height: 56 }} />
      <Text style={{ text: { fontSize: 14 } }}>value: {v}</Text>
    </View>
  );
}
render(<App />);
