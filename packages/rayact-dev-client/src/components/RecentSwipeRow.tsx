import React, { useCallback, useRef } from 'react';
import { View, Text, useSharedValue, withSpring, withTiming } from '@rayact/react';
import { ServerListRow } from './ServerListRow.js';
import { clampSwipeOffset, DELETE_REVEAL } from './swipeMath.js';
import { themeColors, type DevLauncherTheme } from '../devLauncherTheme.js';

const DRAG_LOCK_SLOP = 6;
const SNAP_PROJECTION_MS = 80;

export function RecentSwipeRow(props: {
  title: string;
  subtitle?: string;
  dotColor: number;
  statusText?: string;
  statusColor?: number;
  theme: DevLauncherTheme | null;
  onConnect: () => void;
  onRemove: () => void;
}) {
  const { title, subtitle, dotColor, statusText, statusColor, theme, onConnect, onRemove } = props;
  const colors = themeColors(theme);
  const translateX = useSharedValue(0);
  const offsetRef = useRef(0);
  const startOffset = useRef(0);
  const dragging = useRef(false);
  const dragAxis = useRef<'pending' | 'horizontal' | 'vertical'>('pending');
  const dragStartedAt = useRef(0);
  const suppressPress = useRef(false);
  const rowWidth = useRef(DELETE_REVEAL * 4);
  const deleting = useRef(false);

  const snapEnd = useCallback((e: { x: number; y: number }) => {
    dragging.current = false;
    if (dragAxis.current !== 'horizontal') {
      dragAxis.current = 'pending';
      return;
    }
    const elapsed = Math.max(16, Date.now() - dragStartedAt.current);
    const velocityX = e.x / elapsed;
    const projected = offsetRef.current + velocityX * SNAP_PROJECTION_MS;
    const next = projected < -DELETE_REVEAL / 2 ? -DELETE_REVEAL : 0;
    offsetRef.current = next;
    translateX.value = withSpring(next, 260, 28);
    suppressPress.current = true;
    dragAxis.current = 'pending';
  }, [translateX]);

  const onDragStart = useCallback(() => {
    dragging.current = true;
    dragAxis.current = 'pending';
    dragStartedAt.current = Date.now();
    suppressPress.current = false;
    const current = translateX.value;
    offsetRef.current = current;
    startOffset.current = current;
    // Assigning the current value cancels a snap animation if the user grabs
    // the row while it is still settling.
    translateX.value = current;
  }, [translateX]);

  const onDragMove = useCallback((e: { x: number; y: number }) => {
    if (!dragging.current) return;
    if (dragAxis.current === 'pending') {
      if (Math.max(Math.abs(e.x), Math.abs(e.y)) < DRAG_LOCK_SLOP) return;
      dragAxis.current = Math.abs(e.x) > Math.abs(e.y) ? 'horizontal' : 'vertical';
      suppressPress.current = true;
    }
    if (dragAxis.current !== 'horizontal') return;
    const next = clampSwipeOffset(startOffset.current, e.x);
    offsetRef.current = next;
    translateX.value = next;
  }, [translateX]);

  const onForegroundPress = useCallback(() => {
    if (suppressPress.current) {
      suppressPress.current = false;
      return;
    }
    if (offsetRef.current < -12) {
      offsetRef.current = 0;
      translateX.value = withSpring(0, 260, 28);
      return;
    }
    onConnect();
  }, [onConnect, translateX]);

  const onDeletePress = useCallback(() => {
    if (deleting.current) return;
    deleting.current = true;
    const target = -Math.max(rowWidth.current, DELETE_REVEAL);
    offsetRef.current = target;
    translateX.value = withTiming(target, 180);
    setTimeout(onRemove, 180);
  }, [onRemove, translateX]);

  return (
    <View
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, width: '100%', backgroundColor: colors.error }}
      onLayout={(event: { nativeEvent: { layout: { width: number } } }) => {
        if (event.nativeEvent.layout.width > 0) rowWidth.current = event.nativeEvent.layout.width;
      }}
    >
      <View
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: DELETE_REVEAL,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 0,
        }}
        capturesInput
        onPress={onDeletePress}
      >
        <Text style={{ text: { color: 0xffffffff, fontSize: 13, fontWeight: 700 } }}>Delete</Text>
      </View>
      <View
        style={{
          transform: [{ translateX }],
          backgroundColor: colors.surfaceContainer,
          borderRadius: 12,
          padding: 14,
          width: '100%',
          minWidth: 0,
          zIndex: 1,
        }}
        capturesInput
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={snapEnd}
        onPress={onForegroundPress}
      >
        <ServerListRow
          embedded
          dotColor={dotColor}
          title={title}
          subtitle={subtitle}
          statusText={statusText}
          statusColor={statusColor}
          theme={theme}
          disableTap
          onPress={() => {}}
        />
      </View>
    </View>
  );
}
