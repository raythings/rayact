#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageNames = ['rayact-mmkv', 'rayact-secure-store', 'rayact-crash-reporter'];

function digest(target) {
  const hash = crypto.createHash('sha256');
  const stat = fs.statSync(target);
  if (stat.isFile()) return hash.update(fs.readFileSync(target)).digest('hex');
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(target, absolute).split(path.sep).join('/');
      hash.update(`${entry.isDirectory() ? 'd' : 'f'}:${relative}\0`);
      if (entry.isDirectory()) visit(absolute);
      else hash.update(fs.readFileSync(absolute));
    }
  };
  visit(target);
  return hash.digest('hex');
}

function artifactCandidates(packageDir) {
  const roots = [
    ['android/arm64-v8a', 'android', 'arm64'],
    ['android/x86_64', 'android', 'x86_64'],
    ['darwin-arm64', 'darwin', 'arm64'],
    ['darwin-x64', 'darwin', 'x86_64'],
    ['ios', 'ios', 'universal'],
  ];
  const result = [];
  for (const [relativeRoot, platform, architecture] of roots) {
    const absoluteRoot = path.join(packageDir, relativeRoot);
    if (!fs.existsSync(absoluteRoot)) continue;
    for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isFile() && !entry.isDirectory()) continue;
      if (platform === 'ios' && !entry.name.endsWith('.xcframework')) continue;
      if (platform === 'android' && !entry.name.endsWith('.so')) continue;
      if (platform === 'darwin' && !entry.name.endsWith('.dylib')) continue;
      const relative = path.posix.join(relativeRoot, entry.name);
      result.push({ platform, architecture, path: relative, sha256: digest(path.join(packageDir, relative)) });
    }
  }
  return result.sort((a, b) => `${a.platform}:${a.architecture}:${a.path}`.localeCompare(`${b.platform}:${b.architecture}:${b.path}`));
}

for (const name of packageNames) {
  const packageDir = path.join(root, 'packages', name);
  const manifestPath = path.join(packageDir, 'rayact.module.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.artifacts = artifactCandidates(packageDir);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${manifest.package}: ${manifest.artifacts.length} verified artifact(s)`);
}
