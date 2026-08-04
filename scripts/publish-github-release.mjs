#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = process.env.RAYACT_RELEASE_VERSION || process.argv[2] ||
  JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const TAG = `v${VERSION}`;
const REPO = process.env.RAYACT_GITHUB_REPO || 'raythings/rayact';
const OUT = path.resolve(ROOT, process.env.RAYACT_RELEASE_DIR || 'release1');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
  }
}

function succeeds(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}

function output(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
  }
  return result.stdout.trim();
}

if (process.env.RAYACT_CONFIRM_PUBLISH_RELEASE !== TAG) {
  console.error(`Refusing to publish ${REPO} ${TAG}.`);
  console.error(`Set RAYACT_CONFIRM_PUBLISH_RELEASE=${TAG} after verifying ${OUT}.`);
  process.exit(2);
}

if (!fs.existsSync(OUT)) {
  console.error(`Release asset directory not found: ${OUT}`);
  process.exit(1);
}

if (output('git', ['-C', ROOT, 'status', '--porcelain', '--untracked-files=normal'])) {
  console.error('Refusing to publish from a dirty source tree.');
  process.exit(1);
}

run('node', ['scripts/verify-release-set.mjs', OUT, '--require-signature'], { cwd: ROOT });
run('node', ['scripts/verify-stable-gate.mjs', OUT], { cwd: ROOT });
run('shasum', ['-a', '256', '-c', path.join(OUT, 'SHA256SUMS')], { cwd: OUT });

if (succeeds('gh', ['release', 'view', TAG, '--repo', REPO])) {
  console.error(`${REPO} already has a ${TAG} release. Use release:replace only for an intentional replacement.`);
  process.exit(1);
}

const assets = fs.readdirSync(OUT)
  .filter(file => file !== 'RELEASE_NOTES.md')
  .filter(file => fs.statSync(path.join(OUT, file)).isFile())
  .sort()
  .map(file => path.join(OUT, file));
const notesFile = path.join(OUT, 'RELEASE_NOTES.md');
const notesArgs = fs.existsSync(notesFile)
  ? ['--notes-file', notesFile]
  : ['--notes', `Rayact ${TAG} release.`];
const target = process.env.RAYACT_RELEASE_TARGET || output('git', ['rev-parse', 'HEAD']);

run('gh', [
  'release',
  'create',
  TAG,
  ...assets,
  '--repo',
  REPO,
  '--target',
  target,
  '--title',
  `Rayact ${TAG}`,
  '--latest',
  ...notesArgs,
]);

console.log(`Published ${REPO} ${TAG} from locally built assets.`);
