import React, { useCallback, useMemo } from 'react';
import { View, Text } from '@rayact/react';
import { ServerListRow } from './ServerListRow.js';
import { RecentSwipeRow } from './RecentSwipeRow.js';
import type { DevLauncherTheme } from '../devLauncherTheme.js';
import { themeColors } from '../devLauncherTheme.js';
import { serverIdentityKey } from '../serverIdentity.js';

export type DiscoveredServer = {
  url: string;
  name: string;
  compatible?: boolean;
  appKey?: string;
};

export type RecentEntry = {
  url: string;
  appKey?: string;
  label?: string;
};

export type RecentReachability = 'checking' | 'matched' | 'mismatch' | 'stale' | 'offline';
const MAX_RENDERED_ROWS = 24;

type Props = {
  theme: DevLauncherTheme | null;
  parseUrl: (raw: string) => string;
  discoveredServers: DiscoveredServer[];
  recentEntries: RecentEntry[];
  recentReachability: Record<string, RecentReachability>;
  openProject: (rawUrl: string) => void;
  setUrl: (u: string) => void;
  showIncompatibleModalForUrl: (parsed: string) => void;
  removeRecentItem: (url: string) => void;
};

type MergedEntry = {
  key: string;
  url: string;
  title: string;
  subtitle: string | undefined;
  compatible: boolean;
  dotColor: number;
  saved: boolean;
  /** Exact stored URL string for removeRecentUrl (may differ from `url`). */
  savedUrl?: string;
};

function dotColorForReachability(
  st: RecentReachability | undefined,
  palette: { online: number; offline: number; mismatch: number; checking: number }
): number {
  switch (st) {
    case 'matched':
      return palette.online;
    case 'offline':
      return palette.offline;
    case 'mismatch':
    case 'stale':
      return palette.mismatch;
    default:
      return palette.checking;
  }
}

export function CombinedServerList(props: Props) {
  const {
    theme,
    parseUrl,
    discoveredServers,
    recentEntries,
    recentReachability,
    openProject,
    setUrl,
    showIncompatibleModalForUrl,
    removeRecentItem,
  } = props;
  const colors = themeColors(theme);
  const online = colors.online;
  const offline = colors.offline;
  const mismatch = colors.mismatch;
  const checking = colors.checking;

  const recentByKey = useMemo(() => {
    const m = new Map<string, RecentEntry>();
    for (const e of recentEntries) {
      const parsed = parseUrl(e.url);
      m.set(serverIdentityKey({ url: parsed, appKey: e.appKey }), e);
      // Also index by bare URL: a discovered server carries an appKey while
      // the saved entry usually doesn't, so the identity keys differ even
      // though they are the same server.
      m.set(serverIdentityKey({ url: parsed }), e);
    }
    return m;
  }, [recentEntries, parseUrl]);

  const merged: MergedEntry[] = useMemo(() => {
    const out: MergedEntry[] = [];
    const seen = new Set<string>();

    for (const s of discoveredServers) {
      const parsed = parseUrl(s.url);
      const key = serverIdentityKey({ url: parsed, appKey: s.appKey });
      const urlKey = serverIdentityKey({ url: parsed });
      if (seen.has(key) || seen.has(urlKey)) continue;
      seen.add(key);
      seen.add(urlKey);
      const saved = recentByKey.get(key) ?? recentByKey.get(urlKey);
      const compatible = s.compatible !== false;
      const title = saved?.label?.trim() ? saved.label : (s.name || s.url);
      out.push({
        key,
        url: s.url,
        title,
        subtitle: title !== s.url ? s.url : undefined,
        compatible,
        dotColor: compatible ? online : offline,
        saved: !!saved,
        savedUrl: saved?.url,
      });
    }

    for (const e of recentEntries) {
      const parsed = parseUrl(e.url);
      const key = serverIdentityKey({ url: parsed, appKey: e.appKey });
      const urlKey = serverIdentityKey({ url: parsed });
      if (seen.has(key) || seen.has(urlKey)) continue;
      seen.add(key);
      seen.add(urlKey);
      const st = recentReachability[e.url];
      out.push({
        key,
        url: e.url,
        title: e.label?.trim() ? e.label : e.url,
        subtitle: e.label?.trim() ? e.url : undefined,
        compatible: st !== 'mismatch',
        dotColor: dotColorForReachability(st, { online, offline, mismatch, checking }),
        saved: true,
        savedUrl: e.url,
      });
    }

    return out;
  }, [discoveredServers, recentEntries, recentByKey, recentReachability, parseUrl, online, offline, mismatch, checking]);

  const handleSelect = useCallback(
    (rawUrl: string, compatible: boolean) => {
      const parsed = parseUrl(rawUrl);
      if (!compatible) {
        showIncompatibleModalForUrl(parsed);
        return;
      }
      setUrl(parsed);
      openProject(rawUrl);
    },
    [parseUrl, setUrl, openProject, showIncompatibleModalForUrl]
  );

  if (merged.length === 0) {
    return (
      <View style={{ gap: 8, paddingTop: 4, paddingBottom: 24 }}>
        <Text style={{ text: { color: colors.onSurface, fontSize: 14 } }}>
          Scanning for servers on your network… Saved servers also appear here.
        </Text>
      </View>
    );
  }

  const visibleMerged = merged.length > MAX_RENDERED_ROWS
    ? merged.slice(0, MAX_RENDERED_ROWS)
    : merged;

  return (
    <View style={{ gap: 10, paddingTop: 4, paddingBottom: 24 }}>
      {visibleMerged.map((m) =>
        m.saved ? (
          <RecentSwipeRow
            key={m.key}
            title={m.title}
            subtitle={m.subtitle}
            dotColor={m.dotColor}
            theme={theme}
            onConnect={() => handleSelect(m.url, m.compatible)}
            onRemove={() => removeRecentItem(m.savedUrl ?? m.url)}
          />
        ) : (
          <ServerListRow
            key={m.key}
            dotColor={m.dotColor}
            title={m.title}
            subtitle={m.subtitle ?? m.url}
            theme={theme}
            onPress={() => handleSelect(m.url, m.compatible)}
          />
        )
      )}
      {merged.length > MAX_RENDERED_ROWS ? (
        <Text style={{ text: { color: colors.onSurfaceVariant, fontSize: 12 } }}>
          Showing first {MAX_RENDERED_ROWS} servers. Type a URL to connect to another server.
        </Text>
      ) : null}
    </View>
  );
}
