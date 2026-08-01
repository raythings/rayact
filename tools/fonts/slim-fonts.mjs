#!/usr/bin/env node
/**
 * Slim fonts in place (or into a destination) using the CLI's slimFont.
 *
 *   node tools/fonts/slim-fonts.mjs <file-or-dir> [dest-dir]
 *
 * Exists so the shell packaging scripts and the web CMake build can share the
 * exact rewriter `rayact build` uses instead of carrying a second copy. The
 * canonical implementation lives in packages/rayact-cli (it ships to users);
 * this is a repo-internal wrapper over its build output.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const slimFontModule = path.join(repoRoot, 'packages/rayact-cli/dist/fonts/slimFont.js');

let slimFont;
let isSlimmableFont;
try {
  ({ slimFont, isSlimmableFont } = await import(slimFontModule));
} catch (error) {
  console.error(
    `slim-fonts: cannot load ${path.relative(repoRoot, slimFontModule)} — ` +
      'build the CLI first (npm run build -w @rayact/cli).'
  );
  console.error(String(error?.message ?? error));
  process.exit(1);
}

const mb = bytes => `${(bytes / 1e6).toFixed(2)} MB`;

async function slimOne(src, dest) {
  const original = await fs.readFile(src);
  const { out, dropped, skipped } = slimFont(original);
  if (!dropped.length && src === dest) {
    console.log(`  ${path.basename(src)}: unchanged (${skipped})`);
    return 0;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, out);
  if (dropped.length) {
    console.log(
      `  slimmed ${path.basename(src)} ${mb(original.length)} -> ${mb(out.length)} ` +
        `(dropped ${dropped.join(', ')})`
    );
  }
  return original.length - out.length;
}

const [target, destDir] = process.argv.slice(2);
if (!target) {
  console.error('usage: slim-fonts.mjs <file-or-dir> [dest-dir]');
  process.exit(2);
}

const stat = await fs.stat(target).catch(() => null);
if (!stat) {
  console.error(`slim-fonts: no such path: ${target}`);
  process.exit(1);
}

let saved = 0;
if (stat.isDirectory()) {
  for (const name of await fs.readdir(target)) {
    if (!isSlimmableFont(name)) continue;
    const src = path.join(target, name);
    if (!(await fs.stat(src)).isFile()) continue;
    saved += await slimOne(src, destDir ? path.join(destDir, name) : src);
  }
} else if (isSlimmableFont(target)) {
  saved += await slimOne(target, destDir ? path.join(destDir, path.basename(target)) : target);
} else {
  console.error(`slim-fonts: not a .ttf/.otf: ${target}`);
  process.exit(2);
}

if (saved > 0) console.log(`  total saved ${mb(saved)}`);
