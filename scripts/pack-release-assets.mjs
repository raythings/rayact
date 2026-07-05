#!/usr/bin/env node
/**
 * Collect local v0.0.1 release assets and write release1/SHA256SUMS.
 *
 * This script does not create tags, push, or upload. It packages artifacts that
 * have already been built by scripts/build-prebuilts.mjs and apps/web.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'release1');
const VERSION = process.env.RAYACT_RELEASE_VERSION || '0.0.1';

fs.mkdirSync(OUT, { recursive: true });

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with ${r.status}`);
}

function copyIfExists(src, name = path.basename(src)) {
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, path.join(OUT, name));
  return true;
}

function packDir(dir, name) {
  if (!fs.existsSync(dir)) return false;
  run('tar', ['-czf', path.join(OUT, name), '-C', path.dirname(dir), path.basename(dir)]);
  return true;
}

function packWebHost(dir, name) {
  if (!fs.existsSync(dir)) return false;
  const stage = path.join(OUT, '.rayact-web-host-stage');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(path.join(stage, 'host'), { recursive: true });
  for (const file of ['rayact.html', 'rayact.js', 'rayact.wasm']) {
    fs.copyFileSync(path.join(dir, file), path.join(stage, 'host', file));
  }
  run('tar', ['-czf', path.join(OUT, name), '-C', stage, 'host']);
  fs.rmSync(stage, { recursive: true, force: true });
  return true;
}

function npmPack(dir) {
  if (!fs.existsSync(path.join(dir, 'package.json'))) return false;
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', OUT], { cwd: dir });
  return true;
}

const assets = [];
const add = (ok, name) => { if (ok) assets.push(name); };

for (const pkg of fs.readdirSync(path.join(ROOT, 'packages'))) {
  const dir = path.join(ROOT, 'packages', pkg);
  if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
  const before = new Set(fs.readdirSync(OUT));
  npmPack(dir);
  for (const file of fs.readdirSync(OUT)) {
    if (!before.has(file) && file.endsWith('.tgz')) assets.push(file);
  }
}

{
  const before = new Set(fs.readdirSync(OUT));
  npmPack(path.join(ROOT, 'apps/dev-app'));
  for (const file of fs.readdirSync(OUT)) {
    if (!before.has(file) && file.endsWith('.tgz')) assets.push(file);
  }
}

add(copyIfExists(path.join(ROOT, 'apps/dev-app/dist/rayact-dev-app.apk')), 'rayact-dev-app.apk');
add(copyIfExists(path.join(ROOT, 'apps/dev-app/dist/rayact-dev-app-device-unsigned.ipa')), 'rayact-dev-app-device-unsigned.ipa');
add(copyIfExists(path.join(ROOT, 'apps/dev-app/dist/rayact-dev-app-simulator.zip')), 'rayact-dev-app-simulator.zip');

const webBin = path.join(ROOT, 'build-web/bin');
add(packWebHost(webBin, `rayact-web-${VERSION}.tar.gz`), `rayact-web-${VERSION}.tar.gz`);

const releasable = fs.readdirSync(OUT)
  .filter((f) => f !== 'SHA256SUMS' && fs.statSync(path.join(OUT, f)).isFile())
  .sort();

const sums = releasable.map((file) => {
  const data = fs.readFileSync(path.join(OUT, file));
  return `${createHash('sha256').update(data).digest('hex')}  ${file}`;
}).join('\n') + '\n';

fs.writeFileSync(path.join(OUT, 'SHA256SUMS'), sums);
console.log(`Packed ${releasable.length} release asset(s) into ${OUT}`);
