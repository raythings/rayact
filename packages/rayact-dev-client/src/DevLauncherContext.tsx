import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createBridge, createDevClient, installConsoleForwarding } from '@rayact/runtime';
import {
  getConnectError,
  getDevServerUrl,
  getDiscoveredServers,
  getRecentEntries,
  isConnectLoading,
  parseUrl,
  reloadWithProjectBundle,
  removeRecentUrl,
  setDevServerUrl,
  startDiscovery,
  stopDiscovery,
  type DiscoveredServer,
  type RecentEntry
} from './native.js';

export type Reachability = 'checking' | 'matched' | 'offline' | 'stale';

export interface DevLauncherContextValue {
  url: string;
  setUrl: (url: string) => void;
  recentEntries: RecentEntry[];
  discoveredServers: DiscoveredServer[];
  recentReachability: Record<string, Reachability>;
  connectError: string;
  connecting: boolean;
  clearConnectError: () => void;
  connectToUrl: (raw: string) => void;
  onSelectRecent: (url: string) => void;
  onScanQR: () => void;
  refreshRecent: () => void;
  removeRecentItem: (url: string) => void;
  reload: () => void;
  projectLoaded: boolean;
  devMenuOpen: boolean;
  setDevMenuOpen: (open: boolean) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
}

const DevLauncherContext = createContext<DevLauncherContextValue | null>(null);

async function checkReachability(url: string, appKey?: string): Promise<Reachability> {
  try {
    const response = await fetch(`${url}/rayact/manifest.json`);
    if (!response.ok) return 'offline';
    const manifest = await response.json() as { rayactAppKey?: string };
    if (appKey && manifest.rayactAppKey && manifest.rayactAppKey !== appKey) return 'stale';
    return 'matched';
  } catch {
    return 'offline';
  }
}

export function DevLauncherProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrlState] = useState('');
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);
  const [recentReachability, setRecentReachability] = useState<Record<string, Reachability>>({});
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const refreshRecent = useCallback(() => {
    void getRecentEntries().then(setRecentEntries).catch(() => {});
    void getDevServerUrl().then(saved => {
      if (saved) setUrlState(saved);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const g = globalThis as { __rayactToggleDevMenu?: () => void };
    g.__rayactToggleDevMenu = () => setDevMenuOpen(open => !open);
    return () => {
      delete g.__rayactToggleDevMenu;
    };
  }, []);

  useEffect(() => {
    refreshRecent();
    void startDiscovery().catch(() => {});
    const timer = setInterval(() => {
      void getDiscoveredServers().then(setDiscoveredServers).catch(() => {});
    }, 3000);
    return () => {
      clearInterval(timer);
      void stopDiscovery().catch(() => {});
    };
  }, [refreshRecent]);

  useEffect(() => {
    for (const entry of recentEntries) {
      setRecentReachability(prev => ({ ...prev, [entry.url]: 'checking' }));
      void checkReachability(entry.url, entry.label).then(status => {
        setRecentReachability(prev => ({ ...prev, [entry.url]: status }));
      });
    }
  }, [recentEntries]);

  const ensureDevClient = useCallback((serverUrl: string) => {
    const g = globalThis as {
      __RAYACT_DEV_SERVER__?: string;
      __rayactDevClient?: ReturnType<typeof createDevClient>;
    };
    g.__RAYACT_DEV_SERVER__ = serverUrl;
    if (g.__rayactDevClient) return;
    const bridge = createBridge(g);
    const client = createDevClient({ serverUrl, bridge, global: g });
    installConsoleForwarding(client, g);
    client.connect();
    g.__rayactDevClient = client;
  }, []);

  const waitForConnect = useCallback(async () => {
    await new Promise(r => setTimeout(r, 50));
    for (let i = 0; i < 120; i++) {
      const err = await getConnectError();
      if (err) throw new Error(err);
      if (!(await isConnectLoading())) return;
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Timed out waiting for dev server bundle');
  }, []);

  const connectToUrl = useCallback((raw: string) => {
    const parsed = parseUrl(raw);
    setConnectError('');
    setConnecting(true);
    void setDevServerUrl(parsed)
      .then(() => {
        setUrlState(parsed);
        return reloadWithProjectBundle();
      })
      .then(() => waitForConnect())
      .then(() => {
        ensureDevClient(parsed);
        setProjectLoaded(true);
      })
      .catch(err => setConnectError(err instanceof Error ? err.message : String(err)))
      .finally(() => setConnecting(false));
  }, [ensureDevClient, waitForConnect]);

  const value = useMemo<DevLauncherContextValue>(() => ({
    url,
    setUrl: setUrlState,
    recentEntries,
    discoveredServers,
    recentReachability,
    connectError,
    connecting,
    clearConnectError: () => setConnectError(''),
    connectToUrl,
    onSelectRecent: connectToUrl,
    onScanQR: () => { void import('./native.js').then(m => m.scanQR()); },
    refreshRecent,
    removeRecentItem: (u: string) => { void removeRecentUrl(u).then(refreshRecent); },
    reload: () => { void reloadWithProjectBundle(); },
    projectLoaded,
    devMenuOpen,
    setDevMenuOpen,
    inspectorOpen,
    setInspectorOpen
  }), [url, recentEntries, discoveredServers, recentReachability, connectError, connecting, connectToUrl, refreshRecent, projectLoaded, devMenuOpen, inspectorOpen]);

  return (
    <DevLauncherContext.Provider value={value}>
      {children}
    </DevLauncherContext.Provider>
  );
}

export function useDevLauncher(): DevLauncherContextValue {
  const ctx = useContext(DevLauncherContext);
  if (!ctx) throw new Error('useDevLauncher must be used within DevLauncherProvider');
  return ctx;
}
