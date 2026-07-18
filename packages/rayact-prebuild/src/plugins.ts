import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { RAYACT_ENGINE_VERSION, RAYACT_MODULE_ABI_VERSION } from './constants.js';
import type {
  LegacyRayactNativeModuleConfig,
  RayactModuleArtifact,
  RayactModuleManifest,
  RayactNativeModuleEntry,
  RayactNativeModuleSelection,
  ResolvedPlugin,
} from './types.js';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  rayact?: { manifest?: string; name?: string; lib?: string };
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function findPackageJson(entry: string, expectedName: string): string | null {
  let current = path.dirname(entry);
  for (;;) {
    const candidate = path.join(current, 'package.json');
    const pkg = readJson<PackageJson>(candidate);
    if (pkg?.name === expectedName) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveDependencyPackageJson(ownerDir: string, packageName: string): string | null {
  const require = createRequire(path.join(ownerDir, 'package.json'));
  try {
    return require.resolve(`${packageName}/package.json`);
  } catch {
    try {
      return findPackageJson(require.resolve(packageName), packageName);
    } catch {
      return null;
    }
  }
}

function validateManifest(manifest: RayactModuleManifest, pkgName: string, file: string): void {
  const invalid = (message: string): never => {
    throw new Error(`Invalid Rayact module manifest ${file}: ${message}`);
  };
  if (manifest.schemaVersion !== 1) invalid(`unsupported schemaVersion ${String(manifest.schemaVersion)}`);
  if (!manifest.name || !manifest.library || !manifest.jsEntry) invalid('name, library, and jsEntry are required');
  if (manifest.package !== pkgName) invalid(`package must be ${pkgName}`);
  if (!Array.isArray(manifest.platforms) || !Array.isArray(manifest.architectures)) invalid('platforms and architectures must be arrays');
  if (!Array.isArray(manifest.artifacts)) invalid('artifacts must be an array');
  for (const artifact of manifest.artifacts) {
    if (path.isAbsolute(artifact.path) || artifact.path.split(/[\\/]/).includes('..')) {
      invalid(`artifact path escapes the package: ${artifact.path}`);
    }
    if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) invalid(`invalid SHA-256 for ${artifact.path}`);
    if (!manifest.platforms.includes(artifact.platform)) invalid(`artifact platform is not declared: ${artifact.platform}`);
    if (artifact.architecture !== 'universal' && !manifest.architectures.includes(artifact.architecture)) {
      invalid(`artifact architecture is not declared: ${artifact.architecture}`);
    }
  }
}

function compareVersions(left: string, right: string): number {
  const normalize = (value: string) => value.split('-', 1)[0].split('.').map(part => Number.parseInt(part, 10) || 0);
  const a = normalize(left);
  const b = normalize(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function satisfiesRange(value: string, range: string): boolean {
  const comparators = range.trim().split(/\s+/).filter(Boolean);
  if (!comparators.length || range === '*') return true;
  return comparators.every(comparator => {
    const match = comparator.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})$/);
    if (!match) return false;
    const comparison = compareVersions(value, match[2]);
    switch (match[1] ?? '=') {
      case '>=': return comparison >= 0;
      case '<=': return comparison <= 0;
      case '>': return comparison > 0;
      case '<': return comparison < 0;
      default: return comparison === 0;
    }
  });
}

export function assertModuleCompatibility(manifest: RayactModuleManifest, packageName = manifest.package): void {
  if (!satisfiesRange(String(RAYACT_MODULE_ABI_VERSION), manifest.abiRange)) {
    throw new Error(
      `Rayact module ABI mismatch for ${packageName}: host ABI ${RAYACT_MODULE_ABI_VERSION} is outside ${manifest.abiRange}. ` +
      'Install a module release compatible with this Rayact client and regenerate native projects.'
    );
  }
  if (!satisfiesRange(RAYACT_ENGINE_VERSION, manifest.engineRange)) {
    throw new Error(
      `Rayact engine mismatch for ${packageName}: host ${RAYACT_ENGINE_VERSION} is outside ${manifest.engineRange}. ` +
      'Upgrade the module and Rayact together, then run `rayact migrate` and prebuild again.'
    );
  }
}

function moduleFromPackageJson(pkgFile: string): ResolvedPlugin | null {
  const pkgDir = path.dirname(pkgFile);
  const pkg = readJson<PackageJson>(pkgFile);
  if (!pkg?.name || !pkg.rayact?.manifest) return null;
  const manifestPath = path.resolve(pkgDir, pkg.rayact.manifest);
  if (!manifestPath.startsWith(`${pkgDir}${path.sep}`)) {
    throw new Error(`Invalid Rayact manifest path in ${pkgFile}: path escapes package`);
  }
  const manifest = readJson<RayactModuleManifest>(manifestPath);
  if (!manifest) throw new Error(`Unable to read Rayact module manifest: ${manifestPath}`);
  validateManifest(manifest, pkg.name, manifestPath);
  assertModuleCompatibility(manifest, pkg.name);
  return {
    name: manifest.name,
    lib: manifest.library,
    jsPackage: pkg.name,
    packageDir: pkgDir,
    manifestPath,
    manifest,
  };
}

/**
 * Resolve only package manifests reachable from declared dependencies. This is
 * intentionally a dependency-graph walk: it never enumerates node_modules or
 * monorepo package directories.
 */
export function resolveRayactPlugins(projectRoot: string): ResolvedPlugin[] {
  const rootFile = path.join(projectRoot, 'package.json');
  const root = readJson<PackageJson>(rootFile);
  if (!root) return [];
  const queue = Object.keys({ ...root.dependencies, ...root.optionalDependencies })
    .map(name => ({ name, ownerDir: projectRoot }));
  const visited = new Set<string>();
  const byName = new Map<string, ResolvedPlugin>();

  while (queue.length) {
    const { name: dependency, ownerDir } = queue.shift() as { name: string; ownerDir: string };
    const packageFile = resolveDependencyPackageJson(ownerDir, dependency);
    if (!packageFile) continue;
    if (visited.has(packageFile)) continue;
    visited.add(packageFile);
    const pkg = readJson<PackageJson>(packageFile);
    if (!pkg) continue;
    const plugin = moduleFromPackageJson(packageFile);
    if (plugin) {
      const existing = byName.get(plugin.name);
      if (existing && existing.jsPackage !== plugin.jsPackage) {
        throw new Error(`Duplicate Rayact native module name "${plugin.name}" from ${existing.jsPackage} and ${plugin.jsPackage}`);
      }
      byName.set(plugin.name, plugin);
    }
    queue.push(...Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })
      .map(name => ({ name, ownerDir: path.dirname(packageFile) })));
  }
  return [...byName.values()].sort((a, b) => a.jsPackage.localeCompare(b.jsPackage));
}

function normalizedEntry(plugin: ResolvedPlugin, configuration?: Record<string, unknown>): RayactNativeModuleEntry {
  if (configuration) validateModuleConfiguration(plugin, configuration);
  return {
    name: plugin.name,
    lib: plugin.lib,
    jsPackage: plugin.jsPackage,
    platforms: plugin.manifest.platforms,
    architectures: plugin.manifest.architectures,
    abiRange: plugin.manifest.abiRange,
    engineRange: plugin.manifest.engineRange,
    permissions: plugin.manifest.permissions,
    configuration,
    officialDevApp: plugin.manifest.officialDevApp,
  };
}

function validateModuleConfiguration(plugin: ResolvedPlugin, configuration: Record<string, unknown>): void {
  const schema = plugin.manifest.configurationSchema as {
    type?: string;
    required?: string[];
    additionalProperties?: boolean;
    properties?: Record<string, {
      type?: string;
      enum?: unknown[];
      format?: string;
      minimum?: number;
      maximum?: number;
    }>;
  };
  const invalid = (message: string): never => {
    throw new Error(`Invalid configuration for ${plugin.jsPackage}: ${message}`);
  };
  if (schema.type && schema.type !== 'object') invalid('configurationSchema must describe an object');
  for (const required of schema.required ?? []) {
    if (!(required in configuration)) invalid(`missing required property "${required}"`);
  }
  for (const [key, value] of Object.entries(configuration)) {
    const property = schema.properties?.[key];
    if (!property) {
      if (schema.additionalProperties === false) invalid(`unknown property "${key}"`);
      continue;
    }
    if (property.enum && !property.enum.some(candidate => Object.is(candidate, value))) {
      invalid(`property "${key}" must be one of ${property.enum.map(String).join(', ')}`);
    }
    if (property.type === 'string' && typeof value !== 'string') invalid(`property "${key}" must be a string`);
    if (property.type === 'boolean' && typeof value !== 'boolean') invalid(`property "${key}" must be a boolean`);
    if (property.type === 'integer' && (!Number.isInteger(value) || typeof value !== 'number')) {
      invalid(`property "${key}" must be an integer`);
    }
    if (typeof value === 'number' && property.minimum !== undefined && value < property.minimum) {
      invalid(`property "${key}" must be at least ${property.minimum}`);
    }
    if (typeof value === 'number' && property.maximum !== undefined && value > property.maximum) {
      invalid(`property "${key}" must be at most ${property.maximum}`);
    }
    if (property.format === 'uri' && typeof value === 'string') {
      try { new URL(value); } catch { invalid(`property "${key}" must be a URI`); }
    }
  }
}

function isLegacy(entry: RayactNativeModuleSelection): entry is LegacyRayactNativeModuleConfig {
  return typeof entry === 'object' && entry !== null && 'name' in entry;
}

export function mergeNativeModules(
  configModules: RayactNativeModuleSelection[] | undefined,
  plugins: ResolvedPlugin[],
  warn: (message: string) => void = console.warn,
): RayactNativeModuleEntry[] {
  const byPackage = new Map(plugins.map(plugin => [plugin.jsPackage, plugin]));
  const byName = new Map(plugins.map(plugin => [plugin.name, normalizedEntry(plugin)]));

  for (const selection of configModules ?? []) {
    if (isLegacy(selection)) {
      warn(`rayact.config.json: legacy nativeModules entry "${selection.name}" is deprecated; run \`rayact migrate\`.`);
      const pkg = selection.jsPackage ? byPackage.get(selection.jsPackage) : plugins.find(item => item.name === selection.name);
      byName.set(selection.name, {
        ...(pkg ? normalizedEntry(pkg) : { name: selection.name, lib: selection.lib ?? '', jsPackage: selection.jsPackage ?? '' }),
        ...selection,
        lib: selection.lib ?? pkg?.lib ?? '',
        jsPackage: selection.jsPackage ?? pkg?.jsPackage ?? '',
      });
      continue;
    }
    const packageName = typeof selection === 'string' ? selection : selection.package;
    const plugin = byPackage.get(packageName);
    if (!plugin) throw new Error(`Rayact native module ${packageName} is configured but is not an installed dependency.`);
    if (typeof selection !== 'string' && selection.enabled === false) {
      byName.delete(plugin.name);
    } else {
      byName.set(plugin.name, normalizedEntry(plugin, typeof selection === 'string' ? undefined : selection.configuration));
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function selectedPlugins(entries: RayactNativeModuleEntry[], plugins: ResolvedPlugin[]): ResolvedPlugin[] {
  const selected = new Set(entries.map(entry => entry.jsPackage));
  return plugins.filter(plugin => selected.has(plugin.jsPackage));
}

export function verifyModuleArtifact(plugin: ResolvedPlugin, artifact: RayactModuleArtifact): string {
  const file = path.resolve(plugin.packageDir, artifact.path);
  if (!file.startsWith(`${plugin.packageDir}${path.sep}`) || !fs.existsSync(file)) {
    throw new Error(`Missing ${plugin.jsPackage} native artifact: ${artifact.path}`);
  }
  const hash = crypto.createHash('sha256');
  if (fs.statSync(file).isDirectory()) {
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const child = path.join(directory, entry.name);
        const relative = path.relative(file, child).split(path.sep).join('/');
        hash.update(`${entry.isDirectory() ? 'd' : 'f'}:${relative}\0`);
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile()) hash.update(fs.readFileSync(child));
      }
    };
    visit(file);
  } else {
    hash.update(fs.readFileSync(file));
  }
  const actual = hash.digest('hex');
  if (actual !== artifact.sha256) {
    throw new Error(`Checksum mismatch for ${plugin.jsPackage}/${artifact.path}: expected ${artifact.sha256}, got ${actual}`);
  }
  return file;
}

export function readPluginManifest(plugin: ResolvedPlugin): RayactModuleManifest {
  return plugin.manifest;
}
