import fs from 'node:fs';
import path from 'node:path';
import { loadRayactConfig } from '@rayact/dev-server';
import { runPrebuild } from '@rayact/prebuild';

const IMPORT_MIGRATIONS: Record<string, string> = {
  'rayact/mmkv': '@rayact/mmkv',
  'rayact/secure-store': '@rayact/secure-store',
  'rayact/navigation': '@rayact/navigation',
  'rayact/worklets': '@rayact/worklets',
  'rayact/dev-client': '@rayact/dev-client',
  'rayact/dev-server': '@rayact/dev-server',
  'rayact/prebuild': '@rayact/prebuild',
};

function sourceFiles(root: string): string[] {
  const output: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:[cm]?[jt]sx?|json)$/.test(entry.name) && entry.name !== 'package-lock.json') output.push(file);
    }
  };
  visit(root);
  return output;
}

function migrateImports(root: string): Set<string> {
  const required = new Set<string>();
  for (const file of sourceFiles(root)) {
    if (path.basename(file) === 'rayact.config.json' || path.basename(file) === 'package.json') continue;
    let contents = fs.readFileSync(file, 'utf8');
    const original = contents;
    for (const [legacy, canonical] of Object.entries(IMPORT_MIGRATIONS)) {
      if (contents.includes(legacy)) {
        contents = contents.split(legacy).join(canonical);
        required.add(canonical);
      }
    }
    if (contents !== original) fs.writeFileSync(file, contents);
  }
  return required;
}

function migrateConfig(root: string, required: Set<string>): void {
  const file = path.join(root, 'rayact.config.json');
  if (!fs.existsSync(file)) return;
  const config = JSON.parse(fs.readFileSync(file, 'utf8')) as { nativeModules?: unknown[] };
  if (!Array.isArray(config.nativeModules)) return;
  const migrated: unknown[] = [];
  for (const entry of config.nativeModules) {
    if (typeof entry === 'string' || (entry && typeof entry === 'object' && 'package' in entry)) {
      migrated.push(entry);
      if (typeof entry === 'string') required.add(entry);
      continue;
    }
    if (!entry || typeof entry !== 'object' || !('name' in entry)) continue;
    const legacy = entry as { name: string; jsPackage?: string; configuration?: Record<string, unknown> };
    if (legacy.name === 'kv') continue;
    const packageName = legacy.jsPackage === 'rayact/mmkv' ? '@rayact/mmkv'
      : legacy.jsPackage === 'rayact/secure-store' ? '@rayact/secure-store'
      : legacy.jsPackage?.startsWith('@') ? legacy.jsPackage
      : `@rayact/${legacy.name}`;
    required.add(packageName);
    migrated.push(legacy.configuration ? { package: packageName, configuration: legacy.configuration } : packageName);
  }
  config.nativeModules = migrated;
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

function migratePackageJson(root: string, required: Set<string>): void {
  const file = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { dependencies?: Record<string, string> };
  pkg.dependencies ??= {};
  for (const packageName of required) pkg.dependencies[packageName] = '0.0.3';
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

export async function runMigrate(): Promise<void> {
  const root = process.cwd();
  const required = migrateImports(root);
  migrateConfig(root, required);
  migratePackageJson(root, required);
  const config = loadRayactConfig(root);
  if (fs.existsSync(path.join(root, config.android?.projectDir ?? 'android')) ||
      fs.existsSync(path.join(root, config.ios?.projectDir ?? 'ios'))) {
    await runPrebuild({
      projectRoot: root,
      appName: config.name,
      configNativeModules: config.nativeModules,
      android: config.android,
      ios: config.ios,
      force: true,
    });
  }
  console.log(`Rayact migration complete. Run npm install, then review the regenerated native projects.`);
}
