import fs from 'node:fs';
import path from 'node:path';

export interface RayactTransformConfig {
  minify?: { dev?: boolean; debug?: boolean; release?: boolean };
  bytecode?: { dev?: boolean; debug?: boolean; release?: boolean };
}

/**
 * A native plugin module bundled into a prebuilt host (Expo-Go-style dev app).
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
}

const DEFAULT_CONFIG: RayactConfig = {
  rayactAppKey: 'rayact-app',
  devServer: { host: '0.0.0.0', port: 8081, cdpPort: 9229 },
  entry: 'apps/desktop/src/App.tsx',
  platform: 'desktop'
};

export function loadRayactConfig(root = process.cwd()): RayactConfig {
  const configPath = path.join(root, 'rayact.config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as RayactConfig;
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      devServer: { ...DEFAULT_CONFIG.devServer, ...raw.devServer },
      transform: raw.transform
    };
  } catch {
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
  const defaults = { dev: false, debug: false, release: true };
  return config.transform?.[kind]?.[mode] ?? defaults[mode];
}
