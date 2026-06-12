#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  const cli = require.resolve('@rayact/cli/dist/cli.js');
  const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
} catch {
  console.error('@rayact/cli not found. Install @rayact/cli or build packages/rayact-cli.');
  process.exit(1);
}
