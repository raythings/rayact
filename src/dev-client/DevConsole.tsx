import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from '../react/index.js';
import { useDevLauncher } from './DevLauncherContext.js';

interface LogLine {
  id: number;
  level: string;
  text: string;
}

let logId = 0;
const logBuffer: LogLine[] = [];

export function installDevConsoleCapture(): void {
  const g = globalThis as { __rayactDevConsoleInstalled?: boolean };
  if (g.__rayactDevConsoleInstalled) return;
  g.__rayactDevConsoleInstalled = true;
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  for (const level of levels) {
    const original = console[level]?.bind(console);
    if (!original) continue;
    console[level] = (...args: unknown[]) => {
      original(...args);
      logBuffer.push({
        id: ++logId,
        level,
        text: args.map(a => {
          try { return typeof a === 'string' ? a : JSON.stringify(a); }
          catch { return String(a); }
        }).join(' ')
      });
      while (logBuffer.length > 200) logBuffer.shift();
    };
  }
}

export function DevConsole() {
  const launcher = useDevLauncher();
  const [lines, setLines] = useState<LogLine[]>([]);

  useEffect(() => {
    if (!launcher.devMenuOpen) return;
    const timer = setInterval(() => setLines([...logBuffer]), 300);
    return () => clearInterval(timer);
  }, [launcher.devMenuOpen]);

  if (!launcher.devMenuOpen) return null;

  return (
    <View style={{
      position: 'absolute',
      left: 24,
      right: 24,
      bottom: 100,
      maxHeight: 160,
      backgroundColor: 0xCC000000,
      padding: 8,
      gap: 4
    }}>
      <Text style={{ text: { color: 0xFFFFFFFF, fontSize: 12 } }}>Console</Text>
      <ScrollView style={{ flexGrow: 1 }}>
        {lines.slice(-40).map(line => (
          <Text
            key={line.id}
            style={{ text: { color: line.level === 'error' ? 0xFFFF6B6BFF : 0xFFE0E0E0FF, fontSize: 10 } }}
          >
            {`[${line.level}] ${line.text}`}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
