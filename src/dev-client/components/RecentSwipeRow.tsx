import React, { useCallback, useRef, useState } from 'react';
import { View, Text, useSharedValue, withTiming } from '../../react/index.js';
import { ServerListRow } from './ServerListRow.js';
import { themeColors, type DevLauncherTheme } from '../devLauncherTheme.js';

const DELETE_REVEAL = 72;

export function RecentSwipeRow(props: {
  title: string;
  subtitle?: string;
  dotColor: number;
  theme: DevLauncherTheme | null;
  onConnect: () => void;
  onRemove: () => void;
}) {
  const { title, subtitle, dotColor, theme, onConnect, onRemove } = props;
  const colors = themeColors(theme);
  const translateX = useSharedValue(0);
  const [open, setOpen] = useState(false);
  const offsetRef = useRef(0);
  const dragStart = useRef({ x: 0, y: 0 });
  const startOffset = useRef(0);
  const dragging = useRef(false);

  const snapEnd = useCallback(() => {
    dragging.current = false;
    const next = offsetRef.current < -DELETE_REVEAL / 2 ? -DELETE_REVEAL : 0;
    offsetRef.current = next;
    translateX.value = withTiming(next, 120);
    setOpen(next < 0);
  }, [translateX]);

  const onDragStart = useCallback((e: { x: number; y: number }) => {
    dragging.current = true;
    dragStart.current = { x: e.x, y: e.y };
    startOffset.current = offsetRef.current;
  }, []);

  const onDragMove = useCallback((e: { x: number; y: number }) => {
    if (!dragging.current) return;
    let next = startOffset.current + e.x;
    if (next > 0) next = 0;
    if (next < -DELETE_REVEAL) next = -DELETE_REVEAL;
    offsetRef.current = next;
    translateX.value = next;
  }, [translateX]);

  const onForegroundPress = useCallback(() => {
    if (offsetRef.current < -12) {
      offsetRef.current = 0;
      translateX.value = withTiming(0, 120);
      setOpen(false);
      return;
    }
    onConnect();
  }, [onConnect, translateX]);

  const onDeletePress = useCallback(() => {
    offsetRef.current = 0;
    translateX.value = 0;
    setOpen(false);
    onRemove();
  }, [onRemove, translateX]);

  return (
    <View style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, width: '100%' }}>
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
          theme={theme}
          disableTap
          onPress={() => {}}
        />
      </View>
      {open ? (
        <View
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: DELETE_REVEAL,
            overflow: 'hidden',
            backgroundColor: colors.error,
            alignItems: 'center',
            justifyContent: 'center',
            borderTopRightRadius: 12,
            borderBottomRightRadius: 12,
            zIndex: 2,
          }}
          capturesInput
          onPress={onDeletePress}
        >
          <Text style={{ text: { color: 0xffffffff, fontSize: 13, fontWeight: 600 } }}>Delete</Text>
        </View>
      ) : null}
    </View>
  );
}
