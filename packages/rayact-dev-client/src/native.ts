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
  missingModules?: Array<{ name: string; jsPackage?: string }>;
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

export interface PerformanceMetrics {
  cpuPercent?: number;
  /** Whole-process physical memory: Android PSS or the iOS physical footprint. */
  memoryMb?: number;
  gpuPercent?: number;
  gpuFrameTimeMs?: number;
  gpuDeviceName?: string;
  gpuBackend?: string;
  frameTimeMs?: number;
  rollingFrameTimeMs?: number;
  fps?: number;
  targetRefreshRate?: number;
  droppedFrames?: number;
  jankyFrames?: number;
  sampleFrames?: number;
}

export interface DevToolsState {
  enabled: boolean;
  forcedOff: boolean;
  bundleFormat: 'js' | 'qjsbc';
  reason: string;
}

const normalizeDevToolsState = (raw: string | DevToolsState): DevToolsState => {
  const value = typeof raw === 'string' ? JSON.parse(raw) as Partial<DevToolsState> : raw;
  return {
    enabled: value.enabled === true,
    forcedOff: value.forcedOff === true,
    bundleFormat: value.bundleFormat === 'qjsbc' ? 'qjsbc' : 'js',
    reason: typeof value.reason === 'string' ? value.reason : '',
  };
};

export function getDevToolsState(): Promise<DevToolsState> {
  return call<string | DevToolsState>('getDevToolsState').then(normalizeDevToolsState);
}

export function setDevToolsEnabled(enabled: boolean): Promise<DevToolsState> {
  return call<string | DevToolsState>('setDevToolsEnabled', { enabled }).then(normalizeDevToolsState);
}

export function setPerformanceSampling(active: boolean): Promise<void> {
  return call('setPerformanceSampling', { active });
}

type DevCallCallback = (result: unknown) => void;

declare const devCall: ((method: string, data?: unknown, callback?: DevCallCallback) => void) | undefined;

export function devCallAvailable(): boolean {
  return typeof devCall === 'function';
}

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

export function returnToLauncher(): Promise<void> {
  return call('returnToLauncher');
}

export function openProjectDirect(url: string, manifestValidated = false): Promise<OpenProjectResult> {
  return call<OpenProjectResult>('openProjectDirect', { url, manifestValidated });
}

export function getAppInfo(): Promise<AppInfo> {
  return call<string>('getAppInfo').then(raw => {
    if (typeof raw === 'string') {
      return JSON.parse(raw) as AppInfo;
    }
    return raw as AppInfo;
  });
}

export function openExternalUrl(url: string): Promise<boolean> {
  return call<unknown>('openExternalUrl', { url }).then(value => value === true || value === 'true');
}

export function getConnectError(): Promise<string> {
  return call<string>('getConnectError');
}

export function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  return call<string | PerformanceMetrics>('getPerformanceMetrics').then(raw =>
    typeof raw === 'string' ? JSON.parse(raw) as PerformanceMetrics : raw
  );
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
