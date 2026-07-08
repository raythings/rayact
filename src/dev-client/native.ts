export interface RecentEntry {
  url: string;
  label?: string;
  appKey?: string;
}

export interface DiscoveredServer {
  url: string;
  name: string;
  appKey?: string;
  compatible?: boolean;
}

export interface AppInfo {
  bundleId: string;
  nativeAppVersion: string;
  rayactVersion: string;
}

export interface OpenProjectResult {
  ok: boolean;
  url?: string;
  error?: string;
}

type DevCallCallback = (result: unknown) => void;

declare const devCall: ((method: string, data?: unknown, callback?: DevCallCallback) => void) | undefined;

function call<T = unknown>(method: string, data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof devCall !== 'function') {
      reject(new Error(`Rayact devCall unavailable: ${method}`));
      return;
    }
    devCall(method, data, (result: unknown) => resolve(result as T));
  });
}

export function setDevServerUrl(url: string): Promise<void> {
  return call('setDevServerUrl', { url });
}

export function getDevServerUrl(): Promise<string> {
  return call<string>('getDevServerUrl');
}

export function getRecentEntries(): Promise<RecentEntry[]> {
  return call<RecentEntry[]>('getRecentEntries');
}

export function removeRecentUrl(url: string): Promise<void> {
  return call('removeRecentUrl', { url });
}

export function getDiscoveredServers(): Promise<DiscoveredServer[]> {
  return call<DiscoveredServer[]>('getDiscoveredServers');
}

export function startDiscovery(): Promise<void> {
  return call('startDiscovery');
}

export function stopDiscovery(): Promise<void> {
  return call('stopDiscovery');
}

export function reloadWithProjectBundle(): Promise<void> {
  return call('reloadWithProjectBundle');
}

export function openProjectDirect(url: string): Promise<OpenProjectResult> {
  return call<OpenProjectResult>('openProjectDirect', { url });
}

export function getAppInfo(): Promise<AppInfo> {
  return call<string>('getAppInfo').then(raw => {
    if (typeof raw === 'string') {
      return JSON.parse(raw) as AppInfo;
    }
    return raw as AppInfo;
  });
}

export function getConnectError(): Promise<string> {
  return call<string>('getConnectError');
}

export function isConnectLoading(): Promise<boolean> {
  return call<unknown>('isConnectLoading').then(v => v === true || v === 'true');
}

export function scanQR(): Promise<void> {
  return call('scanQR');
}

export function parseUrl(input: string): string {
  const trimmed = input.trim();
  // Current QR format: JSON array of "host:port" strings (one per LAN
  // interface); full server details come from /rayact/manifest.json.
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed) as unknown;
      if (Array.isArray(arr) && typeof arr[0] === 'string' && arr[0]) {
        let u = (arr[0] as string).trim();
        if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
        return u.replace(/\/+$/, '');
      }
    } catch { /* fall through */ }
  }
  if (trimmed.startsWith('{')) {
    try {
      const payload = JSON.parse(trimmed) as { url?: string; transports?: { type: string; ips?: string[]; port: number }[] };
      if (payload.url) return payload.url.replace(/\/+$/, '');
      const ws = payload.transports?.find(t => t.type === 'websocket');
      if (ws?.ips?.[0]) return `http://${ws.ips[0]}:${ws.port}`;
    } catch { /* fall through */ }
  }
  let url = trimmed.replace(/\\\//g, '/');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}
