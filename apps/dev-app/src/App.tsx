/*
 * Entry for a plain (non-dev-client) build of the dev app — it simply mounts the
 * dev launcher. The packaged Android/desktop hosts are normally built in
 * dev-client mode, where the bundler's virtual entry mounts this same launcher
 * with branding injected; this file makes `rayact start --dev` and ordinary
 * builds render the launcher too.
 */
import React from 'react';
import { render } from 'rayact/react';
import { DevLauncherProvider, DevLauncherUI, DevMenu, getOfficialApp } from '@rayact/dev-client';

function App() {
  return (
    <DevLauncherProvider>
      <DevLauncherUI />
      <DevMenu />
    </DevLauncherProvider>
  );
}

const host = globalThis as { initRaylib?: (w: number, h: number, t: string) => void };
if (typeof host.initRaylib === 'function') {
  host.initRaylib(420, 820, getOfficialApp().displayName || 'Rayact Dev App');
}

render(<App />);
