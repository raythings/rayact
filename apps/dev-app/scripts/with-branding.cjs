#!/usr/bin/env node
/*
 * Runs the rayact CLI with the prebuilt dev-app's branding + bundled-module list
 * injected into the dev-client bundle. Reads official-app.json (branding) and
 * rayact.config.json `nativeModules` (the plugins this host bundles), exports
 * them as the env vars the dev-server bundler inlines via defines
 * (__RAYACT_OFFICIAL_APP__ / __RAYACT_BUNDLED_MODULES__), then execs:
 *
 *   node scripts/with-branding.cjs build --android
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { createRequire } = require('module');

const appRoot = path.resolve(__dirname, '..');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(appRoot, file), 'utf8'));
  } catch {
    return fallback;
  }
}

const official = readJson('official-app.json', {});
const config = readJson('rayact.config.json', {});
const nativeModules = Array.isArray(config.nativeModules) ? config.nativeModules : [];

function resolveCli() {
  try {
    return createRequire(path.join(appRoot, 'package.json')).resolve('@rayact/cli/dist/cli.js');
  } catch {
    return path.resolve(appRoot, '../../packages/rayact-cli/dist/cli.js');
  }
}

const env = {
  ...process.env,
  RAYACT_DEV_CLIENT_OFFICIAL_APP_METADATA_JSON: JSON.stringify(official),
  RAYACT_DEV_CLIENT_BUNDLED_MODULES_JSON: JSON.stringify(nativeModules)
};

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [resolveCli(), ...args], {
  cwd: appRoot,
  env,
  stdio: 'inherit'
});
process.exit(result.status ?? 1);
