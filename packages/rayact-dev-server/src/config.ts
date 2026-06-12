import fs from 'node:fs';
import path from 'node:path';

export interface RayactTransformConfig {
  minify?: { dev?: boolean; debug?: boolean; release?: boolean };
  bytecode?: { dev?: boolean; debug?: boolean; release?: boolean };
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
  };
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
