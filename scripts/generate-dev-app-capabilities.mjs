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
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const abiHeader = fs.readFileSync(path.join(root, 'native/core/rayact_module_abi.h'), 'utf8');
const moduleAbiVersion = Number(abiHeader.match(/^#define RAYACT_MODULE_ABI_VERSION (\d+)u?$/m)?.[1] ?? 0);
const previousCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const smokeTests = {
  'barcode-scanner': 'barcode-scanner-wrapper',
  clipboard: 'clipboard-wrapper',
  'crash-reporter': 'crash-reporter-local',
  haptics: 'haptics-wrapper',
  'image-picker': 'image-picker-wrapper',
  linking: 'linking-wrapper',
  mmkv: 'mmkv-roundtrip',
  'secure-store': 'secure-store-roundtrip',
  sensors: 'sensors-availability',
  svg: 'svg-node-roundtrip',
  webview: 'webview-node-registration'
};
const integrated = previousCatalog.modules
  .filter(module => module.integratedInEngine)
  .map(module => ({
    ...module,
    platforms: [...new Set([...(module.platforms ?? []), 'windows'])],
    architectures: [...new Set((module.architectures ?? []).map(arch => arch === 'x64' ? 'x86_64' : arch))],
    abiRange: `>=1 <${moduleAbiVersion + 1}`
  }));
const packageModules = fs.readdirSync(path.join(root, 'packages'))
  .map(directory => ({ directory, manifest: path.join(root, 'packages', directory, 'rayact.module.json') }))
  .filter(entry => fs.existsSync(entry.manifest))
  .map(entry => ({ entry, module: JSON.parse(fs.readFileSync(entry.manifest, 'utf8')) }))
  .filter(({ module }) => module.officialDevApp)
  .map(({ module }) => ({
    name: module.name,
    lib: module.library ?? '',
    jsPackage: module.package,
    pluginPackage: module.package,
    platforms: module.platforms,
    architectures: module.architectures,
    abiRange: module.abiRange,
    officialDevApp: true,
    iosIntegratedInEngine: false,
    ...(module.permissions?.length ? { permissions: module.permissions } : {}),
    smokeTest: smokeTests[module.name] ?? `${module.name}-wrapper`
  }));
const catalog = {
  schemaVersion: 1,
  engineVersion: packageVersion,
  modules: [...integrated, ...packageModules].sort((a, b) => a.name.localeCompare(b.name))
};
const modules = catalog.modules.filter(module => module.officialDevApp);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.nativeModules = modules
  .filter(module => module.pluginPackage)
  .map(module => module.pluginPackage);

const capabilities = {
  schemaVersion: 1,
  engineVersion: catalog.engineVersion,
  moduleAbiVersion,
  mode: 'dev-app',
  platforms: ['android', 'ios', 'darwin', 'windows'],
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

const outputs = [
  [catalogPath, canonical(catalog)],
  [configPath, canonical(config)],
  ...capabilityPaths.map(file => [file, canonical(capabilities)])
];
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
