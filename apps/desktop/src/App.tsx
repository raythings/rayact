import React, { useState } from 'react';
import { Button, Text, View, render } from '@rayact/react';
import '../styles.css';

function App() {
  const [count, setCount] = useState(0);

  return (
    <View className="dev-root">
      <Text text="Rayact React Dev Client" className="dev-title" />
      <Text text="This screen is bundled by Vite and rendered through the raym3 host bridge." className="dev-copy" />
      <View className="dev-actions">
        <Button
          label={`Clicked ${count} times`}
          className="dev-button"
          onPress={() => setCount(value => value + 1)}
        />
        <Text text="Edit apps/desktop/src/App.tsx to trigger a dev update." className="dev-hint" />
      </View>
    </View>
  );
}

render(<App />);
