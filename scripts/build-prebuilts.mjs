#!/usr/bin/env node
/**
 * Maintainer-only: build @rayact/prebuilt-* packages and dev-app binaries.
 *
 *   node scripts/build-prebuilts.mjs --target android
 *   node scripts/build-prebuilts.mjs --target linux
 *   node scripts/build-prebuilts.mjs --target darwin --target ios --target dev-app  # macOS only
 *   node scripts/build-prebuilts.mjs --target all
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function resolveSuperRoot() {
  const parent = path.resolve(ROOT, '..');
  if (fs.existsSync(path.join(parent, 'quickjs')) && fs.existsSync(path.join(parent, 'raylib'))) {
    return parent;
  }
  return ROOT;
}

const SUPER = resolveSuperRoot();
const IS_MAC = process.platform === 'darwin';

const DOCKER_TARGETS = new Set(['android', 'linux']);
const MAC_TARGETS = new Set(['darwin', 'ios', 'dev-app']);

function parseArgs(argv) {
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) {
      targets.push(argv[i + 1]);
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(`
Usage: node scripts/build-prebuilts.mjs [--target <name>]...

Targets:
  android   Docker — @rayact/prebuilt-android-arm64 + plugin .so
  linux     Docker — @rayact/prebuilt-linux-x64
  darwin    macOS  — prebuilt-darwin-arm64/x64
  ios       macOS  — prebuilt-ios-arm64 (XCFramework stub or build)
  dev-app   macOS  — rayact-dev-app APK + unsigned IPA + simulator zip
  all       All targets (skips mac-only on non-macOS)

Maintainer-only. App developers consume npm prebuilts + GitHub Releases.
`.trim());
      process.exit(0);
    }
  }
  if (targets.length === 0) targets.push('all');
  if (targets.includes('all')) {
    return ['android', 'linux', 'darwin', 'ios', 'dev-app'];
  }
  return targets;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with ${r.status}`);
  }
}

function hasDocker() {
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return r.status === 0;
}

function buildAndroidNative() {
  console.log('\n==> Native Android build (host Gradle)...');
  run('bash', [path.join(ROOT, 'docker/prebuilts/build-android.sh')], {
    env: { ...process.env, RAYACT_ROOT: ROOT }
  });
}

function buildDocker(target) {
  if (!hasDocker()) {
    if (target === 'android' && process.platform === 'darwin') {
      console.warn('Docker not available; falling back to host Gradle for android.');
      buildAndroidNative();
      return;
    }
    throw new Error(`Docker required for --target ${target}. Install Docker or run on CI.`);
  }
  const tag = `rayact-prebuilt-${target}`;
  const dockerDir = path.join(ROOT, 'docker/prebuilts');
  const dockerfile = path.join(dockerDir, `Dockerfile.${target}`);
  console.log(`\n==> Docker build: ${tag}`);
  run('docker', ['build', '-f', dockerfile, '-t', tag, dockerDir]);
  console.log(`\n==> Docker run: ${tag} (mount ${SUPER} -> /workspace)`);
  run('docker', [
    'run', '--rm',
    '-v', `${SUPER}:/workspace`,
    '-e', `RAYACT_ROOT=/workspace/rayact`,
    tag
  ]);
}

function buildMacos(targets) {
  const script = path.join(ROOT, 'scripts/build-prebuilts-macos.sh');
  const args = [script];
  for (const t of targets) {
    if (MAC_TARGETS.has(t)) args.push(`--${t}`);
  }
  if (args.length === 1) return;
  run('bash', args);
}

const targets = parseArgs(process.argv.slice(2));
const docker = targets.filter(t => DOCKER_TARGETS.has(t));
const mac = targets.filter(t => MAC_TARGETS.has(t));

for (const t of docker) {
  buildDocker(t);
}

if (mac.length > 0) {
  if (!IS_MAC) {
    console.warn(`\nSkipping macOS-only targets (${mac.join(', ')}): not on darwin.`);
    console.warn('Run on macOS or wait for macos-14 CI artifacts.');
  } else {
    buildMacos(mac);
  }
}

console.log('\n==> Done. Run ./scripts/verify-prebuilts.sh to validate outputs.');
