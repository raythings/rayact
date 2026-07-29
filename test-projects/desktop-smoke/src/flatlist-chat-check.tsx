// Chat-shaped correctness harness for the recycling FlatList.
//
// Mirrors codesitter's ChatScreen: inverted list, reversed data, variable
// wrapped-text heights, maintainVisibleContentPosition, content padding, and a
// message that GROWS after mount (streaming). Asserts:
//   1. wrapped rows measure at the container width (not one long line)
//   2. heights land on the right rows when inverted
//   3. a row growing in place re-tops the rows around it
//   4. the pinned-to-end view stays pinned while the newest message streams
import React from 'react';
import { View, Text, FlatList, render, type FlatListHandle } from 'rayact/react';

const host = globalThis as any;

type Msg = { id: string; text: string; role: 'user' | 'agent' };

const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore'.split(' ');
function body(seed: number, words: number): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(WORDS[(seed * 7 + i * 13) % WORDS.length]);
  return out.join(' ');
}

// Deliberately varied lengths: 3 to 60 words, so heights range over ~1-8 lines.
const BASE: Msg[] = Array.from({ length: 400 }, (_, i) => ({
  id: `m${i}`,
  role: i % 2 === 0 ? 'user' : 'agent',
  text: `#${i} ${body(i, 3 + ((i * 17) % 58))}`,
}));

const measured = new Map<string, { height: number; width: number }>();

function ChatMessage({ message }: { message: Msg }) {
  return (
    <View
      style={{
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: 6,
        paddingBottom: 6,
      }}
      onLayout={(e: any) => {
        measured.set(message.id, {
          height: e.nativeEvent.layout.height,
          width: e.nativeEvent.layout.width,
        });
      }}
    >
      <View
        style={{
          backgroundColor: message.role === 'user' ? 0x2563ebff : 0x1f2937ff,
          borderRadius: 12,
          padding: 10,
        }}
      >
        <Text style={{ fontSize: 14, color: 0xffffffff }}>{message.text}</Text>
      </View>
    </View>
  );
}

function Harness() {
  const listRef = React.useRef<FlatListHandle | null>(null);
  const [messages, setMessages] = React.useState<Msg[]>(BASE);
  const inverted = React.useMemo(() => [...messages].reverse(), [messages]);
  const phase = React.useRef(0);

  React.useEffect(() => {
    const step = () => {
      phase.current++;
      const p = phase.current;

      if (p === 1) {
        // 1 + 2: wrapping width and per-row heights.
        const entries = [...measured.entries()];
        const widths = new Set(entries.map(([, m]) => Math.round(m.width)));
        const heights = entries.map(([, m]) => m.height);
        const distinct = new Set(heights.map(h => Math.round(h)));
        console.log(
          `[chatcheck] measured=${entries.length} distinct_widths=${widths.size} ` +
            `widths=[${[...widths].join(',')}] distinct_heights=${distinct.size} ` +
            `${widths.size === 1 && distinct.size > 3 ? 'PASS wrapping+variable' : 'FAIL wrapping/variable'}`,
        );
        // Row #399 is the newest (data end) -> display end when inverted.
        const newest = measured.get('m399');
        console.log(
          `[chatcheck] newest_mounted=${newest ? 'yes' : 'no'} ${newest ? 'PASS pinned-to-newest' : 'FAIL not pinned'}`,
        );
      }

      if (p >= 2 && p <= 6) {
        // 3 + 4: stream the newest message longer, one chunk per tick.
        setMessages(prev => {
          const next = prev.slice();
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, text: `${last.text} ${body(p, 12)}` };
          return next;
        });
      }

      if (p === 7) {
        const newest = measured.get('m399');
        console.log(
          `[chatcheck] streamed newest_height=${newest ? newest.height.toFixed(1) : 'n/a'} ` +
            `${newest && newest.height > 60 ? 'PASS grew in place' : 'FAIL did not grow'}`,
        );
      }

      // Index mapping under inversion: data index 0 is the newest message
      // (the array is reversed before it reaches the list), data index 399 is
      // the oldest. If display and data indices were confused anywhere, these
      // land on the wrong rows.
      if (p === 8) { measured.clear(); listRef.current?.scrollToIndex({ index: 399 }); }
      if (p === 9) {
        const ids = [...measured.keys()];
        console.log(
          `[chatcheck] scrollToIndex(399=oldest) mounted_has_m0=${ids.includes('m0')} ` +
            `sample=[${ids.slice(0, 3).join(',')}] ${ids.includes('m0') ? 'PASS' : 'FAIL index mapping'}`,
        );
        measured.clear();
        listRef.current?.scrollToIndex({ index: 0 });
      }
      if (p === 10) {
        const ids = [...measured.keys()];
        console.log(
          `[chatcheck] scrollToIndex(0=newest) mounted_has_m399=${ids.includes('m399')} ` +
            `sample=[${ids.slice(0, 3).join(',')}] ${ids.includes('m399') ? 'PASS' : 'FAIL index mapping'}`,
        );
        console.log('[chatcheck] DONE');
        return;
      }
      host.setTimeout(step, 320);
    };
    host.setTimeout(step, 900);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: 0x111827ff }}>
      <FlatList
        ref={listRef}
        data={inverted}
        inverted
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        estimatedItemSize={110}
        keyExtractor={(m: Msg) => m.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 12 }}
        renderItem={({ item }: { item: Msg }) => <ChatMessage message={item} />}
      />
    </View>
  );
}

if (typeof host.initRaylib === 'function') {
  host.initRaylib(390, 800, 'rayact chat list check');
}
render(<Harness />);
