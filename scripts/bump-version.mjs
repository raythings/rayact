#!/usr/bin/env node
// Lockstep version bump: set every @rayact/* package, internal dep range, prebuilt
// manifest engineVersion, and the version constants/banners to <version> in one
// shot. Keeps the engine and JS packages in step (the moduleAbiVersion gate guards
// runtime compatibility separately).
//   node scripts/bump-version.mjs 0.0.2
//   node scripts/bump-version.mjs --check     # verify everything already agrees
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const arg = process.argv.slice(2).find((a) => !a.startsWith('-'));

const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const version = check ? current : arg;
if (!version) {
  console.error('usage: bump-version.mjs <version> | --check');
  process.exit(1);
}

let changes = 0;
const edit = (rel, fn) => {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) {
    changes++;
    if (!check) fs.writeFileSync(file, after);
    else console.error(`out of sync: ${rel}`);
  }
};

const isInternal = (k) => k.startsWith('@rayact/') || k === 'create-rayact-app' || k === 'rayact';
const bumpRange = (v) => v
  .replace(/^(\^|~)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, (_, pre) => (pre || '') + version)
  .replace(/#v\d+\.\d+\.\d+$/, `#v${version}`)
  .replace(/\/download\/v\d+\.\d+\.\d+\//, `/download/v${version}/`)
  .replace(/-\d+\.\d+\.\d+\.tgz$/, `-${version}.tgz`);

// All package.json: version + internal dep ranges.
for (const f of [
  'package.json',
  ...execSync('find packages -mindepth 2 -maxdepth 2 -name package.json', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n'),
  'apps/dev-app/package.json',
  'test-projects/release-consumer-smoke/package.json',
].filter(Boolean)) {
  edit(f, (raw) => {
    const p = JSON.parse(raw);
    if (p.version && p.version !== version) p.version = version;
    for (const dk of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      if (!p[dk]) continue;
      for (const k of Object.keys(p[dk])) if (isInternal(k)) p[dk][k] = bumpRange(p[dk][k]);
    }
    return JSON.stringify(p, null, 2) + '\n';
  });
}

// Prebuilt manifests.
for (const f of execSync('find packages -name manifest.json', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)) {
  edit(f, (raw) => {
    const p = JSON.parse(raw);
    if (p.engineVersion) p.engineVersion = version;
    return JSON.stringify(p, null, 2) + '\n';
  });
}

// Source-of-truth constants + banners.
edit('packages/rayact-prebuild/src/constants.ts', (s) => s.replace(/RAYACT_ENGINE_VERSION = '[^']*'/, `RAYACT_ENGINE_VERSION = '${version}'`));
edit('packages/create-rayact-app/src/create.ts', (s) => s.replace(/const RAYACT_VERSION = '[^']*'/, `const RAYACT_VERSION = '${version}'`));
edit('packages/rayact-renderer/src/reconciler.ts', (s) => s.replace(/rendererVersion: '[^']*'/, `rendererVersion: '${version}'`));
edit('packages/rayact-dev-client/src/DevLauncherUI.tsx', (s) => s.replace(/DEV_CLIENT_VERSION = '[^']*'/, `DEV_CLIENT_VERSION = '${version}'`));
edit('packages/rayact-dev-server/src/server.ts', (s) => s.replace(/Browser: 'Rayact\/[^']*'/, `Browser: 'Rayact/${version}'`));
edit('native/desktop/main.cpp', (s) => s.replace(/Version \d+\.\d+\.\d+/, `Version ${version}`));
edit('native/desktop/CMakeLists.txt', (s) => s.replace(/(project\(rayact_quickjs_desktop VERSION )\d+\.\d+\.\d+/, `$1${version}`));
// Root CMake project version feeds RAYACT_TOOL_VERSION (rayact_tool --version).
edit('CMakeLists.txt', (s) => s.replace(/(project\(rayact VERSION )\d+\.\d+\.\d+/, `$1${version}`));

// Native engine version header — compiled into every engine binary and shipped
// in the prebuilt packages as include/rayact_version.h.
edit('native/core/rayact_version.h', (s) =>
  s.replace(/(#define RAYACT_ENGINE_VERSION ")[^"]*(")/, `$1${version}$2`));
// …and the copies pack-android.sh mirrors into the prebuilt packages, which go
// stale for any ABI not rebuilt in a given release.
for (const header of execSync("find packages -path '*/include/rayact_version.h'", { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)) {
  edit(header, (s) => s.replace(/(#define RAYACT_ENGINE_VERSION ")[^"]*(")/, `$1${version}$2`));
}
// CDP handshake strings surfaced in Chrome DevTools.
edit('native/desktop/cdp_handler.cpp', (s) => s.replace(/Rayact\/\d+\.\d+\.\d+/g, `Rayact/${version}`));

// App shells: the version the dev app reports as BuildConfig.VERSION_NAME /
// CFBundleShortVersionString, which the dev launcher renders as "Version …".
edit('apps/android/app/build.gradle', (s) => s.replace(/versionName '\d+\.\d+\.\d+'/, `versionName '${version}'`));
for (const plist of ['apps/ios/Info.plist', 'apps/ios/Info-Release.plist']) {
  edit(plist, (s) => s.replace(
    /(<key>CFBundleShortVersionString<\/key>\s*(?:\n\s*)?<string>)\d+\.\d+\.\d+(<\/string>)/,
    `$1${version}$2`));
}
// Dev-client bridges report the engine version to the launcher UI.
for (const bridge of [
  'packages/template-android/app/src/main/java/com/rayact/devclient/DevClientBridge.kt',
  'apps/android/app/src/main/java/com/rayact/devclient/DevClientBridge.kt',
]) {
  edit(bridge, (s) => s
    .replace(/(BuildConfig\.VERSION_NAME \?: ")\d+\.\d+\.\d+(")/, `$1${version}$2`)
    .replace(/(\.put\("rayactVersion", ")\d+\.\d+\.\d+(")/, `$1${version}$2`));
}
for (const swift of ['packages/template-ios/DevClientBridge.swift', 'apps/ios/DevClientBridge.swift']) {
  edit(swift, (s) => s
    .replace(/(as\? String \?\? ")\d+\.\d+\.\d+(")/, `$1${version}$2`)
    .replace(/("rayactVersion": ")\d+\.\d+\.\d+(")/, `$1${version}$2`));
}

// Tooling defaults / help text that name a concrete release.
edit('packages/rayact-cli/src/commands/migrate.ts', (s) =>
  s.replace(/(pkg\.dependencies\[packageName\] = ')\d+\.\d+\.\d+(')/, `$1${version}$2`));
edit('test/cli/migrate.test.mjs', (s) => s.replace(/(\['@rayact\/(?:mmkv|secure-store)'\], ')\d+\.\d+\.\d+(')/g, `$1${version}$2`));
edit('packages/create-rayact-app/src/index.ts', (s) => s
  .replace(/\/download\/v\d+\.\d+\.\d+/g, `/download/v${version}`)
  .replace(/create-rayact-app-\d+\.\d+\.\d+\.tgz/g, `create-rayact-app-${version}.tgz`));
edit('scripts/serve-release-assets.mjs', (s) => s.replace(/v\d+\.\d+\.\d+/g, `v${version}`));
edit('packages/template-android/app/build.gradle', (s) => s.replace(/versionName '\d+\.\d+\.\d+'/, `versionName '${version}'`));
// apps/web is private (never published) but carries a version for parity.
edit('apps/web/package.json', (raw) => {
  const p = JSON.parse(raw);
  if (p.version) p.version = version;
  return JSON.stringify(p, null, 2) + '\n';
});
// User-facing error text naming the release to reinstall.
edit('packages/rayact-prebuild/src/prebuild.ts', (s) =>
  s.replace(/(Reinstall matching Rayact )\d+\.\d+\.\d+/, `$1${version}`));
// Canary builds in CI derive from the current release line.
edit('.github/workflows/release.yml', (s) =>
  s.replace(/(bump-version\.mjs ")\d+\.\d+\.\d+(-canary)/, `$1${version}$2`));

// Docs + READMEs: every occurrence of the previous release version is a pin
// (install commands, download URLs, tarball names) — rewrite them wholesale.
// docs/public/** is generated and refreshed by the docs build, so skip it.
const docFiles = [
  'README.md',
  'docs/package.json',
  ...execSync("find docs -name '*.md' -not -path 'docs/public/*' -not -path 'docs/node_modules/*' -not -path 'docs/.vitepress/*'", { cwd: ROOT, encoding: 'utf8' }).trim().split('\n'),
].filter(Boolean);
if (current !== version || check) {
  for (const f of docFiles) {
    edit(f, (s) => s.split(current).join(version));
  }
}

if (check) {
  if (changes) { console.error(`\n${changes} file(s) disagree with ${version}.`); process.exit(1); }
  console.log(`All versions agree at ${version}.`);
} else {
  console.log(`Set ${changes} file(s) to ${version}.`);
}
