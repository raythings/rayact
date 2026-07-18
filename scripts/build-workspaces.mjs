#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const buildOrder = [
  '@rayact/shared',
  '@rayact/runtime',
  '@rayact/renderer',
  '@rayact/react',
  '@rayact/navigation',
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
];

for (const workspace of buildOrder) {
  const result = spawnSync('npm', ['run', 'build', `--workspace=${workspace}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
