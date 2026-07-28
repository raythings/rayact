#!/usr/bin/env node
// Headless dev server for on-device testing.
//
// `rayact dev` renders an Ink TUI, which is unusable from a non-interactive
// shell. startRayactDevServer is the same server without the UI.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
// The `rayact` package in node_modules does not expose the ./dev-server
// subpath unless the umbrella package has been built, so import the workspace
// package directly — this script only ever runs from inside the repo.
import { startRayactDevServer } from '../../../packages/rayact-dev-server/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const port = Number(process.env.RAYACT_PORT || 8091);
const cdpPort = Number(process.env.RAYACT_CDP_PORT || 9241);

const server = await startRayactDevServer({
  root,
  entry: process.env.RAYACT_ENTRY || 'src/flatlist-bench.tsx',
  platform: 'android',
  host: '0.0.0.0',
  port,
  cdpPort
});

console.log(`[dev-headless] serving ${root} on :${server?.port ?? port}`);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
