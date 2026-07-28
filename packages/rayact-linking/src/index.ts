export type URLEvent = { url: string };
export type URLListener = (event: URLEvent) => void;

type LinkingHost = typeof globalThis & {
  platformCall?: (
    module: string,
    method: string,
    payload: unknown,
    callback: (result: { ok: boolean; value?: unknown; error?: string }) => void,
  ) => void;
  __rayactLinkingInitialURL?: string | null;
  __rayactPendingURLs?: string[];
  __rayactOnURL?: (url: string) => void;
  __rayactLinkingOpenURL?: (url: string) => boolean | Promise<boolean>;
  __rayactLinkingCanOpenURL?: (url: string) => boolean | Promise<boolean>;
  devCall?: (
    method: string,
    data: unknown,
    callback: (result: unknown) => void
  ) => void;
  open?: (url?: string | URL, target?: string, features?: string) => unknown;
};

const listeners = new Set<URLListener>();
const host = globalThis as LinkingHost;
const pending = Array.isArray(host.__rayactPendingURLs)
  ? host.__rayactPendingURLs.splice(0)
  : [];

function assertURL(value: string): URL {
  try {
    return new URL(value);
  } catch {
    const error = new TypeError(`Invalid URL: ${value}`);
    error.name = 'RayactLinkingInvalidURLError';
    throw error;
  }
}

function devCall(method: string, data: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!host.devCall) {
      reject(new Error('Linking operation is unavailable on this platform'));
      return;
    }
    host.devCall(method, data, resolve);
  });
}

function platformCall<T>(method: string, data: unknown): Promise<T> {
  if (!host.platformCall) return Promise.reject(new Error('Linking native bridge is unavailable'));
  let result: { ok: boolean; value?: unknown; error?: string } | undefined;
  host.platformCall('linking', method, data, value => { result = value; });
  if (!result) return Promise.reject(new Error(`Linking operation did not complete: ${method}`));
  return result.ok
    ? Promise.resolve(result.value as T)
    : Promise.reject(new Error(result.error || `Linking operation failed: ${method}`));
}

export async function openURL(url: string): Promise<void> {
  assertURL(url);
  if (host.platformCall) {
    await platformCall<boolean>('openURL', { url });
    return;
  }
  if (host.__rayactLinkingOpenURL) {
    const opened = await host.__rayactLinkingOpenURL(url);
    if (opened === false) throw new Error(`No application can open URL: ${url}`);
    return;
  }
  if (host.devCall) {
    const result = await devCall('openExternalUrl', { url });
    if (result === false) throw new Error(`No application can open URL: ${url}`);
    return;
  }
  if (host.open) {
    const result = host.open(url, '_blank', 'noopener,noreferrer');
    if (result === null) throw new Error(`Opening URL was blocked: ${url}`);
    return;
  }
  throw new Error('Linking.openURL is unavailable on this platform');
}

export async function canOpenURL(url: string): Promise<boolean> {
  const parsed = assertURL(url);
  if (host.platformCall) return platformCall<boolean>('canOpenURL', { url });
  if (host.__rayactLinkingCanOpenURL) return host.__rayactLinkingCanOpenURL(url);
  if (host.devCall) return true;
  return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) && typeof host.open === 'function';
}

export async function getInitialURL(): Promise<string | null> {
  const direct = host.__rayactLinkingInitialURL ?? pending[0] ?? null;
  if (direct) return direct;
  if (host.devCall) {
    const value = await devCall('getInitialURL', {});
    return typeof value === 'string' && value ? value : null;
  }
  return null;
}

let polling: ReturnType<typeof setInterval> | null = null;
function updatePolling(): void {
  if (!host.devCall || listeners.size === 0) {
    if (polling) clearInterval(polling);
    polling = null;
    return;
  }
  if (polling) return;
  polling = setInterval(() => {
    void devCall('pollLinkingURL', {}).then(value => {
      if (typeof value === 'string' && value) {
        for (const listener of listeners) listener({ url: value });
      }
    }).catch(() => {});
  }, 250);
}

export function addEventListener(type: 'url', listener: URLListener): { remove(): void } {
  if (type !== 'url') throw new TypeError(`Unsupported Linking event: ${String(type)}`);
  listeners.add(listener);
  updatePolling();
  if (pending.length) {
    const queued = pending.splice(0);
    queueMicrotask(() => queued.forEach(url => {
      if (listeners.has(listener)) listener({ url });
    }));
  }
  return {
    remove: () => {
      listeners.delete(listener);
      updatePolling();
    },
  };
}

const previous = host.__rayactOnURL;
host.__rayactOnURL = (url: string) => {
  previous?.(url);
  for (const listener of listeners) listener({ url });
};

export default { openURL, canOpenURL, getInitialURL, addEventListener };
