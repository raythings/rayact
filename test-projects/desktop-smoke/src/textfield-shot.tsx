// Text field visual-verification entry (select with --entry
// src/textfield-shot.tsx). Renders every M3 text field state side by side:
// plain (bare TextInput), filled/outlined/underline rest + populated, an
// outlined field that self-focuses (label float + outline notch), and a
// disabled field. Pair with RAYACT_SHOT=1 for a scripted screenshot.

import React, { useEffect, useRef } from 'react';
import { View, Text, TextInput, TextField, render } from 'rayact/react';
import type { TextInputHandle } from 'rayact/react';

function Row(props: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ text: { fontSize: 12, color: 0x49454fff } }}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function App() {
  const focusRef = useRef<TextInputHandle | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => focusRef.current?.focus(), 400);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: 0xfffbfeff, padding: 24, gap: 14 }}>
      <Row title="plain TextInput (empty, placeholder)">
        <TextInput placeholder="Plain placeholder" style={{ height: 44 }} />
      </Row>
      <Row title="plain TextInput (populated)">
        <TextInput value="Plain value" style={{ height: 44 }} />
      </Row>
      <Row title="filled (empty — label rests centered)">
        <TextField variant="filled" label="Filled label" />
      </Row>
      <Row title="filled (populated — label floats inside container)">
        <TextField variant="filled" label="Filled label" value="Filled value" />
      </Row>
      <Row title="outlined (empty — label rests centered)">
        <TextField variant="outlined" label="Outlined label" />
      </Row>
      <Row title="outlined (focused — label floats into notch)">
        <TextField ref={focusRef} variant="outlined" label="Focus label" />
      </Row>
      <Row title="outlined (populated — notch open)">
        <TextField variant="outlined" label="Outlined label" value="Outlined value" />
      </Row>
      <Row title="underline (populated)">
        <TextField variant="underline" label="Underline label" value="Underline value" />
      </Row>
      <Row title="disabled filled (populated)">
        <TextField
          variant="filled"
          label="Disabled label"
          value="Disabled value"
          {...({ disabled: true } as object)}
        />
      </Row>
    </View>
  );
}

const host = globalThis as unknown as {
  initRaylib?: (width: number, height: number, title: string) => void;
};
if (typeof host.initRaylib === 'function') {
  host.initRaylib(560, 900, 'TextField states');
}
render(<App />);
