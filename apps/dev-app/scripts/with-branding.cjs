#!/usr/bin/env node
/*
 * Runs the rayact CLI with the prebuilt dev-app's branding injected into the
 * dev-client bundle. Bundled modules are resolved canonically from installed
 * package manifests + rayact.config.json by @rayact/dev-server.
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

function resolveCli() {
  // The dev app is part of this workspace. Prefer its freshly built CLI over a
  // hoisted/global `rayact` package, which can otherwise silently bundle an
  // older launcher implementation into the native hosts.
  const workspaceCli = path.resolve(appRoot, '../../packages/rayact-cli/dist/cli.js');
  if (fs.existsSync(workspaceCli)) return workspaceCli;
  const compatibilityCli = path.resolve(appRoot, '../../dist/cli/cli.js');
  if (fs.existsSync(compatibilityCli)) return compatibilityCli;
  try {
    const rayactPackageJson = createRequire(path.join(appRoot, 'package.json')).resolve('rayact/package.json');
    return path.join(path.dirname(rayactPackageJson), 'bin/rayact.js');
  } catch {
    return compatibilityCli;
  }
}

const env = {
  ...process.env,
  RAYACT_DEV_CLIENT_OFFICIAL_APP_METADATA_JSON: JSON.stringify(official)
};

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [resolveCli(), ...args], {
  cwd: appRoot,
  env,
  stdio: 'inherit'
});
process.exit(result.status ?? 1);
