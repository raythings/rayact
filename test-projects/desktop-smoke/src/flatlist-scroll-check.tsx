// Correctness harness for the recycling FlatList.
//
// Drives scrollToOffset across a 5000-row list and asserts, at each stop, that
// the rows actually mounted are the rows that belong at that offset — i.e. the
// pool reassigned cells instead of leaving blanks or stale content. Prints
// PASS/FAIL lines; run headless and grep.
import React from 'react';
import { View, Text, FlatList, render, type FlatListHandle } from 'rayact/react';

const host = globalThis as any;

const ROWS = 5000;
const ROW_H = 60;
type Row = { id: number; label: string };
const DATA: Row[] = Array.from({ length: ROWS }, (_, i) => ({ id: i, label: `row-${i}` }));

// Rows report which index they are currently rendering, so the harness can see
// the live mounted set rather than trusting internal state.
const mounted = new Map<number, number>(); // cellInstanceId -> row index
let nextCellId = 1;

function CheckRow({ row }: { row: Row }) {
  const idRef = React.useRef(0);
  if (idRef.current === 0) idRef.current = nextCellId++;
  mounted.set(idRef.current, row.id);
  React.useEffect(() => () => { mounted.delete(idRef.current); }, []);
  return (
    <View style={{ height: ROW_H, paddingLeft: 12, justifyContent: 'center' }}>
      <Text style={{ fontSize: 14 }}>{row.label}</Text>
    </View>
  );
}

function Harness() {
  const listRef = React.useRef<FlatListHandle | null>(null);
  React.useEffect(() => {
    const stops = [0, 600, 6000, 60000, 180000, 299000, 120000, 0];
    let step = 0;
    let mountCountAtStart = 0;
    let maxMounted = 0;

    const tick = () => {
      if (step >= stops.length) {
        // Recycling check: the number of live cell instances must stay bounded
        // — a non-recycling list would have minted a new instance per row.
        console.log(
          `[scrollcheck] instances_created=${nextCellId - 1} max_mounted=${maxMounted} ` +
          `${nextCellId - 1 <= 200 ? 'PASS recycling' : 'FAIL recycling (unbounded instances)'}`
        );
        console.log('[scrollcheck] DONE');
        return;
      }
      const offset = stops[step];
      listRef.current?.scrollToOffset({ offset, animated: false });
      // Let the list settle (scroll event -> window recompute -> render -> layout).
      host.setTimeout(() => {
        const expectedFirst = Math.floor(offset / ROW_H);
        const live = [...mounted.values()].sort((a, b) => a - b);
        maxMounted = Math.max(maxMounted, live.length);
        const covers =
          live.length > 0 && live[0] <= expectedFirst && live[live.length - 1] >= expectedFirst;
        console.log(
          `[scrollcheck] offset=${offset} expectFirst=${expectedFirst} ` +
          `mounted=[${live[0]}..${live[live.length - 1]}] n=${live.length} ` +
          `${covers ? 'PASS' : 'FAIL (visible row not mounted)'}`
        );
        step++;
        tick();
      }, 260);
    };
    if (mountCountAtStart === 0) mountCountAtStart = nextCellId;
    host.setTimeout(tick, 500);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={DATA}
        keyExtractor={(row: Row) => String(row.id)}
        estimatedItemSize={ROW_H}
        renderItem={({ item }: { item: Row }) => <CheckRow row={item} />}
      />
    </View>
  );
}

if (typeof host.initRaylib === 'function') {
  host.initRaylib(400, 800, 'rayact FlatList scroll check');
}
render(<Harness />);
