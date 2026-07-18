import { getBundledModules, type BundledModule } from './officialApp.js';

export type ReachabilityResult =
  | { kind: 'reachable_rayact' }
  | { kind: 'reachable_no_manifest' }
  | { kind: 'unreachable' };

export type ValidateUrlResult =
  | { ok: true; parsed: string }
  | { ok: false; error: string };

export type RequiredModule = {
  /** Bus module id (e.g. "mmkv"). */
  name: string;
  /** npm wrapper that exposes the typed API, when known. */
  jsPackage?: string;
};

export interface RayactCompatibilityManifest {
  compiler?: unknown;
  binaryCommands?: unknown;
  nativeModules?: unknown;
}

export interface ManifestCompatibilityResult {
  compatible: boolean;
  modules: RequiredModule[];
  /** True when this check received and parsed a live Rayact manifest. */
  manifestValidated: boolean;
}

const META_TIMEOUT_MS = 5000;
// Discovery, recent-server status, and a user tap can all inspect the same
// manifest within one render cycle. Coalesce those reads without keeping a
// server result long enough to make the list feel stale.
const MANIFEST_CACHE_TTL_MS = 1500;
const HOST_REACT_COMPILER = 'react-compiler';
const HOST_BINARY_COMMANDS = true;

const DEV_SERVER_HTTP_URL_RE =
  /^https?:\/\/(\[[0-9a-fA-F:.]+\]|[^/?:#\s@]+)(?::(\d{1,5}))?(\/[^\s?#]*)?$/i;

function withTimeoutMs(ms: number): { signal?: AbortSignal; cancel: () => void } {
  // Lightweight/mobile hosts may provide fetch before AbortController. A probe
  // must still run there; the native transport supplies its own request timeout.
  if (typeof AbortController !== 'function') {
    return { cancel: () => {} };
  }
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, cancel: () => clearTimeout(id) };
}

export function trimDevUrlInput(input: string): string {
  let s = input.trim().replace(/^\uFEFF/, '');
  s = s.replace(/\\\//g, '/');
  // Pasted/scanned QR payloads: a JSON array of "host:port" strings
  // (current format) or a legacy {url, transports} object.
  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0]) {
        s = (parsed[0] as string).trim();
      } else if (parsed && typeof parsed === 'object') {
        const o = parsed as { url?: string; transports?: { type: string; ips?: string[]; port: number }[] };
        if (typeof o.url === 'string' && o.url) {
          s = o.url;
        } else {
          const ws = o.transports?.find(t => t.type === 'websocket');
          if (ws?.ips?.[0]) s = `${ws.ips[0]}:${ws.port}`;
        }
      }
    } catch { /* treat as a plain URL */ }
  }
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s;
}

/**
 * Expand a pasted/scanned payload into ALL candidate base URLs. The current QR
 * format is a JSON array of "host:port" (one per LAN interface); trimDevUrlInput
 * collapses it to the first, but for selection we want every candidate. Each is
 * normalized to http://host:port (no trailing slash). Falls back to the single
 * trimmed URL for non-array input.
 */
export function expandDevUrlCandidates(input: string): string[] {
  const s = input.trim().replace(/^﻿/, '').replace(/\\\//g, '/');
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        const out: string[] = [];
        for (const item of parsed) {
          if (typeof item !== 'string' || !item.trim()) continue;
          let u = item.trim().replace(/\/+$/, '');
          if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
          out.push(u);
        }
        if (out.length > 0) return [...new Set(out)];
      }
    } catch { /* fall through to single */ }
  }
  return [devServerProbeBase(input)];
}

/**
 * Probe candidates concurrently and resolve with the first that serves a Rayact
 * manifest (fastest reachable == most stable). Resolves null when none respond.
 */
export function pickFastestReachable(candidates: string[]): Promise<string | null> {
  // Manual first-success race (avoids Promise.any — not in our ES2020 lib / QuickJS):
  // resolve with the first candidate that serves a manifest, or null when all settle.
  return new Promise<string | null>(resolve => {
    if (candidates.length === 0) {
      resolve(null);
      return;
    }
    let pending = candidates.length;
    let settled = false;
    for (const url of candidates) {
      void probeDevServerReachability(url).then(r => {
        if (settled) return;
        if (r.kind === 'reachable_rayact') {
          settled = true;
          resolve(url);
          return;
        }
        if (--pending === 0) resolve(null);
      });
    }
  });
}

export function networkProbesAvailable(): boolean {
  return typeof fetch === 'function';
}

export function devServerProbeBase(input: string): string {
  let s = trimDevUrlInput(input);
  s = s.replace(/\/+$/, '') || s;
  return s;
}

export function persistedDevServerUrl(input: string): string {
  return devServerProbeBase(input);
}

export function validateDevServerUrl(input: string): ValidateUrlResult {
  const parsed = persistedDevServerUrl(input);
  if (!parsed.trim()) return { ok: false, error: 'Enter a server URL' };
  const m = DEV_SERVER_HTTP_URL_RE.exec(parsed);
  if (!m) return { ok: false, error: 'Invalid URL' };
  const host = m[1];
  if (!host || host.length === 0) return { ok: false, error: 'Missing host' };
  const portStr = m[2];
  if (portStr !== undefined && portStr !== '') {
    const p = Number(portStr);
    if (!Number.isFinite(p) || p !== Math.trunc(p) || p < 1 || p > 65535) {
      return { ok: false, error: 'Invalid port' };
    }
  }
  return { ok: true, parsed };
}

function manifestUrlForBase(base: string): string {
  return `${base.replace(/\/+$/, '')}/rayact/manifest.json`;
}

type ManifestFetchResult = {
  reachable: boolean;
  ok: boolean;
  status: number;
  manifest?: Record<string, unknown>;
};

type CachedManifestFetch = {
  expiresAt: number;
  promise: Promise<ManifestFetchResult>;
};

const manifestFetchCache = new Map<string, CachedManifestFetch>();

function fetchManifest(baseUrl: string): Promise<ManifestFetchResult> {
  const probeBase = devServerProbeBase(baseUrl);
  const now = Date.now();
  const cached = manifestFetchCache.get(probeBase);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = (async (): Promise<ManifestFetchResult> => {
    const { signal, cancel } = withTimeoutMs(META_TIMEOUT_MS);
    try {
      const res = await fetch(manifestUrlForBase(probeBase), { method: 'GET', signal });
      if (!res.ok) {
        return { reachable: true, ok: false, status: res.status };
      }
      const text = await res.text();
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return {
            reachable: true,
            ok: true,
            status: res.status,
            manifest: parsed as Record<string, unknown>,
          };
        }
      } catch {
        // A live endpoint with a malformed body is reachable but not validated.
      }
      return { reachable: true, ok: true, status: res.status };
    } catch {
      return { reachable: false, ok: false, status: 0 };
    } finally {
      cancel();
    }
  })();

  const cacheEntry: CachedManifestFetch = {
    // Keep a slow request coalesced for its whole lifetime. The short freshness
    // window starts only once it settles.
    expiresAt: Number.POSITIVE_INFINITY,
    promise,
  };
  manifestFetchCache.set(probeBase, cacheEntry);
  void promise.then(() => {
    if (manifestFetchCache.get(probeBase) === cacheEntry) {
      cacheEntry.expiresAt = Date.now() + MANIFEST_CACHE_TTL_MS;
    }
  });
  // Bound the cache even when a launcher sees many one-off LAN addresses.
  if (manifestFetchCache.size > 64) {
    for (const [key, value] of manifestFetchCache) {
      if (value.expiresAt <= now) manifestFetchCache.delete(key);
    }
    if (manifestFetchCache.size > 64) {
      const oldest = manifestFetchCache.keys().next().value as string | undefined;
      if (oldest) manifestFetchCache.delete(oldest);
    }
  }
  return promise;
}

/** Test/lifecycle hook; normal launcher callers rely on the short TTL. */
export function clearManifestFetchCache(): void {
  manifestFetchCache.clear();
}

export async function probeDevServerReachability(baseUrl: string): Promise<ReachabilityResult> {
  const result = await fetchManifest(baseUrl);
  if (result.ok) return { kind: 'reachable_rayact' };
  if (result.reachable && result.status === 404) return { kind: 'reachable_no_manifest' };
  return { kind: 'unreachable' };
}

export async function requireRayactManifest(baseUrl: string): Promise<void> {
  const reach = await probeDevServerReachability(devServerProbeBase(baseUrl));
  if (reach.kind === 'reachable_rayact') return;
  if (reach.kind === 'reachable_no_manifest') {
    throw new Error('Server is reachable, but it is not serving rayact/manifest.json');
  }
  throw new Error('Server unreachable');
}

export type RecentMetaMatchStatus = 'matched' | 'mismatch' | 'stale' | 'offline';

export async function probeRecentMetaMatch(
  baseUrl: string,
  expectedAppKey?: string
): Promise<RecentMetaMatchStatus> {
  const result = await fetchManifest(baseUrl);
  if (!result.ok) return result.status === 404 ? 'stale' : 'offline';
  const json = result.manifest;
  if (!json) return 'stale';
  try {
    const liveKey =
      typeof json.rayactAppKey === 'string' && json.rayactAppKey.trim()
        ? json.rayactAppKey.trim()
        : undefined;
    const expected = expectedAppKey?.trim();
    if (expected) {
      if (liveKey && liveKey !== expected) return 'mismatch';
      if (!liveKey) return 'stale';
    }
    return 'matched';
  } catch {
    return 'offline';
  }
}

export async function checkManifestCompatibility(
  baseUrl: string
): Promise<ManifestCompatibilityResult> {
  const result = await fetchManifest(baseUrl);
  if (!result.ok || !result.manifest) {
    return { compatible: true, modules: [], manifestValidated: false };
  }
  return {
    ...compareManifestCompatibility(result.manifest, getBundledModules()),
    manifestValidated: true,
  };
}

/** Pure capability comparison used by the launcher and release tests. */
export function compareManifestCompatibility(
  manifest: RayactCompatibilityManifest,
  bundledModules: BundledModule[]
): { compatible: boolean; modules: RequiredModule[] } {
  const missing: RequiredModule[] = [];
  const compiler = typeof manifest.compiler === 'string' ? manifest.compiler : undefined;
  if (compiler && compiler !== HOST_REACT_COMPILER) {
    missing.push({ name: `compiler:${compiler}`, jsPackage: HOST_REACT_COMPILER });
  }
  if (manifest.binaryCommands === true && !HOST_BINARY_COMMANDS) {
    missing.push({ name: 'binaryCommands' });
  }

  const bundled = new Set<string>();
  for (const module of bundledModules) {
    if (module.name) bundled.add(module.name);
    if (module.jsPackage) bundled.add(module.jsPackage);
  }
  const nativeModules = manifest.nativeModules;
  if (Array.isArray(nativeModules)) {
    for (const item of nativeModules) {
      if (typeof item === 'string') {
        if (!bundled.has(item)) missing.push({ name: item, jsPackage: item });
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const module = item as Record<string, unknown>;
      const name = module.name != null ? String(module.name) : '';
      const jsPackage = module.jsPackage != null ? String(module.jsPackage) : undefined;
      if ((!name && !jsPackage) || (bundled.has(name) || (jsPackage != null && bundled.has(jsPackage)))) continue;
      missing.push({ name: name || jsPackage!, jsPackage });
    }
  }
  return { compatible: missing.length === 0, modules: missing };
}
