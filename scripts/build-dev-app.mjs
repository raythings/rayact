#!/usr/bin/env node
// Build the Rayact Dev App: APK + unsigned device IPA + simulator .app zip.
// Node port of the former scripts/build-dev-app.sh — toolchains (gradle,
// xcodebuild, zip) are still spawned, but there is no bash wrapper, so the
// dev-app's npm scripts stay cross-platform and shell-free.
//
// Usage: node scripts/build-dev-app.mjs [--apk] [--ios-simulator]
//                                        [--ios-device-unsigned] [--ios-all] [--all]
// No flags => build everything.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const DEV_APP = path.join(ROOT, 'apps/dev-app');
const DIST = path.join(DEV_APP, 'dist');
const ANDROID_DIR = path.join(ROOT, 'apps/android');
const IOS_DIR = path.join(ROOT, 'apps/ios');

const args = process.argv.slice(2);
let doApk = args.includes('--apk') || args.includes('--all');
let doSim = args.includes('--ios-simulator') || args.includes('--ios-all') || args.includes('--all');
let doDevice = args.includes('--ios-device-unsigned') || args.includes('--ios-all') || args.includes('--all');
if (args.length === 0) { doApk = doSim = doDevice = true; }

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`ERROR: ${cmd} ${cmdArgs.join(' ')} failed (${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function engineVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/rayact-cli/package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

fs.mkdirSync(DIST, { recursive: true });

console.log('==> Bundling dev-client + staging rayact-assets...');
const branding = path.join(DEV_APP, 'scripts/with-branding.cjs');
run('node', [branding, 'build', '--android', '--debug', '--out', 'dist'], { cwd: DEV_APP });
run('node', [branding, 'build', '--ios', '--debug', '--out', 'dist'], { cwd: DEV_APP });

if (doApk) {
  console.log('==> Building dev-app APK...');
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  run(gradlew, [':app:assembleDebug', '-PrayactWasm=true', '--no-daemon'], {
    cwd: ANDROID_DIR,
    shell: process.platform === 'win32'
  });
  const apkSrc = path.join(ANDROID_DIR, 'app/build/outputs/apk/debug/app-debug.apk');
  if (!fs.existsSync(apkSrc)) { console.error(`ERROR: APK not found at ${apkSrc}`); process.exit(1); }
  fs.copyFileSync(apkSrc, path.join(DIST, 'rayact-dev-app.apk'));
  console.log(`  -> ${path.join(DIST, 'rayact-dev-app.apk')}`);
}

if ((doSim || doDevice)) {
  if (os.platform() !== 'darwin') {
    console.error('Skipping iOS builds: requires macOS');
  } else {
    if (spawnSync('xcodegen', ['--version'], { stdio: 'ignore' }).status !== 0) {
      console.error('ERROR: xcodegen required (brew install xcodegen)');
      process.exit(1);
    }
    run('xcodegen', ['generate'], { cwd: IOS_DIR });

    if (doSim) {
      console.log('==> Building iOS Simulator .app...');
      const derived = path.join(IOS_DIR, '.xcode-derived/sim');
      fs.rmSync(derived, { recursive: true, force: true });
      run('xcodebuild', [
        '-scheme', 'RayactIOS', '-configuration', 'Debug',
        '-destination', 'generic/platform=iOS Simulator',
        '-derivedDataPath', derived, 'build'
      ], { cwd: IOS_DIR });
      const app = findApp(derived);
      if (!app) { console.error(`ERROR: Rayact.app not found in ${derived}`); process.exit(1); }
      const zip = path.join(DIST, 'rayact-dev-app-simulator.zip');
      fs.rmSync(zip, { force: true });
      run('zip', ['-qr', zip, path.basename(app)], { cwd: path.dirname(app) });
      fs.rmSync(path.join(DIST, 'Rayact.app'), { recursive: true, force: true });
      run('cp', ['-R', app, path.join(DIST, 'Rayact.app')]);
      console.log(`  -> ${zip}`);
    }

    if (doDevice) {
      console.log('==> Building unsigned device IPA...');
      const archive = path.join(IOS_DIR, 'build/RayactIOS.xcarchive');
      fs.rmSync(archive, { recursive: true, force: true });
      run('xcodebuild', [
        '-scheme', 'RayactIOS', '-configuration', 'Release',
        '-destination', 'generic/platform=iOS',
        '-archivePath', archive, 'archive',
        'CODE_SIGN_IDENTITY=-', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGNING_ALLOWED=NO'
      ], { cwd: IOS_DIR });
      const app = path.join(archive, 'Products/Applications/Rayact.app');
      if (!fs.existsSync(app)) { console.error('ERROR: archived Rayact.app not found'); process.exit(1); }
      const payload = path.join(IOS_DIR, 'build/Payload');
      const ipa = path.join(DIST, 'rayact-dev-app-device-unsigned.ipa');
      fs.rmSync(payload, { recursive: true, force: true });
      fs.rmSync(ipa, { force: true });
      fs.mkdirSync(payload, { recursive: true });
      run('cp', ['-R', app, payload + '/']);
      run('zip', ['-qr', ipa, 'Payload'], { cwd: path.join(IOS_DIR, 'build') });
      fs.rmSync(payload, { recursive: true, force: true });
      console.log(`  -> ${ipa}  (re-sign before device install)`);
    }
  }
}

// Manifest: lets the dev client / resolver match the dev-app to an engine.
fs.writeFileSync(
  path.join(DIST, 'manifest.json'),
  JSON.stringify({ app: 'rayact-dev-app', engineVersion: engineVersion(), builtAt: new Date().toISOString() }, null, 2)
);

// Checksums over the shipped artifacts.
writeChecksums();
console.log(`==> Dev-app artifacts in ${DIST}`);

function findApp(dir) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'Rayact.app') return p;
        stack.push(p);
      }
    }
  }
  return null;
}

function writeChecksums() {
  const files = fs.readdirSync(DIST).filter((f) => f.startsWith('rayact-dev-app') || f === 'manifest.json');
  const r = spawnSync('shasum', ['-a', '256', ...files], { cwd: DIST, encoding: 'utf8' });
  if (r.status === 0) fs.writeFileSync(path.join(DIST, 'SHA256SUMS'), r.stdout);
}
