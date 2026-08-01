import React from 'react';
import { Stack } from '@rayact/router';
import '../src/app.css';

// The root layout wraps every route in the app/ directory.
// Files become screens automatically: app/index.tsx is "/",
// app/details/[id].tsx is "/details/:id", app/+not-found.tsx catches the rest.
export default function RootLayout() {
  return (
    <Stack screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ title: '__PROJECT_NAME__' }} />
    </Stack>
  );
}
