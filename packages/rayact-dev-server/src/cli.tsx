#!/usr/bin/env node
import path from 'node:path';
import { writeRayactBuild, type RayactBuildMode } from './bundler.js';
import type { ParsedArgs } from './tui.js';

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: argv[0] ?? 'dev',
    host: '0.0.0.0',
    port: 8081,
    entry: 'apps/desktop/src/App.tsx',
    platform: 'desktop',
    desktopBin: 'build/bin/rayact_desktop',
    mode: 'development',
    outDir: 'dist/rayact'
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--host' && next) {
      args.host = next;
      i++;
    } else if (arg === '--port' && next) {
      args.port = Number(next);
      i++;
    } else if (arg === '--entry' && next) {
      args.entry = next;
      i++;
    } else if (arg === '--platform' && next) {
      args.platform = next;
      i++;
    } else if (arg === '--desktop-bin' && next) {
      args.desktopBin = next;
      i++;
    } else if (arg === '--mode' && next) {
      if (next !== 'development' && next !== 'dev-client' && next !== 'release') {
        throw new Error(`Invalid --mode ${next}`);
      }
      args.mode = next as RayactBuildMode;
      i++;
    } else if (arg === '--out' && next) {
      args.outDir = next;
      i++;
    }
  }

  return args;
}

// ─── Entry ────────────────────────────────────────────────────────────────────

const cliArgs = parseArgs(process.argv.slice(2));

if (cliArgs.command === 'build') {
  const outDir = path.resolve(process.cwd(), cliArgs.outDir);
  writeRayactBuild({
    root: process.cwd(),
    entry: cliArgs.entry,
    platform: cliArgs.platform,
    mode: cliArgs.mode === 'development' ? 'release' : cliArgs.mode,
    outDir
  }).then(output => {
    console.log(`Rayact ${output.mode} build written to ${outDir}`);
    console.log(`Bundle: ${output.mode === 'dev-client' ? 'dev-client.js' : 'bundle.js'}`);
    console.log(`Assets: ${output.assets.length}`);
  }).catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
} else if (cliArgs.command !== 'dev') {
  console.error(`Unknown command: ${cliArgs.command}`);
  console.error('Usage: rayact dev --host 0.0.0.0 --port 8081 --entry apps/desktop/src/App.tsx');
  console.error('Usage: rayact build --mode release --entry apps/desktop/src/App.tsx --out dist/rayact/release');
  process.exit(1);
} else {
  // Dynamically import the Ink TUI only for `dev`, so `build` never loads `ink`
  // (which statically imports React — incompatible with Node's cjs-lexer under
  // React 19.2's `useEffectEvent` export).
  void import('./tui.js').then(({ startDevTui }) => startDevTui(cliArgs));
}
