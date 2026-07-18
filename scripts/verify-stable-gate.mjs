#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = path.resolve(process.argv[2] ?? 'release1');
const release = JSON.parse(fs.readFileSync(path.join(directory, 'release-set.json'), 'utf8'));
const failures = [];
const requiredPlatforms = ['android', 'ios', 'macos', 'web'];
const missingPlatforms = requiredPlatforms.filter(platform => !release.supportedPlatforms?.includes(platform));
if (missingPlatforms.length) failures.push(`Tier-1 prebuilts missing: ${missingPlatforms.join(', ')}`);
const packageNames = new Set(release.packages.map(item => item.name));
for (const packageName of [
  '@rayact/prebuilt-android-arm64',
  '@rayact/prebuilt-android-x64',
  '@rayact/prebuilt-ios-arm64',
  '@rayact/prebuilt-darwin-arm64',
  '@rayact/prebuilt-web-wasm',
]) {
  if (!packageNames.has(packageName)) failures.push(`${packageName}: missing from release set`);
}
for (const filename of [
  'accessibility-results.json',
  'documentation-results.json',
  'platform-matrix.json',
  'reproducibility-results.json',
  'security-results.json',
  'upgrade-results.json',
]) {
  const file = path.join(directory, filename);
  if (!fs.existsSync(file)) { failures.push(`${filename}: missing`); continue; }
  const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (evidence.version !== release.version || evidence.passed !== true) failures.push(`${filename}: stale or failed`);
}
const performanceFile = path.join(directory, 'performance-results.json');
if (!fs.existsSync(performanceFile)) {
  failures.push('performance-results.json: missing');
} else {
  const performance = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), 'verify-performance-budgets.mjs'), performanceFile], { stdio: 'inherit' });
  if (performance.status !== 0) failures.push('performance-results.json: failed');
}
if (!fs.existsSync(path.join(directory, 'release-set.sig'))) failures.push('release-set.sig: missing');
if (release.packages.at(-1)?.name !== 'rayact') failures.push('root rayact package must be published last');
if (failures.length) {
  console.error(`Stable promotion blocked:\n${failures.map(item => `  - ${item}`).join('\n')}`);
  process.exit(1);
}
console.log(`Stable gate passed for ${release.version}.`);
