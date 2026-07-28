import React from 'react';
import { ScrollView, View, type ScrollViewHandle } from './components.js';
import type {
  ComponentTypeLike,
  FlatListProps,
  StyleProp,
} from './types.js';

export interface FlatListHandle {
  scrollToOffset(options: { offset: number; animated?: boolean }): void;
  scrollToIndex(options: { index: number; viewOffset?: number; animated?: boolean }): void;
  scrollToEnd(options?: { animated?: boolean }): void;
  /** Underlying ScrollView node. */
  node?: { id: number };
}

type Metrics = {
  offsets: number[];
  heights: number[];
  total: number;
  displayToData: number[];
  dataToDisplay: number[];
};

type NativeScrollEvent = {
  nativeEvent: {
    contentOffset: { x: number; y: number };
    contentSize: { width: number; height: number };
    layoutMeasurement: { width: number; height: number };
  };
};

function renderComponent(value: ComponentTypeLike | undefined): React.ReactNode {
  if (value == null) return null;
  return typeof value === 'function'
    ? React.createElement(value as React.ComponentType)
    : value;
}

function lowerBound(offsets: number[], target: number): number {
  let low = 0;
  let high = Math.max(0, offsets.length - 1);
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (offsets[middle] <= target) low = middle;
    else high = middle - 1;
  }
  return low;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') ref.current = value;
}

/**
 * Variable-height, measured virtual list. Mounted rows remain bounded by the
 * viewport and `windowSize`; unmeasured rows use `estimatedItemSize`.
 */
export function FlatList<T>(props: FlatListProps<T>): React.ReactElement {
  const {
    ref,
    data,
    renderItem,
    keyExtractor,
    estimatedItemSize = 56,
    windowSize = 3,
    inverted = false,
    maintainVisibleContentPosition,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    onEndReached,
    onEndReachedThreshold = 0.5,
    initialNumToRender = 10,
    onScroll,
    style,
    ...scrollProps
  } = props as FlatListProps<T> & { ref?: React.Ref<FlatListHandle> };
  const scrollRef = React.useRef<ScrollViewHandle | null>(null);
  const measuredRef = React.useRef(new Map<string, number>());
  const [measurementVersion, bumpMeasurements] = React.useReducer((value: number) => value + 1, 0);
  const [viewport, setViewport] = React.useState({ width: 0, height: estimatedItemSize * initialNumToRender });
  const [offset, setOffset] = React.useState(0);
  const lastEndContentLength = React.useRef(-1);
  const previousAnchor = React.useRef<{ key: string; delta: number } | null>(null);
  const invertedAtEnd = React.useRef(true);

  const keys = React.useMemo(
    () => data.map((item, index) => keyExtractor ? keyExtractor(item, index) : String(index)),
    [data, keyExtractor],
  );

  const metrics = React.useMemo<Metrics>(() => {
    const count = data.length;
    const displayToData = Array.from({ length: count }, (_, displayIndex) =>
      inverted ? count - 1 - displayIndex : displayIndex
    );
    const dataToDisplay = new Array<number>(count);
    const heights = new Array<number>(count);
    const offsets = new Array<number>(count + 1);
    offsets[0] = 0;
    for (let displayIndex = 0; displayIndex < count; displayIndex++) {
      const dataIndex = displayToData[displayIndex];
      dataToDisplay[dataIndex] = displayIndex;
      const height = measuredRef.current.get(keys[dataIndex]) ?? estimatedItemSize;
      heights[displayIndex] = height;
      offsets[displayIndex + 1] = offsets[displayIndex] + height;
    }
    return { offsets, heights, total: offsets[count] ?? 0, displayToData, dataToDisplay };
  }, [data.length, estimatedItemSize, inverted, keys, measurementVersion]);

  const viewportHeight = Math.max(1, viewport.height);
  const overscan = viewportHeight * Math.max(1, windowSize);
  const visibleStart = Math.max(0, lowerBound(metrics.offsets, Math.max(0, offset)));
  const start = data.length === 0 ? 0 : Math.max(0, lowerBound(metrics.offsets, Math.max(0, offset - overscan)));
  const end = data.length === 0
    ? 0
    : Math.min(data.length, lowerBound(metrics.offsets, offset + viewportHeight + overscan) + 1);

  React.useLayoutEffect(() => {
    const anchor = previousAnchor.current;
    if (!anchor || !maintainVisibleContentPosition) return;
    const dataIndex = keys.indexOf(anchor.key);
    if (dataIndex < maintainVisibleContentPosition.minIndexForVisible) return;
    const displayIndex = metrics.dataToDisplay[dataIndex];
    const nextOffset = Math.max(0, metrics.offsets[displayIndex] + anchor.delta);
    if (Math.abs(nextOffset - offset) > 0.5) {
      scrollRef.current?.scrollTo({ y: nextOffset, animated: false });
      setOffset(nextOffset);
    }
  }, [keys, maintainVisibleContentPosition, metrics, offset]);

  // RN's inverted list has offset 0 at the visual bottom. The native Rayact
  // ScrollView is not transformed, so preserve the equivalent behavior by
  // pinning its physical offset to the content end while the user remains
  // within one pixel of that edge.
  React.useLayoutEffect(() => {
    if (!inverted || !invertedAtEnd.current) return;
    const nextOffset = Math.max(0, metrics.total - viewportHeight);
    scrollRef.current?.scrollTo({ y: nextOffset, animated: false });
    setOffset(nextOffset);
  }, [inverted, metrics.total, viewportHeight]);

  React.useEffect(() => {
    if (!onEndReached || data.length === 0) return;
    const distanceFromEnd = Math.max(0, metrics.total - viewportHeight - offset);
    if (
      distanceFromEnd <= viewportHeight * onEndReachedThreshold &&
      lastEndContentLength.current !== metrics.total
    ) {
      lastEndContentLength.current = metrics.total;
      onEndReached({ distanceFromEnd });
    }
  }, [data.length, metrics.total, offset, onEndReached, onEndReachedThreshold, viewportHeight]);

  const makeHandle = React.useCallback((): FlatListHandle => ({
    node: scrollRef.current?.node,
    scrollToOffset: ({ offset: next, animated }) =>
      scrollRef.current?.scrollTo({ y: Math.max(0, next), animated }),
    scrollToIndex: ({ index, viewOffset = 0, animated }) => {
      if (index < 0 || index >= data.length) throw new RangeError(`scrollToIndex index ${index} is out of range`);
      const displayIndex = metrics.dataToDisplay[index];
      scrollRef.current?.scrollTo({
        y: Math.max(0, metrics.offsets[displayIndex] - viewOffset),
        animated,
      });
    },
    scrollToEnd: options => scrollRef.current?.scrollToEnd(options),
  }), [data.length, metrics]);

  React.useImperativeHandle(ref, makeHandle, [makeHandle]);

  const handleScroll = React.useCallback((event: NativeScrollEvent) => {
    const nextOffset = event.nativeEvent.contentOffset.y;
    if (inverted) {
      invertedAtEnd.current = metrics.total - viewportHeight - nextOffset <= 1;
    }
    setOffset(nextOffset);
    if (data.length > 0) {
      const first = Math.min(data.length - 1, lowerBound(metrics.offsets, nextOffset));
      const dataIndex = metrics.displayToData[first];
      previousAnchor.current = {
        key: keys[dataIndex],
        delta: nextOffset - metrics.offsets[first],
      };
    }
    onScroll?.(event);
  }, [data.length, inverted, keys, metrics, onScroll, viewportHeight]);

  const rowNodes: React.ReactNode[] = [];
  for (let displayIndex = start; displayIndex < end; displayIndex++) {
    const dataIndex = metrics.displayToData[displayIndex];
    const key = keys[dataIndex];
    rowNodes.push(
      <View
        key={key}
        onLayout={event => {
          const height = event.nativeEvent.layout.height;
          if (!(height > 0) || Math.abs((measuredRef.current.get(key) ?? 0) - height) < 0.5) return;
          measuredRef.current.set(key, height);
          bumpMeasurements();
        }}
      >
        {renderItem({ item: data[dataIndex], index: dataIndex })}
      </View>
    );
  }

  const empty = data.length === 0 ? renderComponent(ListEmptyComponent) : null;
  const header = data.length > 0 ? renderComponent(ListHeaderComponent) : null;
  const footer = data.length > 0 ? renderComponent(ListFooterComponent) : null;
  const invertedUnderfill = inverted ? Math.max(0, viewportHeight - metrics.total) : 0;
  const topSpacer = invertedUnderfill + (metrics.offsets[start] ?? 0);
  const bottomSpacer = Math.max(0, metrics.total - (metrics.offsets[end] ?? metrics.total));

  return (
    <ScrollView
      {...scrollProps}
      ref={instance => {
        scrollRef.current = instance;
        assignRef(ref, instance ? makeHandle() : null);
      }}
      style={style as StyleProp}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setViewport({ width, height });
        props.onLayout?.(event);
      }}
      onScroll={handleScroll}
      keyboardAware={props.keyboardAware}
    >
      {header}
      {topSpacer > 0 ? <View style={{ height: topSpacer, flexShrink: 0 }} /> : null}
      {rowNodes}
      {bottomSpacer > 0 ? <View style={{ height: bottomSpacer, flexShrink: 0 }} /> : null}
      {footer}
      {empty}
    </ScrollView>
  );
}
