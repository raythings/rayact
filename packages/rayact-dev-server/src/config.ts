import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RayactTransformConfig {
  minify?: { dev?: boolean; debug?: boolean; release?: boolean };
  bytecode?: { dev?: boolean; debug?: boolean; release?: boolean };
}

/**
 * Container (.rayactpack) packaging options applied to release/platform builds.
 * See rayact.config.schema.json for the authoritative field documentation.
 */
export interface RayactPackConfig {
  /** Extra (non-standard) file globs to opt into the pack, relative to root. */
  include?: string[];
  /** XOR-obfuscate pack entries with a key derived from rayactAppKey. */
  obfuscate?: boolean;
  /** Max bytes per pack chunk before splitting. Default 100 MB. */
  maxChunkSize?: number;
}

/**
 * A native plugin module bundled into the prebuilt Rayact dev app host.
 * `name` is the bus module id JS reaches via __rayact_invoke(name, ...);
 * `lib` is the dlopen library base name (librayact_<lib>.{so,dylib});
 * `jsPackage` is the npm wrapper that exposes the typed API.
 */
export interface RayactNativeModule {
  name: string;
  lib: string;
  jsPackage?: string;
}

export interface RayactConfig {
  /** Optional editor hint; ignored at runtime. */
  $schema?: string;
  rayactAppKey?: string;
  devServer?: {
    host?: string;
    port?: number;
    cdpPort?: number;
  };
  entry?: string;
  platform?: string;
  android?: {
    package?: string;
    /** Gradle project dir (contains gradlew). Relative to project root. */
    projectDir?: string;
    activity?: string;
    /** Display name patched into the host (prebuilt dev app). */
    appName?: string;
    /** Application id patched into the host (prebuilt dev app). */
    packageName?: string;
    /** Launcher icon source, relative to project root. */
    icon?: string;
  };
  ios?: {
    projectDir?: string;
    bundleId?: string;
  };
  /** Native plugin modules the host bundles / the project requires. */
  nativeModules?: RayactNativeModule[];
  transform?: RayactTransformConfig;
  pack?: RayactPackConfig;
}

/**
 * Per-build-mode transform defaults. A field omitted from rayact.config.json
 * inherits these, so configs only need to record genuine overrides — release
 * builds minify and emit bytecode unless a project explicitly opts out.
 */
export const TRANSFORM_DEFAULTS: Record<'dev' | 'debug' | 'release', boolean> = {
  dev: false,
  debug: false,
  release: true
};

const DEFAULT_CONFIG: RayactConfig = {
  rayactAppKey: 'rayact-app',
  devServer: { host: '0.0.0.0', port: 8081, cdpPort: 9229 },
  entry: 'apps/desktop/src/App.tsx',
  platform: 'desktop'
};

/** Absolute path to the published JSON Schema for rayact.config.json. */
export function rayactConfigSchemaPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/config.ts and dist/config.js both sit one level under the package root.
  return path.join(here, '..', 'schema', 'rayact.config.schema.json');
}

export function loadRayactConfig(root = process.cwd()): RayactConfig {
  const configPath = path.join(root, 'rayact.config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as RayactConfig;
    for (const issue of validateRayactConfig(raw)) {
      console.warn(`rayact.config.json: ${issue}`);
    }
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      devServer: { ...DEFAULT_CONFIG.devServer, ...raw.devServer },
      transform: raw.transform,
      pack: raw.pack
    };
  } catch (err) {
    console.warn(`rayact.config.json: failed to parse (${(err as Error).message}); using defaults`);
    return { ...DEFAULT_CONFIG };
  }
}

export function resolveTransformFlag(
  config: RayactConfig,
  kind: 'minify' | 'bytecode',
  mode: 'dev' | 'debug' | 'release',
  cliOverride?: boolean | null
): boolean {
  if (cliOverride !== undefined && cliOverride !== null) return cliOverride;
  return config.transform?.[kind]?.[mode] ?? TRANSFORM_DEFAULTS[mode];
}

// --- Schema validation -----------------------------------------------------

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: unknown[];
  required?: string[];
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
};

let cachedSchema: JsonSchema | null | undefined;

function loadSchema(): JsonSchema | null {
  if (cachedSchema !== undefined) return cachedSchema;
  try {
    cachedSchema = JSON.parse(fs.readFileSync(rayactConfigSchemaPath(), 'utf8')) as JsonSchema;
  } catch {
    cachedSchema = null;
  }
  return cachedSchema;
}

/**
 * Shallow validation against rayact.config.schema.json. Returns human-readable
 * issue strings (unknown keys, type mismatches) — never throws, so a slightly
 * malformed config still loads with defaults rather than breaking the build.
 */
export function validateRayactConfig(raw: unknown): string[] {
  const schema = loadSchema();
  if (!schema) return [];
  const issues: string[] = [];
  walk(raw, schema, schema, '', issues);
  return issues;
}

function resolveRef(ref: string, rootSchema: JsonSchema): JsonSchema | null {
  // Only local $defs refs are used by our schema, e.g. "#/$defs/modeFlags".
  const m = /^#\/\$defs\/(.+)$/.exec(ref);
  if (m && rootSchema.$defs && rootSchema.$defs[m[1]]) return rootSchema.$defs[m[1]];
  return null;
}

function typeName(v: unknown): string {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function typeMatches(expected: string, v: unknown): boolean {
  if (expected === 'integer') return typeof v === 'number' && Number.isInteger(v);
  if (expected === 'array') return Array.isArray(v);
  if (expected === 'object') return typeof v === 'object' && v !== null && !Array.isArray(v);
  return typeof v === expected;
}

function walk(value: unknown, schema: JsonSchema, root: JsonSchema, pathStr: string, issues: string[]): void {
  if (schema.$ref) {
    const target = resolveRef(schema.$ref, root);
    if (target) schema = target;
  }
  const where = pathStr || '(root)';

  if (schema.type && !typeMatches(schema.type, value)) {
    issues.push(`${where}: expected ${schema.type}, got ${typeName(value)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value as never)) {
    issues.push(`${where}: "${String(value)}" is not one of ${schema.enum.map(String).join(', ')}`);
  }
  if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!(req in obj)) issues.push(`${where}: missing required key "${req}"`);
    }
    for (const key of Object.keys(obj)) {
      const child = schema.properties?.[key];
      if (!child) {
        if (schema.additionalProperties === false) {
          issues.push(`${where ? where + '.' : ''}${key}: unknown key`);
        }
        continue;
      }
      walk(obj[key], child, root, pathStr ? `${pathStr}.${key}` : key, issues);
    }
  } else if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, i) => walk(item, schema.items as JsonSchema, root, `${pathStr}[${i}]`, issues));
  }
}
