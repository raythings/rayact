export type {
  DevServerManifest,
  HostBridge,
  HostEventName,
  HostNode,
  HostNodeId,
  HostNodeType,
  RayactAsset,
  RayactAssetMetadata,
  RayactDevClient,
  RayactGlobal,
  RayactMutationOp,
  RayactRuntime,
  RayactRuntimeOptions
} from './types.js';

export {
  createAsset,
  installAssetAwareSpawnWorker,
  isRayactAsset,
  readAssetBytes,
  resolveAssetUrl,
  resolveWorkerSpecifier
} from './assets.js';
export { createBridge } from './bridge.js';
export { createDevClient, installConsoleForwarding } from './devClient.js';
export { loadFont, loadIcons, loadEmoji } from './fonts.js';
export type { FontSource, IconSetVariants } from './fonts.js';
export {
  installModuleHmrRuntime,
  ModuleHmrRuntime,
  normalizeModuleUrl,
  resolveModuleUrl,
  toRayactModuleUrl
} from './moduleHmr.js';
export type { DevManifestModule, ModuleHmrOptions } from './moduleHmr.js';
export { getClientCapabilities } from './capabilities.js';
export type { ClientCapabilityManifest, ClientModuleCapability } from './capabilities.js';
export { getReloadState, subscribeReloadState } from './reloadState.js';
export type { ReloadState } from './reloadState.js';
export { getDiagnostics, subscribeDiagnostics } from './diagnostics.js';
export type {
  AvailableDiagnosticMetricV1,
  DiagnosticMetricV1,
  DiagnosticsSnapshotV1,
  UnavailableDiagnosticMetricV1,
} from './diagnostics.js';

import { createBridge } from './bridge.js';
import { createDevClient, installConsoleForwarding } from './devClient.js';
import { installAssetAwareSpawnWorker } from './assets.js';
import type { RayactGlobal, RayactRuntime, RayactRuntimeOptions } from './types.js';

function getGlobal(options?: RayactRuntimeOptions): RayactGlobal {
  return options?.global ?? globalThis as RayactGlobal;
}

export function createRuntime(options: RayactRuntimeOptions = {}): RayactRuntime {
  const globalObject = getGlobal(options);
  const bridge = options.bridge ?? createBridge(globalObject);
  const serverUrl = typeof globalObject.__RAYACT_DEV_SERVER__ === 'string'
    ? globalObject.__RAYACT_DEV_SERVER__
    : undefined;
  const hasNativeDevtoolsTransport = (globalObject as RayactGlobal & { __rayactNativeDevtoolsTransport?: boolean })
    .__rayactNativeDevtoolsTransport === true;
  const shouldCreateDevClient = typeof serverUrl === 'string' && options.devClient !== false &&
    (!hasNativeDevtoolsTransport || options.devClient === true);
  const devClient = typeof options.devClient === 'object'
    ? options.devClient
    : shouldCreateDevClient
      ? createDevClient({
          serverUrl,
          bridge,
          global: globalObject,
          debuggerOnly: false
        })
      : undefined;

  if (devClient) {
    globalObject.console?.info?.(`[rayact] dev client enabled: ${serverUrl}`);
    installConsoleForwarding(devClient, globalObject);
    devClient.connect();
  }

  installAssetAwareSpawnWorker(globalObject);

  return {
    bridge,
    devClient,
    reportError(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      bridge.showError?.(message, stack);
      globalObject.__rayactRecordCrash?.(error, 'fatal-js');
      devClient?.send('client:error', { message, stack });
    }
  };
}

export function getDefaultRuntime(): RayactRuntime {
  const globalObject = globalThis as RayactGlobal & { __rayactRuntime?: RayactRuntime };
  if (!globalObject.__rayactRuntime) {
    globalObject.__rayactRuntime = createRuntime({ global: globalObject });
  }
  return globalObject.__rayactRuntime;
}

// Foundational shared types/utils (re-exported from ../shared)
export * from '@rayact/shared';
