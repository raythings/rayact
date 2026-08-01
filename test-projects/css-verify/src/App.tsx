import React from 'react';
import { View, Text, render } from 'rayact/react';
import './styles.css';

// Each row renders one of the CSS constructs esbuild rewrites during
// minification, so a parse regression shows up as a missing colour, a lost
// border, a collapsed radius or a dead animation rather than as a silent
// difference in the rule table.
function Row({ label, className }: { label: string; className: string }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text className="label">{label}</Text>
      <View className={className}>
        <Text style={{ color: 0xffffffff, fontSize: 15 }}>{className}</Text>
      </View>
    </View>
  );
}

function App() {
  return (
    <View className="screen">
      <Text className="title">CSS minification check</Text>
      <Row label="rgba 2-decimal alpha + border-left + radius" className="card" />
      <Row label="box-shadow with leading 0px" className="card elevated" />
      <Row label="color-mix(in srgb, ...)" className="card mixed" />
      <Row label="hsl(210 100% 50%)" className="card hsl" />
      <Row label="transition ms + @keyframes from/to" className="card animated" />
      <Row label="@media (min-width) and (orientation)" className="card wide" />
      <View style={{ marginBottom: 4 }}>
        <Text className="label">inset collapse (4 edges -&gt; inset: 0)</Text>
        <View className="card" style={{ height: 56 }}>
          <View className="inset-fill" />
        </View>
      </View>
    </View>
  );
}

render(<App />);
