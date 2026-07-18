import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, useSafeAreaInsets } from '@rayact/react';
import { getDiagnosticsSnapshot, subscribeDiagnostics, type DiagnosticsSnapshot, type OptionalDiagnosticMetric } from './diagnostics.js';

const metricText = (metric: OptionalDiagnosticMetric) => metric.available
  ? `${metric.value.toFixed(1)} ${metric.unit}`
  : `Unavailable — ${metric.reason}`;

export function DiagnosticsPanel({ visible, embedded = false }: { visible: boolean; embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DiagnosticsSnapshot>(() => getDiagnosticsSnapshot());

  useEffect(() => visible ? subscribeDiagnostics(setData) : undefined, [visible]);
  if (!visible) return null;

  const f = data.frame;
  const rows = [
    `Frame: ${f.frameTimeMs.toFixed(2)} ms (avg ${f.rollingFrameTimeMs.toFixed(2)} ms)`,
    `FPS: ${f.fps.toFixed(1)} / ${f.targetRefreshRate.toFixed(0)} Hz`,
    `Dropped / janky: ${f.droppedFrames} / ${f.jankyFrames} (${f.sampleFrames} frames)`,
    `CPU: ${metricText(data.cpu)}`,
    `GPU: ${metricText(data.gpu)}${data.gpuBackend ? ` (${data.gpuBackend})` : ''}`,
    `GPU model: ${data.gpuDeviceName ?? 'unknown'}`,
    `Process memory (PSS / physical footprint): ${metricText(data.memory)}`,
    'DevTools Memory reports the QuickJS heap only; it excludes native, graphics, and asset memory.',
    `Revision: ${data.bundleRevision ?? 'unknown'} · HMR: ${data.hmrState}`,
    `Platform: ${data.platform} · Mode: ${data.mode}`,
    `Engine: ${data.engineVersion}`,
    `Loaded Wasms: ${data.loadedWasmModules.length ? data.loadedWasmModules.join(', ') : 'none'}`,
  ];

  return (
    <View style={{
      ...(embedded ? { flexGrow: 1 } : {
        position: 'absolute' as const, top: Math.max(12, insets.top + 12),
        right: Math.max(12, insets.right + 12), width: 360, maxWidth: '92%', maxHeight: '70%',
      }),
      backgroundColor: 0xF21A1A1AFF, padding: 14, gap: 6,
    }}>
      {!embedded ? <Text style={{ text: { color: 0xFFFFFFFF, fontSize: 15 } }}>Performance diagnostics</Text> : null}
      <ScrollView style={{ flexGrow: 1 }}>
        {rows.map((row, index) => (
          <Text key={index} style={{ text: { color: index < 3 ? 0xFF80CBC4FF : 0xFFD0D0D0FF, fontSize: 11 } }}>{row}</Text>
        ))}
      </ScrollView>
    </View>
  );
}
