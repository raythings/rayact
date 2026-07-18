#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDirs = [
  ...fs.readdirSync(path.join(root, 'packages')).map(name => path.join(root, 'packages', name)),
  path.join(root, 'apps/dev-app'),
].filter(directory => {
  const file = path.join(directory, 'package.json');
  return fs.existsSync(file) && !JSON.parse(fs.readFileSync(file, 'utf8')).private;
});
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const outputs = [fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-pack-a-')), fs.mkdtempSync(path.join(os.tmpdir(), 'rayact-pack-b-'))];
try {
  for (const output of outputs) for (const directory of packageDirs) {
    const result = spawnSync('npm', ['pack', '--ignore-scripts', '--pack-destination', output], { cwd: directory, stdio: 'ignore' });
    if (result.status !== 0) throw new Error(`npm pack failed for ${path.basename(directory)}`);
  }
  const files = fs.readdirSync(outputs[0]).sort();
  if (JSON.stringify(files) !== JSON.stringify(fs.readdirSync(outputs[1]).sort())) throw new Error('Packed file sets differ');
  for (const file of files) if (hash(path.join(outputs[0], file)) !== hash(path.join(outputs[1], file))) throw new Error(`${file}: build-twice hash mismatch`);
  console.log(`Reproducibility passed for ${files.length} package tarballs.`);
} finally {
  for (const output of outputs) fs.rmSync(output, { recursive: true, force: true });
}
