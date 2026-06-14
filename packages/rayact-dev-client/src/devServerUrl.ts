import { getBundledModuleNames } from './officialApp.js';

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

const META_TIMEOUT_MS = 5000;
const HOST_REACT_COMPILER = 'react-compiler';
const HOST_BINARY_COMMANDS = true;

const DEV_SERVER_HTTP_URL_RE =
  /^https?:\/\/(\[[0-9a-fA-F:.]+\]|[^/?:#\s@]+)(?::(\d{1,5}))?(\/[^\s?#]*)?$/i;

function withTimeoutMs(ms: number): { signal: AbortSignal; cancel: () => void } {
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

export async function probeDevServerReachability(baseUrl: string): Promise<ReachabilityResult> {
  const probeBase = devServerProbeBase(baseUrl);
  const meta = manifestUrlForBase(probeBase);
  const { signal, cancel } = withTimeoutMs(META_TIMEOUT_MS);
  try {
    const res = await fetch(meta, {
      method: 'GET',
      signal,
    });
    if (res.ok) return { kind: 'reachable_rayact' };
    if (res.status === 404) return { kind: 'reachable_no_manifest' };
    return { kind: 'unreachable' };
  } catch {
    return { kind: 'unreachable' };
  } finally {
    cancel();
  }
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
  const meta = manifestUrlForBase(devServerProbeBase(baseUrl));
  const { signal, cancel } = withTimeoutMs(META_TIMEOUT_MS);
  try {
    const res = await fetch(meta, {
      method: 'GET',
      signal,
    });
    if (!res.ok) return res.status === 404 ? 'stale' : 'offline';
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(await res.text()) as Record<string, unknown>;
    } catch {
      return 'stale';
    }
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
  } finally {
    cancel();
  }
}

export async function checkManifestCompatibility(
  baseUrl: string
): Promise<{ compatible: boolean; modules: RequiredModule[] }> {
  const meta = manifestUrlForBase(devServerProbeBase(baseUrl));
  const { signal, cancel } = withTimeoutMs(META_TIMEOUT_MS);
  try {
    const res = await fetch(meta, { method: 'GET', signal });
    if (!res.ok) return { compatible: true, modules: [] };
    const json = await res.json() as Record<string, unknown>;
    const nativeModules = json.nativeModules;
    const missing: RequiredModule[] = [];

    const compiler = typeof json.compiler === 'string' ? json.compiler : undefined;
    if (compiler && compiler !== HOST_REACT_COMPILER) {
      missing.push({ name: `compiler:${compiler}`, jsPackage: HOST_REACT_COMPILER });
    }

    const binaryCommands = json.binaryCommands;
    if (binaryCommands === true && !HOST_BINARY_COMMANDS) {
      missing.push({ name: 'binaryCommands' });
    }

    if (!Array.isArray(nativeModules) || nativeModules.length === 0) {
      return { compatible: missing.length === 0, modules: missing };
    }
    // The project declares the native modules it needs; the installed dev app
    // declares what it bundles (officialApp.getBundledModuleNames, injected at
    // bundle build). Incompatible == required modules the host doesn't bundle.
    const bundled = new Set(getBundledModuleNames());
    for (const item of nativeModules) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const name = o.name != null ? String(o.name) : '';
      if (!name || bundled.has(name)) continue;
      missing.push({
        name,
        jsPackage: o.jsPackage != null ? String(o.jsPackage) : undefined,
      });
    }
    return { compatible: missing.length === 0, modules: missing };
  } catch {
    return { compatible: true, modules: [] };
  } finally {
    cancel();
  }
}
