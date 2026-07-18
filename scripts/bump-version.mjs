#!/usr/bin/env node
// Lockstep version bump: set every @rayact/* package, internal dep range, prebuilt
// manifest engineVersion, and the version constants/banners to <version> in one
// shot. Keeps the engine and JS packages in step (the moduleAbiVersion gate guards
// runtime compatibility separately).
//   node scripts/bump-version.mjs 0.0.2
//   node scripts/bump-version.mjs --check     # verify everything already agrees
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const arg = process.argv.slice(2).find((a) => !a.startsWith('-'));

const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const version = check ? current : arg;
if (!version) {
  console.error('usage: bump-version.mjs <version> | --check');
  process.exit(1);
}

let changes = 0;
const edit = (rel, fn) => {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) {
    changes++;
    if (!check) fs.writeFileSync(file, after);
    else console.error(`out of sync: ${rel}`);
  }
};

const isInternal = (k) => k.startsWith('@rayact/') || k === 'create-rayact-app' || k === 'rayact';
const bumpRange = (v) => v
  .replace(/^(\^|~)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, (_, pre) => (pre || '') + version)
  .replace(/#v\d+\.\d+\.\d+$/, `#v${version}`)
  .replace(/\/download\/v\d+\.\d+\.\d+\//, `/download/v${version}/`)
  .replace(/-\d+\.\d+\.\d+\.tgz$/, `-${version}.tgz`);

// All package.json: version + internal dep ranges.
for (const f of [
  'package.json',
  ...execSync('find packages -mindepth 2 -maxdepth 2 -name package.json', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n'),
  'apps/dev-app/package.json',
].filter(Boolean)) {
  edit(f, (raw) => {
    const p = JSON.parse(raw);
    if (p.version && p.version !== version) p.version = version;
    for (const dk of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      if (!p[dk]) continue;
      for (const k of Object.keys(p[dk])) if (isInternal(k)) p[dk][k] = bumpRange(p[dk][k]);
    }
    return JSON.stringify(p, null, 2) + '\n';
  });
}

// Prebuilt manifests.
for (const f of execSync('find packages -name manifest.json', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)) {
  edit(f, (raw) => {
    const p = JSON.parse(raw);
    if (p.engineVersion) p.engineVersion = version;
    return JSON.stringify(p, null, 2) + '\n';
  });
}

// Source-of-truth constants + banners.
edit('packages/rayact-prebuild/src/constants.ts', (s) => s.replace(/RAYACT_ENGINE_VERSION = '[^']*'/, `RAYACT_ENGINE_VERSION = '${version}'`));
edit('packages/create-rayact-app/src/create.ts', (s) => s.replace(/const RAYACT_VERSION = '[^']*'/, `const RAYACT_VERSION = '${version}'`));
edit('packages/rayact-renderer/src/reconciler.ts', (s) => s.replace(/rendererVersion: '[^']*'/, `rendererVersion: '${version}'`));
edit('packages/rayact-dev-client/src/DevLauncherUI.tsx', (s) => s.replace(/DEV_CLIENT_VERSION = '[^']*'/, `DEV_CLIENT_VERSION = '${version}'`));
edit('packages/rayact-dev-server/src/server.ts', (s) => s.replace(/Browser: 'Rayact\/[^']*'/, `Browser: 'Rayact/${version}'`));
edit('native/desktop/main.cpp', (s) => s.replace(/Version \d+\.\d+\.\d+/, `Version ${version}`));
edit('native/desktop/CMakeLists.txt', (s) => s.replace(/(project\(rayact_quickjs_desktop VERSION )\d+\.\d+\.\d+/, `$1${version}`));

if (check) {
  if (changes) { console.error(`\n${changes} file(s) disagree with ${version}.`); process.exit(1); }
  console.log(`All versions agree at ${version}.`);
} else {
  console.log(`Set ${changes} file(s) to ${version}.`);
}
