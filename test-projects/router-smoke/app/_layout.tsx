import * as React from 'react';
import { Stack } from '@rayact/router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
    </Stack>
  );
}
