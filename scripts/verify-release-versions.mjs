#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function json(relative) {
  return JSON.parse(read(relative));
}

function checkVersionedJson(relative, key = 'version') {
  const value = json(relative)[key];
  check(value === VERSION, `${relative}: ${key} is ${String(value)}, expected ${VERSION}`);
}

for (const entry of fs.readdirSync(path.join(ROOT, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const packageJson = path.join('packages', entry.name, 'package.json');
  if (fs.existsSync(path.join(ROOT, packageJson))) checkVersionedJson(packageJson);
  const manifest = path.join('packages', entry.name, 'manifest.json');
  if (fs.existsSync(path.join(ROOT, manifest))) checkVersionedJson(manifest, 'engineVersion');
}

checkVersionedJson('apps/dev-app/package.json');
checkVersionedJson('apps/web/package.json');
checkVersionedJson('apps/dev-app/capabilities.json', 'engineVersion');

for (const [relative, pattern] of [
  ['native/core/rayact_version.h', new RegExp(`RAYACT_ENGINE_VERSION "${VERSION.replaceAll('.', '\\.')}"`)],
  ['native/desktop/main.cpp', new RegExp(`Version ${VERSION.replaceAll('.', '\\.')}`)],
  ['apps/android/app/build.gradle', new RegExp(`versionName '${VERSION.replaceAll('.', '\\.')}'`)],
  ['apps/ios/Info-Release.plist', new RegExp(`<string>${VERSION.replaceAll('.', '\\.')}<\\/string>`)],
  ['packages/rayact-renderer/src/reconciler.ts', new RegExp(`rendererVersion: '${VERSION.replaceAll('.', '\\.')}'`)],
  ['packages/rayact-dev-client/src/DevLauncherUI.tsx', new RegExp(`DEV_CLIENT_VERSION = '${VERSION.replaceAll('.', '\\.')}'`)],
]) {
  check(pattern.test(read(relative)), `${relative}: embedded version is not ${VERSION}`);
}

const androidBundle = 'apps/android/app/src/main/assets/app.js';
check(read(androidBundle).includes(`rendererVersion: "${VERSION}"`),
  `${androidBundle}: stale renderer version`);
check(read(androidBundle).includes(`DEV_CLIENT_VERSION = "${VERSION}"`),
  `${androidBundle}: stale dev-client version`);

for (const relative of [
  'packages/prebuilt-darwin-arm64/bin/rayact_desktop',
  'packages/prebuilt-linux-x64/bin/rayact_desktop',
  'packages/prebuilt-windows-x64/bin/rayact_desktop.exe',
]) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) {
    failures.push(`${relative}: missing`);
    continue;
  }
  const result = spawnSync('strings', [absolute], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  check(result.status === 0 && result.stdout.includes(`Version ${VERSION}`),
    `${relative}: binary does not report Version ${VERSION}`);
}

const windowsZip = path.join(ROOT, 'apps/dev-app/dist/rayact-dev-app-windows-x64.zip');
if (!fs.existsSync(windowsZip)) {
  failures.push('apps/dev-app/dist/rayact-dev-app-windows-x64.zip: missing');
} else {
  const app = spawnSync('unzip', ['-p', windowsZip, 'rayact-dev-app-windows-x64/app.js'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  check(app.status === 0 && app.stdout.includes(`rendererVersion: "${VERSION}"`),
    'Windows dev-app archive: stale renderer version');
  check(app.status === 0 && app.stdout.includes(`DEV_CLIENT_VERSION = "${VERSION}"`),
    'Windows dev-app archive: stale dev-client version');

  const host = spawnSync('unzip', ['-p', windowsZip, 'rayact-dev-app-windows-x64/rayact_desktop.exe'], {
    maxBuffer: 128 * 1024 * 1024,
  });
  const stagedHost = path.join(ROOT, 'packages/prebuilt-windows-x64/bin/rayact_desktop.exe');
  check(host.status === 0 && fs.existsSync(stagedHost) && host.stdout.equals(fs.readFileSync(stagedHost)),
    'Windows dev-app archive: host differs from the Windows prebuilt');
}

if (failures.length) {
  console.error(`Release version verification failed:\n${failures.map(item => `  - ${item}`).join('\n')}`);
  process.exit(1);
}

console.log(`All prebuilt manifests, binaries, and dev apps report ${VERSION}.`);
