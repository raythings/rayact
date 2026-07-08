#!/usr/bin/env node
/**
 * Stage non-compiled assets into ./dist after the tsc builds.
 *
 * The unified tsc projects (tsconfig.app.json + tsconfig.node.json) emit all
 * subsystem JS into dist/<subsystem>/ directly; this copies the remaining
 * checked-in assets the published `rayact` package needs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const COPIES = [
  // [source, dist destination, required]
  ['schema', 'schema', true],
  ['prebuild-scripts', 'prebuild-scripts', true],
  ['packages/template-android', 'templates/android', true],
  ['packages/template-ios', 'templates/ios', true],
  ['packages/create-rayact-app/dist', 'create-rayact-app/dist', true],
  ['src/shared/material_icons.js', 'shared/material_icons.js', true],
  ['src/shared/material_icons.d.ts', 'shared/material_icons.d.ts', true],
  ['src/react/avoid-keyboard.css', 'react/avoid-keyboard.css', true]
];

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

for (const [rel, destRel, required] of COPIES) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) {
    if (required) throw new Error(`Missing staged asset source: ${rel}`);
    continue;
  }
  copy(src, path.join(DIST, destRel));
}

console.log(`Staged rayact package assets in ${path.relative(ROOT, DIST)}`);
