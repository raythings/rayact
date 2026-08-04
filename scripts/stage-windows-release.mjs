#!/usr/bin/env node
/**
 * Stage the Windows x64 engine prebuilt and portable dev-app release asset.
 * Native compilation is intentionally separate; this script consumes the
 * cross-build outputs and package-owned module artifacts, then creates the
 * exact layouts published by the release workflow.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = path.join(ROOT, 'packages/prebuilt-windows-x64');
const BUILD = path.join(ROOT, 'build-windows-x64');
const DEV_APP = path.join(ROOT, 'apps/dev-app');
const DIST = path.join(DEV_APP, 'dist');
const STAGE = path.join(DIST, 'rayact-dev-app-windows-x64');
const args = new Set(process.argv.slice(2));
const doPrebuilt = args.size === 0 || args.has('--prebuilt') || args.has('--all');
const doDevApp = args.size === 0 || args.has('--dev-app') || args.has('--all');

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed (${result.status})`);
}

function copyTree(source, destination) {
  if (!fs.existsSync(source)) return;
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) copyTree(path.join(source, entry), path.join(destination, entry));
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function requireFile(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing Windows release input: ${path.relative(ROOT, file)}`);
  return file;
}

function moduleAbiVersion() {
  const header = fs.readFileSync(path.join(ROOT, 'native/core/rayact_module_abi.h'), 'utf8');
  return Number(header.match(/^#define RAYACT_MODULE_ABI_VERSION (\d+)u?$/m)?.[1] ?? 0);
}

function builtAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000).toISOString();
  return new Date().toISOString();
}

function stageFonts(destination) {
  copyTree(path.join(ROOT, 'resources/fonts'), path.join(destination, 'resources/fonts'));
  // Windows draws most emoji through DirectWrite/D2D (Segoe UI Emoji). Full
  // ~10.7 MB NotoColorEmoji.ttf is unused — same prune as Android/iOS.
  // Keep NotoColorEmoji-Flags.ttf: Segoe has no ISO country-flag glyphs.
  const fontsDir = path.join(destination, 'resources/fonts');
  const emoji = path.join(fontsDir, 'NotoColorEmoji.ttf');
  if (fs.existsSync(emoji)) fs.rmSync(emoji, { force: true });
  // Body text uses Segoe UI from the OS — never ship Roboto.
  fs.rmSync(path.join(fontsDir, 'Roboto'), { recursive: true, force: true });
  if (fs.existsSync(fontsDir)) {
    for (const name of fs.readdirSync(fontsDir)) {
      if (/^Roboto/i.test(name)) fs.rmSync(path.join(fontsDir, name), { recursive: true, force: true });
    }
  }
  for (const candidate of [
    path.join(ROOT, 'packages/rayact-shared/dist/material_icons.js'),
    path.join(ROOT, 'packages/rayact-shared/dist/material_icons.jsc')
  ]) {
    if (fs.existsSync(candidate)) copyTree(candidate, path.join(destination, 'resources/fonts', path.basename(candidate)));
  }
}

if (doPrebuilt) {
  const bin = path.join(PACKAGE, 'bin');
  fs.rmSync(bin, { recursive: true, force: true });
  fs.mkdirSync(bin, { recursive: true });
  copyTree(requireFile(path.join(BUILD, 'bin/rayact_desktop.exe')), path.join(bin, 'rayact_desktop.exe'));
  copyTree(requireFile(path.join(BUILD, 'bin/rayact_tool.exe')), path.join(bin, 'rayact_tool.exe'));
  const releaseHost = path.join(ROOT, 'build-windows-x64-release/bin/rayact_desktop.exe');
  if (fs.existsSync(releaseHost)) copyTree(releaseHost, path.join(bin, 'rayact_release.exe'));
  stageFonts(PACKAGE);
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(PACKAGE, 'manifest.json'), `${JSON.stringify({
    engineVersion: version,
    moduleAbiVersion: moduleAbiVersion(),
    platform: 'windows',
    arch: 'x86_64',
    builtAt: builtAt()
  }, null, 2)}\n`);
  console.log('Staged @rayact/prebuilt-windows-x64.');
}

if (doDevApp) {
  requireFile(path.join(PACKAGE, 'bin/rayact_desktop.exe'));
  run('node', [path.join(ROOT, 'scripts/generate-dev-app-capabilities.mjs')], { cwd: ROOT });
  const bundleOut = path.join(DEV_APP, 'dist-windows-bundle');
  fs.rmSync(bundleOut, { recursive: true, force: true });
  run('node', [
    path.join(DEV_APP, 'scripts/with-branding.cjs'), 'build',
    '--platform', 'desktop', '--mode', 'dev-client', '--debug', '--no-bytecode', '--out', bundleOut
  ], { cwd: DEV_APP });

  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(path.join(STAGE, 'modules'), { recursive: true });
  copyTree(path.join(PACKAGE, 'bin/rayact_desktop.exe'), path.join(STAGE, 'rayact_desktop.exe'));
  copyTree(path.join(PACKAGE, 'bin/rayact_tool.exe'), path.join(STAGE, 'rayact_tool.exe'));
  const bundle = fs.existsSync(path.join(bundleOut, 'dev-client.js'))
    ? path.join(bundleOut, 'dev-client.js')
    : path.join(bundleOut, 'bundle.js');
  copyTree(requireFile(bundle), path.join(STAGE, 'app.js'));
  stageFonts(STAGE);

  const config = JSON.parse(fs.readFileSync(path.join(DEV_APP, 'rayact.config.json'), 'utf8'));
  for (const packageName of config.nativeModules ?? []) {
    const packageDir = path.join(ROOT, 'packages', packageName.replace('@rayact/', 'rayact-'));
    const manifestPath = path.join(packageDir, 'rayact.module.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const artifacts = (manifest.artifacts ?? []).filter(item =>
      item.platform === 'windows' && item.architecture === 'x86_64');
    for (const artifact of artifacts) {
      const source = requireFile(path.join(packageDir, artifact.path));
      const actual = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
      if (actual !== artifact.sha256) throw new Error(`${packageName}: stale hash for ${artifact.path}`);
      copyTree(path.dirname(source), path.join(STAGE, 'modules'));
      break;
    }
  }

  copyTree(path.join(DEV_APP, 'capabilities.json'), path.join(STAGE, 'capabilities.json'));
  const archive = path.join(DIST, 'rayact-dev-app-windows-x64.zip');
  fs.rmSync(archive, { force: true });
  run('zip', ['-qr', archive, path.basename(STAGE)], { cwd: DIST });
  console.log(`Staged ${path.relative(ROOT, archive)}.`);
}
