#!/usr/bin/env node
/**
 * Sync monorepo packages into .subrepos3 mirrors and force-push v0.0.1 tags.
 *
 * Usage: node scripts/publish-split-repos.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SPLIT_REPO_MAP } from './split-repo-map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBREPOS = path.resolve(ROOT, '..', '.subrepos3');
const DRY = process.argv.includes('--dry-run');
const TAG = `v${process.env.RAYACT_RELEASE_VERSION || '0.0.1'}`;

function run(cmd, args, opts = {}) {
  if (DRY) {
    console.log(`[dry-run] ${cmd} ${args.join(' ')}`);
    return { status: 0, stdout: '' };
  }
  return spawnSync(cmd, args, { encoding: 'utf8', stdio: opts.capture ? 'pipe' : 'inherit', ...opts });
}

function rsync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  run('rsync', [
    '-a', '--delete',
    '--exclude', 'node_modules',
    '--exclude', '.git',
    `${src}/`,
    `${dest}/`
  ]);
}

if (!fs.existsSync(SUBREPOS)) {
  console.error(`Missing ${SUBREPOS} — run: node scripts/bootstrap-split-repos.mjs`);
  process.exit(1);
}

for (const [pkgDir, repoDir] of Object.entries(SPLIT_REPO_MAP)) {
  const src = path.join(ROOT, 'packages', pkgDir);
  const dest = path.join(SUBREPOS, repoDir);
  if (!fs.existsSync(src)) {
    console.warn(`skip missing package ${pkgDir}`);
    continue;
  }
  if (!fs.existsSync(path.join(dest, '.git'))) {
    console.warn(`skip ${repoDir}: not a git repo (bootstrap first)`);
    continue;
  }

  console.log(`\n==> ${repoDir}`);
  rsync(src, dest);

  if (fs.existsSync(path.join(dest, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
    if (pkg.scripts?.build) {
      run('npm', ['run', 'build'], { cwd: dest, capture: false });
    }
  }

  run('git', ['add', '-A'], { cwd: dest });
  const diff = run('git', ['diff', '--cached', '--quiet'], { cwd: dest, capture: true });
  if (diff.status !== 0) {
    run('git', ['commit', '-m', `chore: sync ${TAG} from rayact monorepo`], { cwd: dest });
  } else {
    console.log('  no changes to commit');
  }
  run('git', ['tag', '-f', TAG], { cwd: dest });
  run('git', ['push', 'origin', 'main'], { cwd: dest });
  run('git', ['push', '-f', 'origin', TAG], { cwd: dest });
}

console.log('\nSplit repos published.');
