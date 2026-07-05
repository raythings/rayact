import React, { useMemo, useState } from 'react';
import { ScrollView, View } from '@rayact/react';

export type FlatListProps<T> = {
  data: T[];
  renderItem: (info: { item: T; index: number }) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  itemHeight?: number;
  windowSize?: number;
  style?: Record<string, unknown>;
};

function scrollOffset(event: unknown): number {
  if (typeof event === 'number') return event;
  if (event && typeof event === 'object') {
    const value = (event as { y?: unknown; scrollY?: unknown; contentOffset?: { y?: unknown } });
    if (typeof value.y === 'number') return value.y;
    if (typeof value.scrollY === 'number') return value.scrollY;
    if (typeof value.contentOffset?.y === 'number') return value.contentOffset.y;
  }
  return 0;
}

export function FlatList<T>({
  data,
  renderItem,
  keyExtractor,
  itemHeight = 48,
  windowSize = 12,
  style,
}: FlatListProps<T>) {
  const [scrollY, setScrollY] = useState(0);
  const viewport = windowSize * itemHeight;
  const start = Math.max(0, Math.floor(scrollY / itemHeight) - 2);
  const end = Math.min(data.length, start + windowSize + 4);
  const slice = useMemo(() => data.slice(start, end), [data, start, end]);

  return (
    <ScrollView
      style={{ ...style, height: viewport }}
      onScroll={(event) => setScrollY(scrollOffset(event))}
    >
      <View style={{ height: start * itemHeight }} />
      {slice.map((item, i) => (
        <View key={keyExtractor ? keyExtractor(item, start + i) : String(start + i)}>
          {renderItem({ item, index: start + i })}
        </View>
      ))}
      <View style={{ height: Math.max(0, (data.length - end) * itemHeight) }} />
    </ScrollView>
  );
}
