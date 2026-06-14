import React from 'react';
import { View, Text } from '@rayact/react';
import { themeColors, type DevLauncherTheme } from '../devLauncherTheme.js';

export type ServerListRowProps = {
  dotColor: number;
  title: string;
  subtitle?: string;
  theme: DevLauncherTheme | null;
  embedded?: boolean;
  disableTap?: boolean;
  onPress: () => void;
};

export function ServerListRow(props: ServerListRowProps) {
  const {
    dotColor,
    title,
    subtitle,
    theme,
    embedded = false,
    disableTap = false,
    onPress,
  } = props;
  const colors = themeColors(theme);

  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', minWidth: 0 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: dotColor,
          flexShrink: 0,
        }}
      />
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: colors.onSurfaceVariant,
          opacity: 0.35,
          flexShrink: 0,
        }}
      />
      <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ text: { color: colors.onSurface, fontSize: 15, fontWeight: 500 } }}>{title}</Text>
        {subtitle ? (
          <Text style={{ text: { color: colors.onSurfaceVariant, fontSize: 13 } }}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );

  if (embedded) return row;

  return (
    <View
      style={{
        width: '100%',
        padding: 14,
        borderRadius: 12,
        backgroundColor: colors.surfaceContainer,
      }}
      capturesInput
      onPress={disableTap ? undefined : onPress}
    >
      {row}
    </View>
  );
}
