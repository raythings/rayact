import type { HostBridge, RayactGlobal, WebSocketLike } from './types.js';
import { devInfo } from './devLog.js';

export interface ModuleHmrOptions {
  serverUrl: string;
  bridge?: HostBridge;
  global?: RayactGlobal;
  /** When set, HTTP + WS are handled natively (Android without RAYACT_NO_NET). */
  nativeTransport?: boolean;
}

export interface DevManifestModule {
  hmrMode?: string;
  bootstrapUrl?: string;
  entryModuleUrl?: string;
  hmrUrl?: string;
  bundleUrl?: string;
  /** Dev bundle: every module the entry can reach, as deferred definitions. */
  moduleBundleUrl?: string;
  revision?: number;
}

type ModuleFactory = () => unknown;

// The engine's minimal QuickJS build has no global URL/URLSearchParams, so we
// parse module URLs by hand. Using `new URL()` here throws "URL is not defined"
// inside the bootstrap and the project pane renders black.
function parseUrlParts(url: string): { pathname: string; search: string } {
  let rest = url;
  const schemeIdx = rest.indexOf('://');
  if (schemeIdx >= 0) {
    const afterAuthority = rest.slice(schemeIdx + 3);
    const slash = afterAuthority.indexOf('/');
    rest = slash >= 0 ? afterAuthority.slice(slash) : '/';
  }
  const hashIdx = rest.indexOf('#');
  if (hashIdx >= 0) rest = rest.slice(0, hashIdx);
  const qIdx = rest.indexOf('?');
  if (qIdx >= 0) return { pathname: rest.slice(0, qIdx), search: rest.slice(qIdx) };
  return { pathname: rest, search: '' };
}

function getQueryParam(search: string, key: string): string | null {
  const q = search.startsWith('?') ? search.slice(1) : search;
  if (!q) return null;
  for (const pair of q.split('&')) {
    const eq = pair.indexOf('=');
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    if (decodeURIComponent(rawKey) === key) {
      return eq >= 0 ? decodeURIComponent(pair.slice(eq + 1)) : '';
    }
  }
  return null;
}

function currentPlatform(globalObject: GlobalHmr): string | null {
  const injected = globalObject.__rayactPlatform;
  if (injected && typeof injected.target === 'string' && injected.target) return injected.target;
  if (injected && typeof injected.os === 'string' && injected.os) return injected.os;
  if (typeof globalObject.navigator?.userAgent === 'string') {
    const ua = globalObject.navigator.userAgent;
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    return 'web';
  }
  return null;
}

function withPlatformParam(url: string, platform: string | null): string {
  if (!platform) return url;
  const parsed = parseUrlParts(url);
  if (getQueryParam(parsed.search, 'platform')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}platform=${encodeURIComponent(platform)}`;
}

function withoutPlatformParam(url: string): string {
  const { pathname, search } = parseUrlParts(url);
  if (!search) return pathname;
  const params = search
    .slice(1)
    .split('&')
    .filter(Boolean)
    .filter((pair) => decodeURIComponent((pair.split('=')[0] ?? '')) !== 'platform');
  return params.length ? `${pathname}?${params.join('&')}` : pathname;
}

const VENDOR_MODULE_KEYS: Record<string, string> = {
  react: 'react',
  'react/jsx-runtime': 'jsxRuntime',
  'react/jsx-dev-runtime': 'jsxDevRuntime'
};

function normalizeVendorSpecifier(specifier: string): string | null {
  const bare = specifier.replace(/^\u0000rayact-vendor:/, '').replace(/^\0rayact-vendor:/, '');
  return VENDOR_MODULE_KEYS[bare] ? bare : null;
}

function getVendorNamespace(globalObject: GlobalHmr, specifier: string): unknown | null {
  const bare = normalizeVendorSpecifier(specifier) ?? vendorSpecifierFromResolvedPath(specifier);
  if (!bare) return null;
  const vendorKey = VENDOR_MODULE_KEYS[bare]!;
  const mod = globalObject.__RAYACT_VENDOR__?.[vendorKey];
  if (!mod) return null;
  if (bare === 'react') {
    return { default: mod, ...mod };
  }
  return {
    default: mod,
    Fragment: mod.Fragment,
    jsx: mod.jsx,
    jsxs: mod.jsxs,
    jsxDEV: mod.jsxDEV
  };
}

function vendorSpecifierFromResolvedPath(specifier: string): string | null {
  const path = parseUrlParts(specifier).pathname;
  if (/(^|\/)node_modules\/react\/index\.js$/.test(path)) return 'react';
  if (/(^|\/)node_modules\/react\/jsx-runtime\.js$/.test(path)) return 'react/jsx-runtime';
  if (/(^|\/)node_modules\/react\/jsx-dev-runtime\.js$/.test(path)) return 'react/jsx-dev-runtime';
  return null;
}

type GlobalHmr = RayactGlobal & {
  __rayactModuleRegistry?: Map<string, ModuleFactory>;
  __rayactModuleLoading?: Map<string, Promise<unknown>>;
  __rayactRequire?: (specifier: string, fromUrl?: string) => unknown;
  __rayactRequireAsync?: (specifier: string, fromUrl?: string) => Promise<unknown>;
  __rayactRegisterModule?: (url: string, factory: ModuleFactory) => void;
  /** Dev-bundle definitions: run on first require, then self-register. */
  __rayactModuleDefinitions?: Map<string, () => void>;
  __rayactDefineModule?: (url: string, define: () => void) => void;
  /** Development-only bridge: retains the exact module source evaluated by QuickJS. */
  __rayactRegisterDebugScript?: (url: string, source: string) => void;
  __rayactApplyModuleUpdate?: (path: string, source: string) => void;
  __rayactDevFetch?: (url: string) => string;
  __rayactDevServerUrl?: string;
  __rayactHmrRuntime?: ModuleHmrRuntime;
  __RAYACT_HMR_ACTIVE__?: boolean;
  /** Set by hosts whose native HMR client (ProjectHmrClient) owns the socket. */
  __RAYACT_NATIVE_HMR__?: boolean;
  __RAYACT_VENDOR__?: Record<string, Record<string, unknown>>;
  __REACT_REFRESH__?: { performReactRefresh: () => void };
  __rayactPlatform?: { os?: string; target?: string; version?: string };
  navigator?: { userAgent?: string };
};

/**
 * Reject anything that is not module source before it reaches `eval()`.
 *
 * The device's sync fetch shim returns text only — no status code — so a
 * failed load used to arrive as either an error sentence or an empty string
 * and get evaluated anyway. An empty module registers nothing, so the importer
 * silently received `null` and blew up somewhere unrelated; on Android the
 * same path could take the process down with no JS error at all. Every failure
 * mode now throws here, naming the module that failed.
 */
export function assertModuleSource(text: string, url: string): string {
  if (!text || !text.trim()) {
    throw new Error(`Empty module response for ${url} — the dev server returned no source.`);
  }
  const head = text.slice(0, 400);
  if (/^\s*(Error|SyntaxError|TypeError|ReferenceError):/.test(head)) {
    throw new Error(`${head.trim().slice(0, 300)}\n  while loading ${url}`);
  }
  // Plain-text failures that predate the tagged sentinel (older dev servers,
  // proxies, captive-portal pages) never parse as JS; catch the common shapes
  // instead of letting eval() report a bogus SyntaxError.
  if (/^\s*(Cannot resolve|Module not found|Vite dev server not ready|missing spec)\b/.test(head)) {
    throw new Error(`${head.trim().slice(0, 300)}\n  while loading ${url}`);
  }
  return text;
}

export class ModuleHmrRuntime {
  private readonly globalObject: GlobalHmr;
  private readonly serverUrl: string;
  private readonly bridge?: HostBridge;
  private hmrSocket: WebSocketLike | null = null;
  private hmrReconnect: ReturnType<typeof setTimeout> | null = null;
  private manifest: DevManifestModule = {};
  private readonly bootstrapUrls = new Set<string>();

  constructor(options: ModuleHmrOptions) {
    this.serverUrl = options.serverUrl.replace(/\/+$/, '');
    this.bridge = options.bridge;
    this.globalObject = (options.global ?? globalThis) as GlobalHmr;
    // Published for modules that have to reach the dev server on their own —
    // notably `import './x.css'`, which fetches the stylesheet text instead of
    // reading a project-relative path that only exists in a bundled build.
    this.globalObject.__rayactDevServerUrl = this.serverUrl;
    this.installRegistry();
    this.globalObject.__rayactHmrRuntime = this;
    this.globalObject.__rayactApplyModuleUpdate = (path, source) => {
      this.applyModuleUpdate(path, source);
    };
  }

  private installRegistry(): void {
    if (!this.globalObject.__rayactModuleRegistry) {
      this.globalObject.__rayactModuleRegistry = new Map();
    }
    if (!this.globalObject.__rayactModuleLoading) {
      this.globalObject.__rayactModuleLoading = new Map();
    }
    if (!this.globalObject.__rayactModuleDefinitions) {
      this.globalObject.__rayactModuleDefinitions = new Map();
    }

    // The dev bundle ships every module as a deferred definition rather than a
    // registration, so module bodies still run lazily in dependency order the
    // first time something requires them — exactly as they do when fetched one
    // at a time. Running `define()` executes the wrapped module, which registers
    // itself through __rayactRegisterModule below.
    this.globalObject.__rayactDefineModule = (url, define) => {
      const definitions = this.globalObject.__rayactModuleDefinitions!;
      const normalized = normalizeModuleUrl(url);
      const stripped = withoutPlatformParam(normalized);
      const aliases = new Set([normalized, stripped]);
      if (stripped.startsWith('/rayact/m/')) {
        aliases.add(stripped.slice('/rayact/m'.length));
      }
      for (const alias of aliases) definitions.set(alias, define);
    };

    this.globalObject.__rayactRegisterModule = (url, factory) => {
      const normalized = normalizeModuleUrl(url);
      const stripped = withoutPlatformParam(normalized);
      const aliases = new Set([normalized, stripped]);
      if (stripped.startsWith('/rayact/m/')) {
        aliases.add(stripped.slice('/rayact/m'.length));
      }
      for (const alias of aliases) {
        this.globalObject.__rayactModuleRegistry!.set(alias, () =>
          normalizeModuleExport(factory())
        );
      }
    };

    this.globalObject.__rayactRequire = (specifier, fromUrl) => {
      const vendor = getVendorNamespace(this.globalObject, specifier);
      if (vendor) return vendor;
      const resolved = resolveModuleUrl(specifier, fromUrl ?? '', this.serverUrl);
      return normalizeModuleExport(this.loadModuleSync(resolved));
    };

    // Backing for `__vite_ssr_dynamic_import__` (i.e. `await import()`), which
    // ssrTransform emits and the module prelude forwards here. Kept separate
    // from __rayactRequire so a dynamic import of an already-in-flight module
    // awaits it instead of hitting loadModuleSync's circular-dependency throw.
    this.globalObject.__rayactRequireAsync = (specifier, fromUrl) => {
      try {
        const vendor = getVendorNamespace(this.globalObject, specifier);
        if (vendor) return Promise.resolve(vendor);
        const resolved = resolveModuleUrl(specifier, fromUrl ?? '', this.serverUrl);
        return this.loadModuleDynamic(resolved).then(normalizeModuleExport);
      } catch (error) {
        return Promise.reject(error);
      }
    };
  }

  /**
   * Load the whole module graph in one request.
   *
   * Without this the device walks the graph module by module, and each edge is a
   * blocking fetch — hundreds of round trips before the first frame. The bundle
   * only *defines* modules, so execution order is unchanged; it just removes the
   * network from the middle of it.
   *
   * Best-effort by design: any failure leaves the registry empty and the normal
   * per-module path takes over, so a bundling problem slows the boot instead of
   * breaking it.
   */
  private async preloadModuleBundle(bundleUrl?: string): Promise<void> {
    if (!bundleUrl) return;
    try {
      const source = await this.devFetchText(
        withPlatformParam(bundleUrl, currentPlatform(this.globalObject))
      );
      if (!source || !source.trim()) return;
      if (/^\s*(Error|SyntaxError|TypeError|ReferenceError):/.test(source.slice(0, 200))) {
        devInfo(this.globalObject, '[rayact:hmr] dev bundle unavailable, loading modules individually');
        return;
      }
      // eslint-disable-next-line no-eval
      (0, eval)(source);
      const count = this.globalObject.__rayactModuleDefinitions?.size ?? 0;
      devInfo(this.globalObject, `[rayact:hmr] dev bundle loaded (${count} modules)`);
    } catch (error) {
      devInfo(
        this.globalObject,
        '[rayact:hmr] dev bundle failed, loading modules individually:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  markBootstrap(url: string): void {
    this.bootstrapUrls.add(normalizeModuleUrl(url));
  }

  async startFromManifest(manifest?: DevManifestModule): Promise<void> {
    if (!manifest) {
      manifest = await this.fetchManifest();
    }
    this.manifest = manifest;

    if (manifest.bootstrapUrl) {
      this.markBootstrap(manifest.bootstrapUrl);
    }

    const entryUrl = manifest.entryModuleUrl;
    if (!entryUrl) {
      throw new Error('Dev manifest missing entryModuleUrl');
    }

    await this.preloadModuleBundle(manifest.moduleBundleUrl);
    await this.loadModule(entryUrl);

    if (!this.globalObject.__RAYACT_HMR_ACTIVE__) {
      this.globalObject.__RAYACT_HMR_ACTIVE__ = true;
    }

    this.connectHmr(manifest.hmrUrl);
  }

  async fetchManifest(): Promise<DevManifestModule> {
    const g = this.globalObject as GlobalHmr & { __RAYACT_DEV_MANIFEST__?: DevManifestModule };
    if (g.__RAYACT_DEV_MANIFEST__) {
      return g.__RAYACT_DEV_MANIFEST__;
    }
    const text = await this.devFetchText(withPlatformParam(
      `${this.serverUrl}/rayact/manifest.json`,
      currentPlatform(this.globalObject)
    ));
    return JSON.parse(text) as DevManifestModule;
  }

  loadModuleSync(moduleUrl: string): unknown {
    const key = normalizeModuleUrl(moduleUrl);
    const registry = this.globalObject.__rayactModuleRegistry!;
    const loading = this.globalObject.__rayactModuleLoading!;

    if (registry.has(key)) {
      return registry.get(key)!();
    }

    // Present in the dev bundle but not yet executed: run it now (which
    // registers it) instead of going back to the network.
    const definitions = this.globalObject.__rayactModuleDefinitions;
    const define = definitions?.get(key);
    if (define) {
      definitions!.delete(key);
      define();
      const built = registry.get(key);
      if (built) return built();
    }

    const pending = loading.get(key);
    if (pending) {
      throw new Error(`Circular or async module dependency while loading ${key}`);
    }

    const fetchUrl = withPlatformParam(
      toRayactModuleUrl(moduleUrl, this.serverUrl),
      currentPlatform(this.globalObject)
    );
    const parsed = parseUrlParts(fetchUrl);
    if (parsed.pathname === '/rayact/resolve') {
      const spec = getQueryParam(parsed.search, 'spec') ?? '';
      const vendor = getVendorNamespace(this.globalObject, spec);
      if (vendor) return vendor;
    }

    const source = this.devFetchTextSync(fetchUrl);
    this.evalModule(key, source);
    return registry.get(key)?.() ?? null;
  }

  /**
   * Promise-returning load for `await import()`.
   *
   * Unlike loadModule, this never falls straight through to loadModuleSync on
   * native: it checks the in-flight map first, so importing a module that is
   * already being loaded resolves against that load rather than throwing
   * "Circular or async module dependency". Only a genuinely cold module takes
   * the sync fetch path, which is what native has to use anyway.
   */
  loadModuleDynamic(moduleUrl: string): Promise<unknown> {
    const key = normalizeModuleUrl(moduleUrl);
    const registry = this.globalObject.__rayactModuleRegistry!;
    const loading = this.globalObject.__rayactModuleLoading!;

    if (registry.has(key)) {
      return Promise.resolve(registry.get(key)!());
    }

    // Present in the dev bundle but not yet executed: run it now (which
    // registers it) instead of going back to the network.
    const definitions = this.globalObject.__rayactModuleDefinitions;
    const define = definitions?.get(key);
    if (define) {
      definitions!.delete(key);
      define();
      const built = registry.get(key);
      if (built) return Promise.resolve(built());
    }

    const pending = loading.get(key);
    if (pending) return Promise.resolve(pending);

    if (typeof this.globalObject.__rayactDevFetch === 'function') {
      try {
        return Promise.resolve(this.loadModuleSync(moduleUrl));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return this.loadModule(moduleUrl);
  }

  async loadModule(moduleUrl: string): Promise<unknown> {
    if (typeof this.globalObject.__rayactDevFetch === 'function') {
      return this.loadModuleSync(moduleUrl);
    }

    const key = normalizeModuleUrl(moduleUrl);
    const registry = this.globalObject.__rayactModuleRegistry!;
    const loading = this.globalObject.__rayactModuleLoading!;

    if (registry.has(key)) {
      return registry.get(key)!();
    }

    // Present in the dev bundle but not yet executed: run it now (which
    // registers it) instead of going back to the network.
    const definitions = this.globalObject.__rayactModuleDefinitions;
    const define = definitions?.get(key);
    if (define) {
      definitions!.delete(key);
      define();
      const built = registry.get(key);
      if (built) return built();
    }

    const pending = loading.get(key);
    if (pending) return pending;

    const task = (async () => {
      const fetchUrl = withPlatformParam(
        toRayactModuleUrl(moduleUrl, this.serverUrl),
        currentPlatform(this.globalObject)
      );
      const parsed = parseUrlParts(fetchUrl);
      if (parsed.pathname === '/rayact/resolve') {
        const spec = getQueryParam(parsed.search, 'spec') ?? '';
        const vendor = getVendorNamespace(this.globalObject, spec);
        if (vendor) return vendor;
      }
      const source = await this.devFetchText(fetchUrl);
      this.evalModule(key, source);
      return registry.get(key)?.() ?? null;
    })();

    loading.set(key, task);
    try {
      return await task;
    } finally {
      loading.delete(key);
    }
  }

  applyModuleUpdate(path: string, source: string): void {
    const absolute = path.startsWith('http')
      ? path
      : `${this.serverUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const key = normalizeModuleUrl(toRayactModuleUrl(absolute, this.serverUrl));
    if (this.bootstrapUrls.has(key)) {
      this.globalObject.console?.warn?.('[rayact:hmr] ignoring bootstrap module update', key);
      return;
    }
    this.globalObject.__rayactModuleRegistry?.delete(key);
    this.globalObject.__rayactModuleLoading?.delete(key);
    // Drop any unexecuted dev-bundle copy of this module, or a later require
    // would resurrect the source this update replaces.
    this.globalObject.__rayactModuleDefinitions?.delete(key);
    this.evalModule(key, source);
    this.performRefresh();
  }

  private evalModule(moduleUrl: string, source: string): void {
    const g = this.globalObject;
    const previousRequire = g.__rayactRequire;
    const previousRequireAsync = g.__rayactRequireAsync;
    const previousRegister = g.__rayactRegisterModule;
    try {
      // Register before eval so Sources always reflects the exact transformed
      // module in memory, including an HMR replacement. Native targets expose
      // this as a no-op-free development bridge; web simply omits it.
      g.__rayactRegisterDebugScript?.(moduleUrl, source);
      // eslint-disable-next-line no-eval
      (0, eval)(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.bridge?.showError?.(`Module eval failed: ${moduleUrl}\n${message}`, stack);
      throw error;
    } finally {
      g.__rayactRequire = previousRequire;
      g.__rayactRequireAsync = previousRequireAsync;
      g.__rayactRegisterModule = previousRegister;
    }
  }

  private performRefresh(): void {
    try {
      this.globalObject.__REACT_REFRESH__?.performReactRefresh();
      // The update applied — drop any error overlay left over from a previous
      // broken save, so editing the code back to working restores the app.
      this.bridge?.clearError?.();
    } catch (error) {
      this.globalObject.console?.error?.('[rayact:hmr] refresh failed', error);
    }
  }

  private connectHmr(hmrUrl?: string): void {
    // The host's native HMR client (ProjectHmrClient) already owns the socket
    // and applies updates through __rayactApplyModuleUpdate. Opening a second,
    // JS-side socket (possible now that WebSocket is real on mobile) applied
    // every js-update twice — an entry-module edit then ran the entry's
    // side effects twice concurrently, which could wedge the app.
    if (this.globalObject.__RAYACT_NATIVE_HMR__) {
      devInfo(this.globalObject, '[rayact:hmr] native transport owns the socket — JS client idle');
      return;
    }
    const WebSocketCtor = this.globalObject.WebSocket;
    if (typeof WebSocketCtor !== 'function') {
      devInfo(this.globalObject, '[rayact:hmr] WebSocket unavailable — native transport expected');
      return;
    }

    const url = hmrUrl ?? this.serverUrl.replace(/^http/, 'ws') + '/rayact/hmr';
    if (this.hmrSocket) return;

    devInfo(this.globalObject, `[rayact:hmr] connecting ${url}`);
    this.hmrSocket = new WebSocketCtor(url);

    this.hmrSocket.onopen = () => {
      devInfo(this.globalObject, '[rayact:hmr] connected');
    };

    this.hmrSocket.onclose = () => {
      this.globalObject.console?.warn?.('[rayact:hmr] disconnected');
      this.hmrSocket = null;
      this.hmrReconnect = setTimeout(() => this.connectHmr(url), 1000);
    };

    this.hmrSocket.onerror = event => {
      this.globalObject.console?.warn?.('[rayact:hmr] socket error', event);
    };

    this.hmrSocket.onmessage = event => {
      void this.handleHmrMessage(String(event.data));
    };
  }

  private async handleHmrMessage(raw: string): Promise<void> {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = message.type;
    if (type === 'server:hello') return;

    if (type === 'full-reload' || type === 'reload') {
      await this.reloadEntry();
      return;
    }

    if (type === 'build:error' || type === 'error') {
      const payload = (message.payload ?? message.err ?? message) as { message?: string; stack?: string };
      this.bridge?.showError?.(payload.message ?? 'Build error', payload.stack);
      return;
    }

    if (type === 'update') {
      const updates = message.updates as Array<{ type?: string; path?: string; timestamp?: number }> | undefined;
      if (!updates?.length) return;
      // An uncaught render error tears down the React root, and Fast Refresh
      // cannot revive a crashed fiber root — a partial update would apply to a
      // tree that no longer renders, leaving the error screen up forever. Once
      // the app is in a failed state, escalate the next update to a full entry
      // reload (the same thing Metro does after a red box).
      if (this.bridge?.hasError?.()) {
        this.globalObject.console?.info?.('[rayact:hmr] app is in an error state — full reload instead of hot update');
        await this.reloadEntry();
        return;
      }
      for (const update of updates) {
        if (update.type !== 'js-update' || !update.path) continue;
        const path = update.path.split(/[?#]/, 1)[0];
        if (!path) continue;
        const moduleUrl = `${this.serverUrl}${path}${update.timestamp ? `?t=${update.timestamp}` : ''}`;
        try {
          const source = await this.devFetchText(toRayactModuleUrl(moduleUrl, this.serverUrl));
          this.applyModuleUpdate(path, source);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.globalObject.console?.error?.('[rayact:hmr] module update failed', path, error);
          // Silent hot-update failures are indistinguishable from "HMR is
          // broken": the file saves, nothing changes on screen, nothing is
          // reported. Put it on the error overlay like a build error.
          this.bridge?.showError?.(
            `Hot update failed for ${path}\n${message}`,
            error instanceof Error ? error.stack : undefined
          );
        }
      }
      return;
    }

    if (type === 'hmr-update') {
      // Legacy revision broadcast — module mode ignores full bundle reloads.
      devInfo(this.globalObject, '[rayact:hmr] ignoring legacy hmr-update (module mode)');
    }
  }

  private async reloadEntry(): Promise<void> {
    const entryUrl = this.manifest.entryModuleUrl;
    if (!entryUrl) return;
    const key = normalizeModuleUrl(entryUrl);
    this.globalObject.__rayactModuleRegistry?.delete(key);
    this.globalObject.__rayactModuleLoading?.delete(key);
    // Re-evaluating the entry calls render() again, which rebuilds the React
    // root from scratch — the only way back from a crashed tree.
    await this.loadModule(entryUrl);
    this.performRefresh();
    this.bridge?.clearError?.();
  }

  private devFetchTextSync(url: string): string {
    const g = this.globalObject;
    if (typeof g.__rayactDevFetch !== 'function') {
      throw new Error('Sync module load requires __rayactDevFetch()');
    }
    return assertModuleSource(g.__rayactDevFetch(url), url);
  }

  private async devFetchText(url: string): Promise<string> {
    const g = this.globalObject;
    let text: string;
    if (typeof g.__rayactDevFetch === 'function') {
      text = g.__rayactDevFetch(url);
    } else {
      const fetchFn = g.fetch;
      if (typeof fetchFn !== 'function') {
        throw new Error('Rayact module HMR requires fetch() or __rayactDevFetch()');
      }
      const response = await fetchFn(url) as { text(): Promise<string>; ok?: boolean; status?: number };
      text = await response.text();
      if (response.ok === false) {
        throw new Error(`Module fetch failed (${response.status}) for ${url}: ${text.slice(0, 200)}`);
      }
    }
    return assertModuleSource(text, url);
  }

  disconnect(): void {
    if (this.hmrReconnect) {
      clearTimeout(this.hmrReconnect);
      this.hmrReconnect = null;
    }
    if (this.hmrSocket) {
      this.hmrSocket.close();
      this.hmrSocket = null;
    }
  }
}

export function installModuleHmrRuntime(options: ModuleHmrOptions): ModuleHmrRuntime {
  return new ModuleHmrRuntime(options);
}

export function normalizeModuleExport(value: unknown): unknown {
  if (value == null) return value;
  const t = typeof value;
  if (t !== 'object' && t !== 'function') return value;
  const mod = value as Record<string, unknown>;
  // CJS interop: `module.exports = fn` / `= {...}` has no `default` binding, so a
  // default import (`import x from 'cjs'`, transformed to `mod.default`) resolves
  // to undefined — e.g. use-latest-callback's function default → "not a function".
  // ESM modules already expose `default`, so only synthesize it for CJS.
  if (!('default' in mod)) {
    if (t === 'function') {
      (mod as { default?: unknown }).default = mod;
      return mod;
    }
    return { ...mod, default: mod };
  }
  const def = mod.default;
  if (def && typeof def === 'object') {
    return { ...(def as Record<string, unknown>), ...mod };
  }
  return mod;
}

export function normalizeModuleUrl(url: string): string {
  const { pathname, search } = parseUrlParts(url);
  return pathname + search;
}

export function resolveModuleUrl(specifier: string, fromUrl: string, serverUrl: string): string {
  if (specifier.startsWith('http://') || specifier.startsWith('https://')) {
    return specifier;
  }
  if (specifier.startsWith('/@fs/') || specifier.startsWith('/@id/') || specifier.startsWith('/src/')) {
    return `${serverUrl}/rayact/m${specifier}`;
  }
  if (specifier.startsWith('/')) {
    return `${serverUrl}/rayact/m${specifier}`;
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const from = fromUrl || '/';
    return `${serverUrl}/rayact/resolve?spec=${encodeURIComponent(specifier)}&from=${encodeURIComponent(from)}`;
  }
  const from = fromUrl || '/';
  return `${serverUrl}/rayact/resolve?spec=${encodeURIComponent(specifier)}&from=${encodeURIComponent(from)}`;
}

export function toRayactModuleUrl(moduleUrl: string, serverUrl: string): string {
  const absolute = moduleUrl.startsWith('http') ? moduleUrl : `${serverUrl}${moduleUrl.startsWith('/') ? '' : '/'}${moduleUrl}`;
  const parsed = parseUrlParts(absolute);
  const vendor = vendorSpecifierFromResolvedPath(parsed.pathname);
  if (vendor) {
    return `${serverUrl.replace(/\/+$/, '')}/rayact/resolve?spec=${encodeURIComponent(vendor)}`;
  }
  if (parsed.pathname === '/rayact/entry.js' || parsed.pathname === '/rayact/resolve') {
    return absolute;
  }
  if (parsed.pathname.startsWith('/rayact/m/')) {
    return absolute;
  }
  const path = `/rayact/m${parsed.pathname}${parsed.search}`;
  return `${serverUrl.replace(/\/+$/, '')}${path}`;
}
