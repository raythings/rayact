#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'packages/first-party-modules.json');
const configPath = path.join(root, 'apps/dev-app/rayact.config.json');
const capabilityPaths = [
  path.join(root, 'apps/dev-app/capabilities.json'),
  path.join(root, 'apps/dev-app/rayact-assets/runtime/client-capabilities.json')
];
const check = process.argv.includes('--check');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const modules = catalog.modules.filter(module => module.officialDevApp);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.nativeModules = modules
  .filter(module => module.pluginPackage)
  .map(module => module.pluginPackage);

const capabilities = {
  schemaVersion: 1,
  engineVersion: catalog.engineVersion,
  moduleAbiVersion: 1,
  mode: 'dev-app',
  platforms: ['android', 'ios', 'darwin'],
  diagnostics: ['frame-time', 'fps', 'memory', 'module-list'],
  modules: modules.map(module => ({
    name: module.name,
    lib: module.lib,
    jsPackage: module.jsPackage,
    platforms: module.platforms,
    architectures: module.architectures,
    abiRange: module.abiRange,
    permissions: module.permissions ?? [],
    smokeTest: module.smokeTest
  }))
};

function canonical(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

const outputs = [[configPath, canonical(config)], ...capabilityPaths.map(file => [file, canonical(capabilities)])];
const stale = outputs.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content);
if (check && stale.length) {
  console.error(`Generated dev-app capability files are stale:\n${stale.map(([file]) => `  ${path.relative(root, file)}`).join('\n')}`);
  process.exit(1);
}
if (!check) {
  for (const [file, content] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  console.log(`Generated dev-app capability manifest for ${modules.length} first-party modules.`);
}
