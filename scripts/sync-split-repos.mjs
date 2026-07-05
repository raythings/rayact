#!/usr/bin/env node
/**
 * Copy publishable packages from the monorepo into .publish-rayact split-repo
 * mirror and print git commands to tag v0.0.1 on each raythings/rayact-* repo.
 *
 * Usage:
 *   node scripts/sync-split-repos.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPER = path.resolve(ROOT, '..');
const MIRROR = path.join(SUPER, '.publish-rayact');
const DRY = process.argv.includes('--dry-run');
const VERSION = process.env.RAYACT_RELEASE_VERSION || '0.0.1';
const TAG = `v${VERSION}`;

const PKG_NAMES = fs.readdirSync(path.join(ROOT, 'packages'))
  .filter((name) => fs.existsSync(path.join(ROOT, 'packages', name, 'package.json')));

function run(cmd, args, opts = {}) {
  if (DRY) {
    console.log(`[dry-run] ${cmd} ${args.join(' ')}`);
    return { status: 0 };
  }
  return spawnSync(cmd, args, { stdio: 'inherit', ...opts });
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  run('cp', ['-R', src, dest]);
}

if (!fs.existsSync(MIRROR)) {
  console.error(`Mirror not found: ${MIRROR}`);
  console.error('Clone or create .publish-rayact next to rayact/ first.');
  process.exit(1);
}

console.log(`Syncing packages to ${MIRROR} ...`);
for (const name of PKG_NAMES) {
  const src = path.join(ROOT, 'packages', name);
  const dest = path.join(MIRROR, 'packages', name);
  copyDir(src, dest);
  console.log(`  synced packages/${name}`);
}

const createAppSrc = path.join(ROOT, 'packages', 'create-rayact-app');
copyDir(createAppSrc, path.join(MIRROR, 'packages', 'create-rayact-app'));
console.log('  synced packages/create-rayact-app');

for (const doc of ['docs/maintainer-prebuilts.md', 'docs/guide/install.md', 'README.md']) {
  const src = path.join(ROOT, doc);
  if (fs.existsSync(src)) {
    const dest = path.join(MIRROR, doc);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

console.log('\nNext steps (per split repo on GitHub):');
for (const name of PKG_NAMES) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', name, 'package.json'), 'utf8'));
  if (pkg.private) continue;
  const repo = pkg.name.replace('@rayact/', 'rayact-');
  console.log(`  cd .publish-rayact/packages/${name} && git tag -f ${TAG} && git push -f origin ${TAG}  # raythings/${repo}`);
}
console.log(`  cd .publish-rayact/packages/create-rayact-app && git tag -f ${TAG} && git push -f origin ${TAG}`);
console.log(`\nMain release: upload ${path.join(ROOT, 'release1')}/* to raythings/rayact ${TAG}`);
