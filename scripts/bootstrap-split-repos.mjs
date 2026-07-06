#!/usr/bin/env node
/**
 * Clone or update raythings/* split-repo mirrors in ../.subrepos3.
 *
 * Usage: node scripts/bootstrap-split-repos.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SPLIT_REPO_MAP, SPLIT_REPO_ORG } from './split-repo-map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBREPOS = path.resolve(ROOT, '..', '.subrepos3');
const DRY = process.argv.includes('--dry-run');

function run(cmd, args, opts = {}) {
  if (DRY) {
    console.log(`[dry-run] ${cmd} ${args.join(' ')}`);
    return { status: 0 };
  }
  return spawnSync(cmd, args, { stdio: 'inherit', ...opts });
}

function ghAvailable() {
  return spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status === 0;
}

fs.mkdirSync(SUBREPOS, { recursive: true });

if (!ghAvailable()) {
  console.error('gh CLI not authenticated — run `gh auth login` first.');
  process.exit(1);
}

const ready = [];
const missing = [];
const cloned = [];

for (const repoDir of Object.values(SPLIT_REPO_MAP)) {
  const dest = path.join(SUBREPOS, repoDir);
  const remote = `https://github.com/${SPLIT_REPO_ORG}/${repoDir}.git`;

  if (fs.existsSync(path.join(dest, '.git'))) {
    console.log(`\n==> pull ${repoDir}`);
    run('git', ['pull', '--ff-only'], { cwd: dest });
    ready.push(repoDir);
    continue;
  }

  const view = spawnSync('gh', ['repo', 'view', `${SPLIT_REPO_ORG}/${repoDir}`], { stdio: 'ignore' });
  if (view.status !== 0) {
    console.warn(`MISSING on GitHub: ${SPLIT_REPO_ORG}/${repoDir}`);
    missing.push(repoDir);
    continue;
  }

  console.log(`\n==> clone ${repoDir}`);
  const clone = run('gh', ['repo', 'clone', `${SPLIT_REPO_ORG}/${repoDir}`, dest]);
  if (clone.status === 0) {
    cloned.push(repoDir);
    ready.push(repoDir);
  } else {
    missing.push(repoDir);
  }
}

console.log('\n=== split-repo inventory ===');
console.log(`Mirror root: ${SUBREPOS}`);
console.log(`Ready (${ready.length}): ${ready.sort().join(', ') || '(none)'}`);
if (cloned.length) console.log(`Cloned (${cloned.length}): ${cloned.join(', ')}`);
if (missing.length) {
  console.log(`Missing (${missing.length}): ${missing.join(', ')}`);
  console.log('Create empty repos on GitHub or fix names, then re-run.');
  process.exit(1);
}

console.log('\nNext: node scripts/publish-split-repos.mjs');
