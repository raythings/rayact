#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const buildOrder = [
  '@rayact/shared',
  '@rayact/runtime',
  '@rayact/renderer',
  '@rayact/react',
  '@rayact/navigation',
  '@rayact/router',
  '@rayact/worklets',
  '@rayact/prebuild',
  '@rayact/dev-server',
  '@rayact/dev-client',
  'create-rayact-app',
  '@rayact/cli',
  '@rayact/mmkv',
  '@rayact/secure-store',
  '@rayact/crash-reporter',
  'rayact',
  // Platform capability packages are built after the umbrella because UI
  // packages such as svg and webview import from rayact/react.
  '@rayact/svg',
  '@rayact/barcode-scanner',
  '@rayact/clipboard',
  '@rayact/haptics',
  '@rayact/image-picker',
  '@rayact/linking',
  '@rayact/sensors',
  '@rayact/webview',
];

for (const workspace of buildOrder) {
  const result = spawnSync('npm', ['run', 'build', `--workspace=${workspace}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
