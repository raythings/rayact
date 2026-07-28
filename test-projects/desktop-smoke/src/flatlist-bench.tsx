// FlatList / scroll benchmark harness.
//
// Standalone entry (select with RAYACT_ENTRY=src/flatlist-bench.tsx) used to
// measure the cost of long lists and to drive reproducible scripted flings.
// Scenario is chosen with RAYACT_BENCH_SCENARIO; row count with
// RAYACT_BENCH_ROWS.
//
// The baseline scenarios deliberately render every row, which is what rayact
// does today: offscreen rows are skipped at paint time but still cost a React
// element, a native node, and a full Yoga rebuild every single frame.

import 'rayact/shared/material-icons';

import React from 'react';
import { View, Text, ScrollView, render } from 'rayact/react';
import { BENCH_SCENARIO, BENCH_ROWS } from './bench-config';

const host = globalThis as any;

const SCENARIO = BENCH_SCENARIO;
const ROWS = BENCH_ROWS;

// Deterministic PRNG so variable-height runs are comparable across builds.
// mulberry32 — small, fast, and stable regardless of engine Math.random.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIXED_ROW_HEIGHT = 64;

type Row = { id: number; title: string; subtitle: string; height: number };

function buildRows(count: number, variable: boolean): Row[] {
  const rand = mulberry32(0x5eed);
  const rows: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    rows[i] = {
      id: i,
      title: `Row ${i}`,
      subtitle: `subtitle for item number ${i}`,
      // 40-220dp spread stresses the measurement/correction path.
      height: variable ? 40 + Math.floor(rand() * 180) : FIXED_ROW_HEIGHT,
    };
  }
  return rows;
}

const VARIABLE = SCENARIO === 'variable';
const ROW_DATA = buildRows(ROWS, VARIABLE);

function BenchRow({ row }: { row: Row }) {
  return (
    <View
      style={{
        height: row.height,
        paddingHorizontal: 16,
        justifyContent: 'center',
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
      }}
    >
      <Text style={{ fontSize: 16 }}>{row.title}</Text>
      <Text style={{ fontSize: 12, color: '#666' }}>{row.subtitle}</Text>
    </View>
  );
}

// Baseline: the current non-virtualized behaviour. Every row is a live React
// element and a live native node for the lifetime of the screen.
//
// The `followend` scenario turns on autoScrollToEnd, which is the only offset
// writer in the engine that is structurally directional: it re-pins the offset
// to the bottom during layout, every frame, and the fling tick cannot see it.
function BaselineList() {
  return (
    <ScrollView style={{ flex: 1 }} autoScrollToEnd={SCENARIO === 'followend'}>
      {ROW_DATA.map((row) => (
        <BenchRow key={row.id} row={row} />
      ))}
    </ScrollView>
  );
}

// Samples the native frame diagnostics and prints them once the run has
// settled. Printing (rather than rendering) keeps the readout out of the very
// measurement it is reporting on.
function useDiagnosticsDump(atFrame: number) {
  React.useEffect(() => {
    let frame = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      frame++;
      // Report on a repeating interval, not once: frames only render on demand,
      // so an idle sample reports a flattering 60fps that says nothing about
      // cost under scroll. The number that matters is measured mid-fling.
      if (frame % atFrame === 0) {
        const d = host.__rayactGetFrameDiagnostics?.();
        if (d) {
          console.log(
            `[bench] scenario=${SCENARIO} rows=${ROWS} ` +
              `yogaNodesBuilt=${d.yogaNodesBuilt} visited=${d.visitedNodes} painted=${d.paintedNodes} ` +
              `frameMs=${d.rollingFrameTimeMs?.toFixed?.(2)} fps=${d.fps?.toFixed?.(1)} ` +
              `janky=${d.jankyFrames}/${d.sampleFrames}`
          );
        }
      }
      host.requestAnimationFrame?.(tick);
    };
    host.requestAnimationFrame?.(tick);
    return () => {
      cancelled = true;
    };
  }, [atFrame]);
}

function Bench() {
  useDiagnosticsDump(120);
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <View style={{ height: 48, justifyContent: 'center', paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 14 }}>
          {`${SCENARIO} · ${ROWS} rows`}
        </Text>
      </View>
      <BaselineList />
    </View>
  );
}

if (typeof host.initRaylib === 'function') {
  host.initRaylib(400, 900, 'rayact FlatList bench');
}
render(<Bench />);
