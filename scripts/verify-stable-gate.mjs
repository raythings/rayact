#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve(process.argv[2] ?? 'release1');
const release = JSON.parse(fs.readFileSync(path.join(directory, 'release-set.json'), 'utf8'));
const failures = [];
const requiredPlatforms = ['android', 'ios', 'macos', 'windows', 'web'];
const missingPlatforms = requiredPlatforms.filter(platform => !release.supportedPlatforms?.includes(platform));
if (missingPlatforms.length) failures.push(`Tier-1 prebuilts missing: ${missingPlatforms.join(', ')}`);
const packageNames = new Set(release.packages.map(item => item.name));
for (const packageName of [
  '@rayact/prebuilt-android-arm64',
  '@rayact/prebuilt-ios-arm64',
  '@rayact/prebuilt-darwin-arm64',
  '@rayact/prebuilt-windows-x64',
  '@rayact/prebuilt-web-wasm',
]) {
  if (!packageNames.has(packageName)) failures.push(`${packageName}: missing from release set`);
}
for (const filename of [
  'rayact-dev-app.apk',
  'rayact-dev-app-simulator.zip',
  'rayact-dev-app-windows-x64.zip',
  `rayact-web-${release.version}.tar.gz`,
]) {
  if (!fs.existsSync(path.join(directory, filename))) failures.push(`${filename}: missing`);
}
if (!fs.existsSync(path.join(directory, 'release-set.sig'))) failures.push('release-set.sig: missing');
if (release.packages.at(-1)?.name !== 'rayact') failures.push('root rayact package must be published last');
if (failures.length) {
  console.error(`Stable promotion blocked:\n${failures.map(item => `  - ${item}`).join('\n')}`);
  process.exit(1);
}
console.log(`Stable gate passed for ${release.version}.`);
