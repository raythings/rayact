import { Platform } from '@rayact/shared';
import * as Linking from '@rayact/linking';

type HistoryHost = typeof globalThis & {
  window?: {
    history?: {
      pushState(data: unknown, unused: string, url?: string): void;
      replaceState(data: unknown, unused: string, url?: string): void;
    };
    location?: { pathname: string; search: string };
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };
};

const host = globalThis as HistoryHost;

/** Browser history/URL sync is web-wasm only; QuickJS hosts must never touch it. */
export function isWebHistoryAvailable(): boolean {
  return (
    Platform.OS === Platform.WEB &&
    typeof host.window !== 'undefined' &&
    !!host.window.history &&
    !!host.window.location
  );
}

export function currentWebPath(): string | null {
  if (!isWebHistoryAvailable()) return null;
  const { pathname, search } = host.window!.location!;
  return pathname + search;
}

/**
 * Extract the routable path from a deep-link URL. http(s) URLs contribute
 * pathname+search; custom schemes treat the authority as the first path
 * segment (myapp://profile/42 → /profile/42, Expo convention).
 */
export function pathFromUrl(url: string): string | null {
  if (url.startsWith('/')) return url;
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)(.*)$/.exec(url);
  if (!match) return null;
  const [, scheme, authority, rest] = match;
  if (scheme === 'http' || scheme === 'https') return rest || '/';
  if (!authority) return rest || '/';
  return `/${authority}${rest}`;
}

/** Initial route path: web reads the address bar, native asks @rayact/linking. */
export async function getInitialRoutePath(timeoutMs = 150): Promise<string | null> {
  if (isWebHistoryAvailable()) return currentWebPath();
  try {
    const url = await Promise.race([
      Linking.getInitialURL(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return url ? pathFromUrl(url) : null;
  } catch {
    return null;
  }
}

/** Deep links after launch: browser popstate on web, url events on native. */
export function subscribeToIncomingLinks(onPath: (path: string) => void): () => void {
  if (isWebHistoryAvailable()) {
    const onPopState = () => {
      const path = currentWebPath();
      if (path) onPath(path);
    };
    host.window!.addEventListener?.('popstate', onPopState);
    return () => host.window!.removeEventListener?.('popstate', onPopState);
  }
  const subscription = Linking.addEventListener('url', event => {
    const path = pathFromUrl(event.url);
    if (path) onPath(path);
  });
  return () => subscription.remove();
}

/** Push/replace the browser URL; no-op off web or when already current. */
export function syncWebHistory(path: string, kind: 'push' | 'replace'): void {
  if (!isWebHistoryAvailable()) return;
  if (currentWebPath() === path) return;
  const history = host.window!.history!;
  if (kind === 'push') history.pushState({}, '', path);
  else history.replaceState({}, '', path);
}
