#!/usr/bin/env node
/**
 * Replace a GitHub Release tag with the locally staged release assets.
 *
 * This intentionally requires RAYACT_CONFIRM_REPLACE_RELEASE=v<version> because
 * it deletes the existing release and tag before recreating them.
 */
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
const confirm = process.env.RAYACT_CONFIRM_REPLACE_RELEASE;

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with ${result.status}`);
  }
}

function optional(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  return result.status === 0;
}

function output(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with ${result.status}`);
  }
  return result.stdout.trim();
}

if (confirm !== TAG) {
  console.error(`Refusing to replace ${REPO} ${TAG}.`);
  console.error(`Re-run with RAYACT_CONFIRM_REPLACE_RELEASE=${TAG} after verifying ${OUT}.`);
  process.exit(2);
}

if (!fs.existsSync(OUT)) {
  console.error(`Release asset directory not found: ${OUT}`);
  process.exit(1);
}

const assets = fs.readdirSync(OUT)
  .filter((file) => file !== 'RELEASE_NOTES.md')
  .filter((file) => fs.statSync(path.join(OUT, file)).isFile())
  .sort();

if (!assets.includes('SHA256SUMS')) {
  console.error(`Missing SHA256SUMS in ${OUT}. Run npm run pack:release first.`);
  process.exit(1);
}
if (!assets.includes(`rayact-${VERSION}.tgz`)) {
  console.error(`Missing rayact-${VERSION}.tgz in ${OUT}. Run npm run pack:release first.`);
  process.exit(1);
}

const assetPaths = assets.map((file) => path.join(OUT, file));
const notesFile = path.join(OUT, 'RELEASE_NOTES.md');
const notesArgs = fs.existsSync(notesFile)
  ? ['--notes-file', notesFile]
  : ['--notes', `Rayact ${TAG} full-feature npm/prebuilt release.`];
const target = process.env.RAYACT_RELEASE_TARGET || output('git', ['rev-parse', 'HEAD']);

console.log(`Deleting existing ${REPO} release/tag ${TAG} if present...`);
optional('gh', ['release', 'delete', TAG, '--repo', REPO, '--yes', '--cleanup-tag']);

console.log(`Creating ${REPO} release ${TAG} at ${target} with ${assetPaths.length} asset(s)...`);
run('gh', [
  'release',
  'create',
  TAG,
  ...assetPaths,
  '--repo',
  REPO,
  '--target',
  target,
  '--title',
  `Rayact ${TAG}`,
  '--latest',
  ...notesArgs
]);

console.log(`Replaced ${REPO} ${TAG}.`);
