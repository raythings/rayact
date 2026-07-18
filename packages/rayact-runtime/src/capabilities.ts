import type { RayactGlobal } from './types.js';

export interface ClientModuleCapability {
  name: string;
  package?: string;
  version?: string;
  abiVersion?: number;
}

export interface ClientCapabilityManifest {
  schemaVersion: 1;
  engineVersion: string;
  engineAbiVersion: number;
  platform: string;
  architecture: string;
  modules: ClientModuleCapability[];
  features: Record<string, boolean>;
}

type CapabilityGlobal = RayactGlobal & {
  __RAYACT_CLIENT_CAPABILITIES__?: ClientCapabilityManifest | string;
  __RAYACT_ENGINE_VERSION__?: string;
  __RAYACT_ENGINE_ABI_VERSION__?: number;
  __rayactArchitecture?: string;
};

export function getClientCapabilities(
  source: CapabilityGlobal = globalThis as CapabilityGlobal,
): ClientCapabilityManifest {
  const injected = source.__RAYACT_CLIENT_CAPABILITIES__;
  if (injected) {
    try {
      const parsed = typeof injected === 'string' ? JSON.parse(injected) : injected;
      if (parsed?.schemaVersion === 1 && Array.isArray(parsed.modules)) return parsed;
    } catch {
      // Fall through to a conservative manifest when host metadata is corrupt.
    }
  }
  return {
    schemaVersion: 1,
    engineVersion: source.__RAYACT_ENGINE_VERSION__ ?? 'unknown',
    engineAbiVersion: source.__RAYACT_ENGINE_ABI_VERSION__ ?? 1,
    platform: source.__rayactPlatform?.target ?? source.__rayactPlatform?.os ?? 'unknown',
    architecture: source.__rayactArchitecture ?? 'unknown',
    modules: [],
    features: {},
  };
}
