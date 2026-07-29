import React from 'react';
import { ScrollView, View, type ScrollViewHandle } from './components.js';
import { Fenwick } from './fenwick.js';
import type {
  ComponentTypeLike,
  FlatListProps,
  ListProps,
  StyleProp,
} from './types.js';

export interface FlatListHandle {
  scrollToOffset(options: { offset: number; animated?: boolean }): void;
  scrollToIndex(options: { index: number; viewOffset?: number; animated?: boolean }): void;
  scrollToEnd(options?: { animated?: boolean }): void;
  /** Underlying ScrollView node. */
  node?: { id: number };
}

type NativeScrollEvent = {
  nativeEvent: {
    contentOffset: { x: number; y: number };
    contentSize: { width: number; height: number };
    layoutMeasurement: { width: number; height: number };
  };
};

type NativeLayoutEvent = {
  nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
};

function renderComponent(value: ComponentTypeLike | undefined): React.ReactNode {
  if (value == null) return null;
  return typeof value === 'function'
    ? React.createElement(value as React.ComponentType)
    : value;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') ref.current = value;
}

// Parking position for an idle pool cell: mounted (so re-use is a prop update,
// never a mount) but far outside any viewport, and outside the scroll content
// extent computed from child rects.
const PARKED_TOP = -1000000;

// ---------------------------------------------------------------------------
// Cell — one pool slot.
//
// The React key is the SLOT, never the item, so moving the window reassigns
// props on a mounted subtree instead of unmounting/remounting rows. `top` is a
// numeric style that rides the binary command buffer / style slab, so a window
// shift costs one style word per cell plus the row's own reconcile.
// ---------------------------------------------------------------------------
type CellProps<T> = {
  /** Index into `data` — what renderItem sees. */
  index: number;
  /** Index in display order — what the height table is keyed by. */
  displayIndex: number;
  itemKey: string;
  item: T | undefined;
  top: number;
  hidden: boolean;
  renderItem: (info: { item: T; index: number }) => React.ReactNode;
  onCellLayout: (displayIndex: number, height: number) => void;
  extraData: unknown;
};

function CellInner<T>(props: CellProps<T>): React.ReactElement | null {
  const { index, displayIndex, itemKey, item, top, hidden, renderItem, onCellLayout } = props;

  // Last height this cell reported. Two uses below; both matter for rows whose
  // size is not known up front.
  const lastHeightRef = React.useRef(0);
  const reportedForKeyRef = React.useRef('');

  const handleLayout = React.useCallback(
    (event: NativeLayoutEvent) => {
      const height = event.nativeEvent.layout.height;
      lastHeightRef.current = height;
      if (hidden || displayIndex < 0) return;
      reportedForKeyRef.current = itemKey;
      onCellLayout(displayIndex, height);
    },
    [displayIndex, hidden, itemKey, onCellLayout],
  );

  // A recycled cell whose new item happens to render at exactly the same height
  // produces NO layout event (the engine only reports a changed rect), so the
  // new item would keep its estimate forever and every offset below it would
  // drift. No event means the rect is unchanged, so the previous height is the
  // correct height for the new item — report it. A real layout event arrives
  // after this effect and wins, since both land in the same pending batch.
  React.useEffect(() => {
    if (hidden || displayIndex < 0) return;
    if (reportedForKeyRef.current === itemKey) return;
    if (lastHeightRef.current > 0) onCellLayout(displayIndex, lastHeightRef.current);
  }, [displayIndex, hidden, itemKey, onCellLayout]);

  // Parked cells keep rendering their previous item: the point of the pool is
  // that re-use is a prop update, and returning null here would unmount the
  // whole row subtree and make every reuse a fresh mount.
  const lastItemRef = React.useRef<T | undefined>(undefined);
  if (item !== undefined) lastItemRef.current = item;
  const renderedItem = item ?? lastItemRef.current;
  if (renderedItem === undefined) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: hidden ? PARKED_TOP : top,
        // left+right (not a measured width) lets Yoga derive the cell width
        // from the container, so text wraps at the real content width — with
        // an unconstrained width a wrapping row measures as one long line and
        // every height is wrong.
        left: 0,
        right: 0,
      }}
      onLayout={handleLayout}
    >
      {renderItem({ item: renderedItem, index })}
    </View>
  );
}

const Cell = React.memo(CellInner, (prev, next) =>
  prev.itemKey === next.itemKey &&
  prev.index === next.index &&
  prev.displayIndex === next.displayIndex &&
  // Item identity matters: a row whose content changes in place (streaming
  // text, a loaded image) keeps its key, and bailing here would freeze it.
  prev.item === next.item &&
  prev.top === next.top &&
  prev.hidden === next.hidden &&
  prev.extraData === next.extraData,
) as typeof CellInner;

type Slot = {
  id: number;
  slotKey: string;
  type: string | number;
  index: number;     // display index, -1 when free
  itemKey: string;
  top: number;
  hidden: boolean;
  idleSince: number;
};

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * Variable-height virtual list with cell recycling.
 *
 * Scrolling costs O(log n) per native scroll event and renders only when the
 * mounted index range actually has to move; a window shift reuses mounted cells
 * (no unmount/remount). Row heights stream in through `onLayout` and are
 * applied in one batched flush per frame.
 *
 * Recycling contract: your row component keeps its identity across items, so
 * row-local `useState` survives recycling. Derive from props, or reset with an
 * effect on the item key. `recycleItems={false}` restores unmount/remount
 * windowing.
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
    recycleItems = true,
    getItemType,
    extraData,
    overscanLeadMs = 250,
    maxIdleSlotsPerType = 4,
    ...scrollProps
  } = props as FlatListProps<T> & { ref?: React.Ref<FlatListHandle> };

  const scrollRef = React.useRef<ScrollViewHandle | null>(null);
  const [, forceRender] = React.useReducer((v: number) => v + 1, 0);
  const [viewport, setViewport] = React.useState({
    width: 0,
    height: estimatedItemSize * initialNumToRender,
  });

  // --- refs: everything that changes per scroll event or per layout event ---
  const offsetRef = React.useRef(0);
  const velocityRef = React.useRef({ v: 0, lastY: 0, lastT: 0 });
  const windowRef = React.useRef({ first: 0, last: -1 });
  const slotsRef = React.useRef<Slot[]>([]);
  const poolsRef = React.useRef(new Map<string | number, number[]>());
  const indexToSlotRef = React.useRef(new Map<number, number>());
  const heightsRef = React.useRef(new Map<string, number>());
  const pendingRef = React.useRef(new Map<number, number>());
  const flushScheduledRef = React.useRef(false);
  const anchorRef = React.useRef<{ key: string; delta: number } | null>(null);
  const invertedAtEndRef = React.useRef(true);
  const lastEndContentLength = React.useRef(-1);
  const totalRef = React.useRef(0);
  // Distance from the top of the scrollable content to the top of the cell
  // container — i.e. ListHeaderComponent plus any contentContainerStyle
  // padding. Row offsets are container-relative but native scroll offsets are
  // content-relative; without this the two disagree by exactly that padding and
  // the mounted window trails the viewport.
  const contentTopRef = React.useRef(0);
  const scrollViewYRef = React.useRef<number | null>(null);
  const toNativeY = React.useCallback((y: number) => y + contentTopRef.current, []);

  const viewportHeight = Math.max(1, viewport.height);

  // --- data-derived tables (rebuilt only when data/order changes) -----------
  const keys = React.useMemo(
    () => data.map((item, index) => (keyExtractor ? keyExtractor(item, index) : String(index))),
    [data, keyExtractor],
  );

  const maps = React.useMemo(() => {
    const count = data.length;
    const displayToData = new Array<number>(count);
    const dataToDisplay = new Array<number>(count);
    for (let d = 0; d < count; d++) {
      const dataIndex = inverted ? count - 1 - d : d;
      displayToData[d] = dataIndex;
      dataToDisplay[dataIndex] = d;
    }
    return { displayToData, dataToDisplay };
  }, [data.length, inverted]);

  // Heights survive data changes because they are cached by item key; a
  // prepend therefore does not re-measure the whole list.
  const tree = React.useMemo(() => {
    const t = new Fenwick(data.length);
    const heights = heightsRef.current;
    t.build(displayIndex => {
      const key = keys[maps.displayToData[displayIndex]];
      return heights.get(key) ?? estimatedItemSize;
    });
    totalRef.current = t.prefix(data.length);
    return t;
  }, [data.length, estimatedItemSize, keys, maps]);

  const displayHeight = React.useCallback(
    (displayIndex: number) =>
      heightsRef.current.get(keys[maps.displayToData[displayIndex]]) ?? estimatedItemSize,
    [estimatedItemSize, keys, maps],
  );

  const invertedUnderfill = inverted ? Math.max(0, viewportHeight - totalRef.current) : 0;
  const topOf = React.useCallback(
    (displayIndex: number) => (inverted ? Math.max(0, viewportHeight - totalRef.current) : 0) + tree.prefix(displayIndex),
    [inverted, tree, viewportHeight],
  );

  const typeOf = React.useCallback(
    (displayIndex: number): string | number => {
      if (!getItemType) return 0;
      const dataIndex = maps.displayToData[displayIndex];
      return getItemType(data[dataIndex], dataIndex);
    },
    [data, getItemType, maps],
  );

  // --- pool assignment ------------------------------------------------------
  const assignWindow = React.useCallback(
    (first: number, last: number) => {
      const slots = slotsRef.current;
      const pools = poolsRef.current;
      const indexToSlot = indexToSlotRef.current;
      const stamp = now();

      // Free slots that left the window (or whose item changed type).
      for (const [index, slotId] of indexToSlot) {
        const slot = slots[slotId];
        if (!slot) { indexToSlot.delete(index); continue; }
        if (index < first || index > last || typeOf(index) !== slot.type) {
          indexToSlot.delete(index);
          slot.index = -1;
          slot.itemKey = '';
          slot.hidden = true;
          slot.idleSince = stamp;
          let free = pools.get(slot.type);
          if (!free) { free = []; pools.set(slot.type, free); }
          free.push(slotId);
        }
      }

      // Assign from the leading edge inward, so under a fast fling the cells
      // that just left behind us are reused for what is coming next.
      const descending = velocityRef.current.v >= 0;
      for (let n = 0; n <= last - first; n++) {
        const index = descending ? last - n : first + n;
        const existing = indexToSlot.get(index);
        if (existing !== undefined) {
          slots[existing].top = topOf(index);
          continue;
        }
        const type = typeOf(index);
        let free = pools.get(type);
        if (!free) { free = []; pools.set(type, free); }
        let slotId = free.pop();
        if (slotId === undefined) {
          slotId = slots.length;
          slots.push({
            id: slotId,
            slotKey: `t${String(type)}#${slotId}`,
            type,
            index: -1,
            itemKey: '',
            top: PARKED_TOP,
            hidden: true,
            idleSince: stamp,
          });
        }
        const slot = slots[slotId];
        slot.index = index;
        slot.itemKey = keys[maps.displayToData[index]] ?? '';
        slot.top = topOf(index);
        slot.hidden = false;
        indexToSlot.set(index, slotId);
      }

      windowRef.current.first = first;
      windowRef.current.last = last;

      // Shrink: drop long-idle surplus cells (rare; unmounts them).
      for (const [type, free] of pools) {
        if (free.length <= maxIdleSlotsPerType) continue;
        const surplus = free.length - maxIdleSlotsPerType;
        let removed = 0;
        for (let i = 0; i < free.length && removed < surplus; i++) {
          const slot = slots[free[i]];
          if (!slot || stamp - slot.idleSince < 3000) continue;
          slot.type = type;
          slot.index = -2; // tombstone: dropped from the rendered set
          free.splice(i, 1);
          i--;
          removed++;
        }
      }
    },
    [keys, maps, maxIdleSlotsPerType, topOf, typeOf],
  );

  const recomputeWindow = React.useCallback(
    (y: number, force: boolean): boolean => {
      const count = data.length;
      if (count === 0) {
        if (windowRef.current.last >= 0) {
          windowRef.current = { first: 0, last: -1 };
          indexToSlotRef.current.clear();
          for (const slot of slotsRef.current) { slot.index = -1; slot.hidden = true; }
          return true;
        }
        return false;
      }
      const firstVisible = tree.lowerBound(y);
      const lastVisible = tree.lowerBound(y + viewportHeight);
      const win = windowRef.current;
      // Hysteresis: while the visible range sits comfortably inside the mounted
      // range, a scroll event does no work beyond the two searches above.
      if (
        !force &&
        win.last >= win.first &&
        firstVisible - 1 >= win.first &&
        lastVisible + 1 <= win.last
      ) {
        return false;
      }

      const base = viewportHeight * Math.max(1, windowSize);
      const lead = Math.min(Math.abs(velocityRef.current.v) * overscanLeadMs, base * 2);
      const padUp = velocityRef.current.v >= 0 ? base * 0.5 : base + lead;
      const padDown = velocityRef.current.v >= 0 ? base + lead : base * 0.5;
      const first = tree.lowerBound(Math.max(0, y - padUp));
      const last = Math.min(count - 1, tree.lowerBound(y + viewportHeight + padDown));
      if (!force && first === win.first && last === win.last) return false;
      assignWindow(first, last);
      return true;
    },
    [assignWindow, data.length, overscanLeadMs, tree, viewportHeight, windowSize],
  );

  // --- measurement: batch onLayout corrections into one flush --------------
  const flushMeasurements = React.useCallback(() => {
    flushScheduledRef.current = false;
    const pending = pendingRef.current;
    if (pending.size === 0) return;

    const anchor = anchorRef.current;
    const anchorIndex = anchor
      ? maps.dataToDisplay[keys.indexOf(anchor.key)] ?? -1
      : -1;
    let shiftAboveAnchor = 0;
    for (const [index, height] of pending) {
      if (index < 0 || index >= data.length) continue;
      const previous = displayHeight(index);
      const delta = height - previous;
      if (delta === 0) continue;
      tree.add(index, delta);
      heightsRef.current.set(keys[maps.displayToData[index]], height);
      if (anchorIndex >= 0 && index < anchorIndex) shiftAboveAnchor += delta;
    }
    pending.clear();
    totalRef.current = tree.prefix(data.length);

    let moved = false;
    for (const [index, slotId] of indexToSlotRef.current) {
      const slot = slotsRef.current[slotId];
      if (!slot) continue;
      const top = topOf(index);
      if (Math.abs(top - slot.top) > 0.5) { slot.top = top; moved = true; }
    }

    // Content above the viewport changed size: compensate so what the user is
    // looking at does not jump.
    if (shiftAboveAnchor !== 0) {
      const nextY = Math.max(0, offsetRef.current + shiftAboveAnchor);
      scrollRef.current?.scrollTo({ y: toNativeY(nextY), animated: false });
      offsetRef.current = nextY;
    }
    if (inverted && invertedAtEndRef.current) {
      const nextY = Math.max(0, totalRef.current - viewportHeight);
      scrollRef.current?.scrollTo({ y: toNativeY(nextY), animated: false });
      offsetRef.current = nextY;
    }

    const windowChanged = recomputeWindow(offsetRef.current, false);
    if (moved || windowChanged) forceRender();
  }, [data.length, displayHeight, inverted, keys, maps, recomputeWindow, toNativeY, topOf, tree, viewportHeight]);

  const onCellLayout = React.useCallback(
    (index: number, height: number) => {
      if (!(height > 0)) return;
      if (Math.abs(height - displayHeight(index)) < 0.5) return;
      pendingRef.current.set(index, height);
      if (!flushScheduledRef.current) {
        flushScheduledRef.current = true;
        queueMicrotask(flushMeasurements);
      }
    },
    [displayHeight, flushMeasurements],
  );

  const fireEndReached = React.useCallback(
    (y: number) => {
      if (!onEndReached || data.length === 0) return;
      const distanceFromEnd = Math.max(0, totalRef.current - viewportHeight - y);
      if (
        distanceFromEnd <= viewportHeight * onEndReachedThreshold &&
        lastEndContentLength.current !== totalRef.current
      ) {
        lastEndContentLength.current = totalRef.current;
        onEndReached({ distanceFromEnd });
      }
    },
    [data.length, onEndReached, onEndReachedThreshold, viewportHeight],
  );

  // --- scroll: the hot path ------------------------------------------------
  const handleScroll = React.useCallback(
    (event: NativeScrollEvent) => {
      // Work in container space throughout (see contentTopRef).
      const y = event.nativeEvent.contentOffset.y - contentTopRef.current;
      const t = now();
      const vel = velocityRef.current;
      const dt = t - vel.lastT;
      if (dt > 100 || dt <= 0) {
        vel.v = 0;
      } else {
        const instant = (y - vel.lastY) / dt;
        vel.v = Math.sign(instant) !== Math.sign(vel.v) ? instant : vel.v * 0.7 + instant * 0.3;
      }
      vel.lastY = y;
      vel.lastT = t;
      offsetRef.current = y;

      if (inverted) invertedAtEndRef.current = totalRef.current - viewportHeight - y <= 1;

      if (data.length > 0) {
        const firstVisible = tree.lowerBound(y);
        anchorRef.current = {
          key: keys[maps.displayToData[firstVisible]],
          delta: y - tree.prefix(firstVisible),
        };
      }

      onScroll?.(event);
      fireEndReached(y);
      if (recomputeWindow(y, false)) forceRender();
    },
    [data.length, fireEndReached, inverted, keys, maps, onScroll, recomputeWindow, tree, viewportHeight],
  );

  // Data / viewport / inversion changed: re-seat the window against the
  // current offset. Slots keep their mounted content; only props move.
  React.useLayoutEffect(() => {
    recomputeWindow(offsetRef.current, true);
    forceRender();
  }, [recomputeWindow]);

  React.useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !maintainVisibleContentPosition) return;
    const dataIndex = keys.indexOf(anchor.key);
    if (dataIndex < maintainVisibleContentPosition.minIndexForVisible) return;
    const displayIndex = maps.dataToDisplay[dataIndex];
    if (displayIndex === undefined) return;
    const nextOffset = Math.max(0, tree.prefix(displayIndex) + anchor.delta);
    if (Math.abs(nextOffset - offsetRef.current) > 0.5) {
      scrollRef.current?.scrollTo({ y: toNativeY(nextOffset), animated: false });
      offsetRef.current = nextOffset;
      recomputeWindow(nextOffset, true);
      forceRender();
    }
  }, [keys, maintainVisibleContentPosition, maps, recomputeWindow, toNativeY, tree]);

  // RN's inverted list has offset 0 at the visual bottom. The native ScrollView
  // is not transformed, so pin its physical offset to the content end while the
  // user is within a pixel of that edge.
  React.useLayoutEffect(() => {
    if (!inverted || !invertedAtEndRef.current) return;
    const nextOffset = Math.max(0, totalRef.current - viewportHeight);
    scrollRef.current?.scrollTo({ y: toNativeY(nextOffset), animated: false });
    offsetRef.current = nextOffset;
    recomputeWindow(nextOffset, true);
  }, [inverted, recomputeWindow, toNativeY, tree, viewportHeight]);

  // Imperative scroll: move the window in the same tick rather than waiting for
  // the native scroll event to come back, so scrollToIndex paints the target
  // rows on the very next frame instead of showing blanks for one round trip.
  const scrollToY = React.useCallback(
    (y: number, animated?: boolean) => {
      const next = Math.max(0, y);
      scrollRef.current?.scrollTo({ y: toNativeY(next), animated });
      offsetRef.current = next;
      velocityRef.current.v = 0;
      velocityRef.current.lastY = next;
      velocityRef.current.lastT = now();
      if (recomputeWindow(next, false)) forceRender();
    },
    [recomputeWindow, toNativeY],
  );

  const makeHandle = React.useCallback(
    (): FlatListHandle => ({
      node: scrollRef.current?.node,
      scrollToOffset: ({ offset: next, animated }) => scrollToY(next, animated),
      scrollToIndex: ({ index, viewOffset = 0, animated }) => {
        if (index < 0 || index >= data.length) {
          throw new RangeError(`scrollToIndex index ${index} is out of range`);
        }
        const displayIndex = maps.dataToDisplay[index];
        scrollToY(topOf(displayIndex) - viewOffset, animated);
      },
      scrollToEnd: options => {
        scrollRef.current?.scrollToEnd(options);
        scrollToY(Math.max(0, totalRef.current - viewportHeight), options?.animated);
      },
    }),
    [data.length, maps, scrollToY, topOf, viewportHeight],
  );

  React.useImperativeHandle(ref, makeHandle, [makeHandle]);

  const empty = data.length === 0 ? renderComponent(ListEmptyComponent) : null;
  const header = data.length > 0 ? renderComponent(ListHeaderComponent) : null;
  const footer = data.length > 0 ? renderComponent(ListFooterComponent) : null;

  if (!recycleItems) {
    return (
      <LegacyWindowedList
        {...(props as FlatListProps<T>)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={ref as any}
      />
    );
  }

  const cells: React.ReactNode[] = [];
  for (const slot of slotsRef.current) {
    if (slot.index === -2) continue; // shrunk away
    const dataIndex = slot.index >= 0 ? maps.displayToData[slot.index] : -1;
    cells.push(
      <Cell
        key={slot.slotKey}
        index={dataIndex}
        displayIndex={slot.index}
        itemKey={slot.itemKey}
        item={dataIndex >= 0 ? data[dataIndex] : undefined}
        top={slot.top}
        hidden={slot.hidden}
        renderItem={renderItem as (info: { item: T; index: number }) => React.ReactNode}
        onCellLayout={onCellLayout}
        extraData={extraData}
      />,
    );
  }

  return (
    <ScrollView
      {...scrollProps}
      ref={instance => {
        scrollRef.current = instance;
        assignRef(ref, instance ? makeHandle() : null);
      }}
      style={style as StyleProp}
      onLayout={event => {
        const { y, width, height } = event.nativeEvent.layout;
        scrollViewYRef.current = y;
        setViewport(prev =>
          Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
            ? prev
            : { width, height },
        );
        props.onLayout?.(event);
      }}
      onScroll={handleScroll}
      keyboardAware={props.keyboardAware}
    >
      {header}
      <View
        style={{
          height: Math.max(totalRef.current + invertedUnderfill, 0),
          flexShrink: 0,
          position: 'relative',
        }}
        onLayout={event => {
          // Layout rects are absolute; the container's distance below the
          // viewport's top, plus however far we are scrolled, is exactly the
          // header + content padding above the first row.
          const scrollViewY = scrollViewYRef.current;
          if (scrollViewY == null) return;
          const contentTop = Math.max(
            0,
            event.nativeEvent.layout.y - scrollViewY + offsetRef.current + contentTopRef.current,
          );
          if (Math.abs(contentTop - contentTopRef.current) < 0.5) return;
          contentTopRef.current = contentTop;
          if (recomputeWindow(offsetRef.current, true)) forceRender();
        }}
      >
        {cells}
      </View>
      {footer}
      {empty}
    </ScrollView>
  );
}

/**
 * Alias for {@link FlatList}. It used to render every item into a plain
 * ScrollView, so a 10k-row `List` built 10k native nodes and re-laid out all of
 * them every frame; it is virtualized and recycling now.
 */
export function List<T>(props: ListProps<T>): React.ReactElement {
  return <FlatList {...(props as FlatListProps<T>)} />;
}

// ---------------------------------------------------------------------------
// Legacy windowed list (recycleItems={false}) — rows keyed by item, so they
// unmount and remount as the window moves. Kept for lists whose rows rely on
// mount/unmount semantics.
// ---------------------------------------------------------------------------
function lowerBoundArray(offsets: number[], target: number): number {
  let low = 0;
  let high = Math.max(0, offsets.length - 1);
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (offsets[middle] <= target) low = middle;
    else high = middle - 1;
  }
  return low;
}

const LegacyWindowedList = React.forwardRef(function LegacyWindowedList<T>(
  props: FlatListProps<T>,
  ref: React.Ref<FlatListHandle>,
): React.ReactElement {
  const {
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
    recycleItems: _recycleItems,
    getItemType: _getItemType,
    extraData: _extraData,
    overscanLeadMs: _overscanLeadMs,
    maxIdleSlotsPerType: _maxIdleSlotsPerType,
    ...scrollProps
  } = props;
  const scrollRef = React.useRef<ScrollViewHandle | null>(null);
  const measuredRef = React.useRef(new Map<string, number>());
  const [measurementVersion, bumpMeasurements] = React.useReducer((value: number) => value + 1, 0);
  const [viewport, setViewport] = React.useState({ width: 0, height: estimatedItemSize * initialNumToRender });
  const [offset, setOffset] = React.useState(0);
  const lastEndContentLength = React.useRef(-1);
  const previousAnchor = React.useRef<{ key: string; delta: number } | null>(null);
  const invertedAtEnd = React.useRef(true);

  const keys = React.useMemo(
    () => data.map((item, index) => (keyExtractor ? keyExtractor(item, index) : String(index))),
    [data, keyExtractor],
  );

  const metrics = React.useMemo(() => {
    const count = data.length;
    const displayToData = Array.from({ length: count }, (_, displayIndex) =>
      inverted ? count - 1 - displayIndex : displayIndex,
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
  const start = data.length === 0 ? 0 : Math.max(0, lowerBoundArray(metrics.offsets, Math.max(0, offset - overscan)));
  const end = data.length === 0
    ? 0
    : Math.min(data.length, lowerBoundArray(metrics.offsets, offset + viewportHeight + overscan) + 1);

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
      scrollRef.current?.scrollTo({ y: Math.max(0, metrics.offsets[displayIndex] - viewOffset), animated });
    },
    scrollToEnd: options => scrollRef.current?.scrollToEnd(options),
  }), [data.length, metrics]);

  React.useImperativeHandle(ref, makeHandle, [makeHandle]);

  const handleScroll = React.useCallback((event: NativeScrollEvent) => {
    const nextOffset = event.nativeEvent.contentOffset.y;
    if (inverted) invertedAtEnd.current = metrics.total - viewportHeight - nextOffset <= 1;
    setOffset(nextOffset);
    if (data.length > 0) {
      const first = Math.min(data.length - 1, lowerBoundArray(metrics.offsets, nextOffset));
      const dataIndex = metrics.displayToData[first];
      previousAnchor.current = { key: keys[dataIndex], delta: nextOffset - metrics.offsets[first] };
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
        onLayout={(event: NativeLayoutEvent) => {
          const height = event.nativeEvent.layout.height;
          if (!(height > 0) || Math.abs((measuredRef.current.get(key) ?? 0) - height) < 0.5) return;
          measuredRef.current.set(key, height);
          bumpMeasurements();
        }}
      >
        {renderItem({ item: data[dataIndex], index: dataIndex })}
      </View>,
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
      ref={instance => { scrollRef.current = instance; }}
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
}) as <T>(props: FlatListProps<T> & { ref?: React.Ref<FlatListHandle> }) => React.ReactElement;
