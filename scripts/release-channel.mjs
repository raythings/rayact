#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [channel, directoryArg = 'release1'] = process.argv.slice(2);
if (!['canary', 'preview', 'stable', 'rollback'].includes(channel)) throw new Error('Usage: release-channel.mjs canary|preview|stable|rollback [release-dir]');
const directory = path.resolve(directoryArg);
const release = JSON.parse(fs.readFileSync(path.join(directory, 'release-set.json'), 'utf8'));
const run = (args) => {
  const result = spawnSync('npm', args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
if (channel === 'preview' || channel === 'canary') {
  for (const item of release.packages) run(['publish', path.join(directory, item.tarball), '--provenance', '--access', 'public', '--tag', channel]);
} else {
  const tags = channel === 'stable' ? ['stable', 'latest'] : ['stable', 'latest'];
  for (const item of release.packages) for (const tag of tags) run(['dist-tag', 'add', `${item.name}@${item.version}`, tag]);
}
