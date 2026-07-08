import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { DevLauncherTheme } from './devLauncherTheme.js';
import { FALLBACK_THEME } from './devLauncherTheme.js';
import {
  checkManifestCompatibility,
  devServerProbeBase,
  expandDevUrlCandidates,
  persistedDevServerUrl,
  networkProbesAvailable,
  pickFastestReachable,
  probeRecentMetaMatch,
  validateDevServerUrl,
  type RequiredModule,
} from './devServerUrl.js';
import type { DiscoveredServer, RecentEntry } from './components/CombinedServerList.js';
import {
  getDevServerUrl,
  getDiscoveredServers,
  getRecentEntries,
  openProjectDirect,
  parseUrl as parseUrlNative,
  reloadWithProjectBundle,
  removeRecentUrl,
  scanQR,
  startDiscovery,
  stopDiscovery,
} from './native.js';

export type RecentReachability = 'checking' | 'matched' | 'mismatch' | 'stale' | 'offline';

const INVALID_SERVER_URL_MESSAGE = 'Invalid server URL';

export interface DevLauncherContextValue {
  url: string;
  setUrl: (u: string) => void;
  theme: DevLauncherTheme | null;
  recentEntries: RecentEntry[];
  recentReachability: Record<string, RecentReachability>;
  discoveredServers: DiscoveredServer[];
  incompatibleModalVisible: boolean;
  setIncompatibleModalVisible: (v: boolean) => void;
  incompatibleModules: RequiredModule[];
  connectError: string;
  connecting: boolean;
  clearConnectError: () => void;
  refreshRecent: () => void;
  removeRecentItem: (url: string) => void;
  connectToUrl: (parsed: string) => void;
  openProject: (rawUrl: string) => void;
  showIncompatibleModalForUrl: (parsed: string) => void;
  onSelectRecent: (u: string) => void;
  onScanQR: () => void;
  parseUrl: (input: string) => string;
  reload: () => void;
  devMenuOpen: boolean;
  setDevMenuOpen: (open: boolean) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
}

const DevLauncherContext = createContext<DevLauncherContextValue | null>(null);

function normalizeDiscovered(raw: unknown): DiscoveredServer[] {
  if (!Array.isArray(raw)) return [];
  const out: DiscoveredServer[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const url = o.url != null ? String(o.url) : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      name: o.name != null ? String(o.name) : '',
      appKey: o.appKey != null ? String(o.appKey) : undefined,
      compatible: typeof o.compatible === 'boolean' ? o.compatible : true,
    });
  }
  return out;
}

export function DevLauncherProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrlState] = useState('');
  const [theme] = useState<DevLauncherTheme | null>(FALLBACK_THEME);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const recentEntriesRef = useRef(recentEntries);
  recentEntriesRef.current = recentEntries;
  const recentListKey = useMemo(
    () => recentEntries.map(e => `${e.url}|${e.appKey ?? ''}`).join(';'),
    [recentEntries]
  );
  const [recentReachability, setRecentReachability] = useState<Record<string, RecentReachability>>({});
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);
  const [incompatibleModalVisible, setIncompatibleModalVisible] = useState(false);
  const [incompatibleModules, setIncompatibleModules] = useState<RequiredModule[]>([]);
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const setUrl = useCallback((u: string) => {
    setUrlState(u);
    setConnectError('');
  }, []);

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
      void getDiscoveredServers()
        .then(raw => setDiscoveredServers(normalizeDiscovered(raw)))
        .catch(() => {});
    }, 2000);
    return () => {
      clearInterval(timer);
      void stopDiscovery().catch(() => {});
    };
  }, [refreshRecent]);

  const probeAllRecents = useCallback((entries: RecentEntry[], initial: boolean) => {
    if (entries.length === 0) {
      setRecentReachability({});
      return () => {};
    }
    if (!networkProbesAvailable()) {
      setRecentReachability(
        Object.fromEntries(
          entries.map((e) => {
            const v = validateDevServerUrl(e.url);
            return [e.url, v.ok ? 'matched' as RecentReachability : 'offline' as RecentReachability];
          })
        )
      );
      return () => {};
    }
    if (initial) {
      setRecentReachability(
        Object.fromEntries(entries.map(e => [e.url, 'checking' as RecentReachability]))
      );
    }
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        entries.map(async (e) => {
          const v = validateDevServerUrl(e.url);
          if (!v.ok) return [e.url, 'offline' as RecentReachability] as const;
          const st = await probeRecentMetaMatch(devServerProbeBase(e.url), e.appKey);
          return [e.url, st] as const;
        })
      );
      if (cancelled) return;
      setRecentReachability(prev => ({ ...prev, ...Object.fromEntries(results) }));
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cancel = probeAllRecents(recentEntries, true);
    const id = setInterval(() => {
      probeAllRecents(recentEntriesRef.current, false);
    }, 5000);
    return () => {
      cancel();
      clearInterval(id);
    };
  }, [recentListKey, probeAllRecents]);

  const parseUrl = useCallback((input: string): string => persistedDevServerUrl(input), []);

  const removeRecentItem = useCallback((u: string) => {
    void removeRecentUrl(u).then(() => {
      setRecentReachability(prev => {
        const next = { ...prev };
        delete next[u];
        return next;
      });
      refreshRecent();
    });
  }, [refreshRecent]);

  const connectToUrl = useCallback((parsed: string) => {
    void (async () => {
      setConnecting(true);
      setConnectError('');
      try {
        const openResult = await openProjectDirect(parsed);
        if (!openResult?.ok) {
          throw new Error(INVALID_SERVER_URL_MESSAGE);
        }
        setUrlState(openResult.url ?? parsed);
        refreshRecent();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setConnectError(message === INVALID_SERVER_URL_MESSAGE ? message : INVALID_SERVER_URL_MESSAGE);
      } finally {
        setConnecting(false);
      }
    })();
  }, [refreshRecent]);

  const showIncompatibleModalForUrl = useCallback((parsed: string) => {
    void (async () => {
      const { compatible, modules } = await checkManifestCompatibility(parsed);
      if (!compatible && modules.length > 0) {
        setIncompatibleModules(modules);
        setIncompatibleModalVisible(true);
      }
    })();
  }, []);

  const openProject = useCallback((rawUrl: string) => {
    // A scanned/pasted payload may carry several host:port candidates (one per
    // LAN interface). Expand them all and pick the fastest reachable instead of
    // blindly taking the first.
    const candidates = expandDevUrlCandidates(rawUrl);
    setConnectError('');
    if (!networkProbesAvailable()) {
      const validated = validateDevServerUrl(candidates[0] ?? rawUrl);
      if (!validated.ok) {
        setConnectError(INVALID_SERVER_URL_MESSAGE);
        return;
      }
      connectToUrl(devServerProbeBase(validated.parsed));
      return;
    }
    void (async () => {
      if (candidates.length > 1) {
        const best = await pickFastestReachable(candidates);
        if (!best) {
          setConnectError(INVALID_SERVER_URL_MESSAGE);
          return;
        }
        connectToUrl(devServerProbeBase(best));
        return;
      }
      const validated = validateDevServerUrl(candidates[0] ?? rawUrl);
      if (!validated.ok) {
        setConnectError(INVALID_SERVER_URL_MESSAGE);
        return;
      }
      const parsed = devServerProbeBase(validated.parsed);
      connectToUrl(parsed);
    })();
  }, [connectToUrl]);

  const value = useMemo<DevLauncherContextValue>(() => ({
    url,
    setUrl,
    theme,
    recentEntries,
    recentReachability,
    discoveredServers,
    incompatibleModalVisible,
    setIncompatibleModalVisible,
    incompatibleModules,
    connectError,
    connecting,
    clearConnectError: () => setConnectError(''),
    refreshRecent,
    removeRecentItem,
    connectToUrl,
    openProject,
    showIncompatibleModalForUrl,
    onSelectRecent: (u: string) => setUrlState(u),
    onScanQR: () => { void scanQR(); },
    parseUrl,
    reload: () => { void reloadWithProjectBundle(); },
    devMenuOpen,
    setDevMenuOpen,
    inspectorOpen,
    setInspectorOpen,
  }), [
    url, setUrl, theme, recentEntries, recentReachability, discoveredServers,
    incompatibleModalVisible, incompatibleModules, connectError, connecting,
    refreshRecent, removeRecentItem, connectToUrl, openProject, showIncompatibleModalForUrl,
    parseUrl, devMenuOpen, inspectorOpen,
  ]);

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

export { validateDevServerUrl, parseUrlNative as parseUrlFromNative };
