import React from 'react';
import { View, Text, render } from 'rayact/react';

// Acceptance surface for the OS emoji rasterizer backend. Each row is a case the
// CBDT path used to handle via GSUB ligatures, so they are the ones that break
// first if cluster segmentation or the rasterizer regresses:
//
//   plain      single codepoint, no modifiers
//   ZWJ        multi-person sequence joined by U+200D — one glyph, not four
//   flag       regional indicator pair
//   skin tone  base + U+1F3FB..FF modifier
//   keycap     digit + U+FE0F + U+20E3
//   mixed      emoji inline with text, to check advance/baseline alignment
const CASES: Array<[string, string]> = [
  ['plain', '😀 😂 🎉 🚀 ❤️'],
  ['ZWJ', '👩‍👩‍👦 👨‍💻 🧑‍🚀'],
  ['flag', '🇯🇵 🇺🇸 🇧🇷'],
  ['skin tone', '👋🏻 👋🏽 👋🏿'],
  ['keycap', '1️⃣ 2️⃣ 3️⃣'],
  ['mixed', 'ship it 🚀 today'],
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 12, color: 0x9e9e9eff }}>{label}</Text>
      <Text style={{ fontSize: 34, color: 0xffffffff }}>{value}</Text>
    </View>
  );
}

// Set to a font path to force the bundled CBDT backend instead of the OS one,
// so the two can be compared side by side. loadEmoji() returns 'os' | 'bundled'
// | 'none' and also exercises RegisterCustomEmojiFont.
const FORCE_BUNDLED: string | null = null;

let backend = 'os (default)';
if (FORCE_BUNDLED) {
  backend = (globalThis as any).loadEmoji(FORCE_BUNDLED);
}

function App() {
  return (
    <View style={{ flex: 1, backgroundColor: 0x101014ff, padding: 20 }}>
      <Text style={{ fontSize: 22, color: 0xffffffff, marginBottom: 18 }}>
        Emoji backend check — {backend}
      </Text>
      {CASES.map(([label, value]) => (
        <Row key={label} label={label} value={value} />
      ))}
    </View>
  );
}

render(<App />);
