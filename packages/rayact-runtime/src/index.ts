export type {
  DevServerManifest,
  HostBridge,
  HostEventName,
  HostNode,
  HostNodeId,
  HostNodeType,
  RayactDevClient,
  RayactGlobal,
  RayactRuntime,
  RayactRuntimeOptions
} from './types';

export { createBridge } from './bridge';
export { createDevClient, installConsoleForwarding } from './devClient';

import { createBridge } from './bridge';
import { createDevClient, installConsoleForwarding } from './devClient';
import type { RayactGlobal, RayactRuntime, RayactRuntimeOptions } from './types';

function getGlobal(options?: RayactRuntimeOptions): RayactGlobal {
  return options?.global ?? globalThis as RayactGlobal;
}

export function createRuntime(options: RayactRuntimeOptions = {}): RayactRuntime {
  const globalObject = getGlobal(options);
  const bridge = options.bridge ?? createBridge(globalObject);
  const serverUrl = typeof globalObject.__RAYACT_DEV_SERVER__ === 'string'
    ? globalObject.__RAYACT_DEV_SERVER__
    : undefined;
  const isNativeHost = typeof globalObject.createView === 'function';
  const shouldCreateDevClient = typeof serverUrl === 'string' &&
    (options.devClient === true || (options.devClient !== false && !isNativeHost));
  const devClient = typeof options.devClient === 'object'
    ? options.devClient
    : shouldCreateDevClient
      ? createDevClient({ serverUrl, bridge, global: globalObject })
      : undefined;

  if (devClient) {
    globalObject.console?.info?.(`[rayact] dev client enabled: ${serverUrl}`);
    installConsoleForwarding(devClient, globalObject);
    devClient.connect();
  }

  return {
    bridge,
    devClient,
    reportError(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      bridge.showError?.(message, stack);
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
