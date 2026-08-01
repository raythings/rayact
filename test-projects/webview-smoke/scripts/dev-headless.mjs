#!/usr/bin/env node
// Headless dev server for on-device testing (same pattern as
// desktop-smoke/scripts/dev-headless.mjs): `rayact dev` renders an Ink TUI,
// which is unusable from a non-interactive shell.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRayactDevServer } from '../../../packages/rayact-dev-server/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const port = Number(process.env.RAYACT_PORT || 8082);
const cdpPort = Number(process.env.RAYACT_CDP_PORT || 9230);

const server = await startRayactDevServer({
  root,
  entry: process.env.RAYACT_ENTRY || 'src/App.tsx',
  platform: process.env.RAYACT_PLATFORM || 'android',
  host: '0.0.0.0',
  port,
  cdpPort
});

console.log(`[dev-headless] serving ${root} on :${server?.port ?? port}`);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
