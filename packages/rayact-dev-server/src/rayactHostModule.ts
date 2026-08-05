import type { Connect, ViteDevServer } from 'vite';
import type { ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { getMinifiedCssFile } from './cssMinify.js';

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function toNativeCssPath(filePath: string, root: string): string {
  const relative = normalizePath(path.relative(root, filePath));
  return relative.startsWith('..') ? normalizePath(filePath) : `./${relative}`;
}

/**
 * Development CSS module: the stylesheet TEXT is inlined into the JS module.
 *
 * importCSS() resolves against the DEVICE filesystem, where the project only
 * exists in a bundled build — on a dev-server device it silently produced zero
 * classes and the app rendered completely unstyled with no diagnostic. The
 * server has the file right here, so embed it and parse on-device with
 * importCSSText. This also sidesteps path problems a fetch-based scheme has
 * with `file:`-linked packages, whose real paths live outside the project root.
 * HMR is unaffected: editing the file invalidates this module and the js-update
 * re-serves it with the fresh text. Returns null if the file cannot be read
 * (caller falls back to the importCSS path, which at least names the file).
 */
export function rayactCssInlineModule(cssFile: string, nativePath: string): string | null {
  // Minify even in dev: the text is inlined into the module as a string literal
  // and handed straight to the engine's parser, and there is no CSS inspector on
  // the native targets, so nothing is lost by shipping it compact.
  //
  // Served from the cache the dev server primes at launch and refreshes from the
  // file watcher, so a request is a hit rather than a fresh read + minify.
  const minified = getMinifiedCssFile(cssFile);
  if (!minified) return null;
  const cssText = minified.css;
  const baseDir = nativePath.slice(0, Math.max(0, nativePath.lastIndexOf('/'))) || '.';
  // ESM so Rollup IIFE bootstrap can rewrite it; module-HMR converts via wrapRayactModule.
  return [
    `var __cssText = ${JSON.stringify(cssText)};`,
    'var cssClasses = typeof globalThis.importCSSText === "function"',
    `  ? globalThis.importCSSText(__cssText, ${JSON.stringify(baseDir)})`,
    `  : (globalThis.importCSS ? globalThis.importCSS(${JSON.stringify(nativePath)}) : {});`,
    'export default cssClasses;'
  ].join('\n');
}

async function transformRayactModule(
  vite: ViteDevServer,
  modulePath: string,
  query: string
): Promise<{ code: string; map?: unknown } | null> {
  const viteId = toViteTransformId(modulePath);
  if (viteId.includes('\0')) {
    if (viteId.startsWith('\0rayact-css:') && viteId.endsWith('.js')) {
      const parsed = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
      if (parsed.get('platform') === 'web') {
        return { code: 'export default {};' };
      }
      const encoded = viteId.slice('\0rayact-css:'.length, -'.js'.length);
      const cssFile = decodeURIComponent(encoded);
      const nativePath = toNativeCssPath(cssFile, vite.config.root);
      const inlined = rayactCssInlineModule(cssFile, nativePath);
      return {
        code: inlined ?? [
          `var cssClasses = globalThis.importCSS ? globalThis.importCSS(${JSON.stringify(nativePath)}) : {};`,
          'export default cssClasses;'
        ].join('\n')
      };
    }
    if (viteId === '\0virtual:rayact-refresh-runtime') {
      return {
        code: [
          `const __refresh = __require("react-refresh/runtime", __moduleUrl);`,
          `const RefreshRuntime = __refresh.default || __refresh;`,
          `if (!globalThis.__REACT_REFRESH__) {`,
          `  RefreshRuntime.injectIntoGlobalHook(globalThis);`,
          `  globalThis.__REACT_REFRESH__ = RefreshRuntime;`,
          `}`,
          `globalThis.$RefreshSig$ = function() {`,
          `  var rt = globalThis.__REACT_REFRESH__ || RefreshRuntime;`,
          `  return rt ? rt.createSignatureFunctionForTransform() : function(type) { return type; };`,
          `};`
        ].join('\n')
      };
    }
    if (viteId === '\0virtual:rayact-react-devtools-backend') {
      const container = vite.pluginContainer as any;
      const loaded = await container.load(viteId, { ssr: true });
      const loadedCode = typeof loaded === 'string' ? loaded : loaded?.code;
      if (!loadedCode) return null;
      return {
        code: loadedCode.replace(
          /import\s+\*\s+as\s+ReactDevToolsBackendModule\s+from\s+['"]react-devtools-core['"];?/,
          'const ReactDevToolsBackendModule = __require("react-devtools-core", __moduleUrl);'
        )
      };
    }
    const container = vite.pluginContainer as any;
    const loaded = await container.load(viteId, { ssr: true });
    const loadedCode = typeof loaded === 'string' ? loaded : loaded?.code;
    if (!loadedCode) return null;

    // Asset virtual modules are already complete, tiny modules. Running them
    // through Vite's transform pipeline can race dependency optimization and
    // produce "new version of the pre-bundle" 500s. Keep their runtime import
    // in the synchronous form understood by wrapRayactModule instead.
    if (viteId.startsWith('\0rayact-asset:')) {
      return {
        code: loadedCode.replace(
          /import\s+\{\s*createAsset\s*\}\s+from\s+['"]rayact\/runtime['"];?/,
          'const { createAsset } = __require("rayact/runtime", __moduleUrl);'
        )
      };
    }
    const transformed = await container.transform(loadedCode, viteId, { ssr: true });
    const code = typeof transformed === 'string' ? transformed : transformed?.code ?? loadedCode;
    return { code, map: transformed && typeof transformed !== 'string' ? transformed.map : undefined };
  }
  return vite.transformRequest(`${viteId}${query}`, { ssr: true });
}

// Sources must use the same in-memory Vite transform evaluated by QuickJS.
// Keep Vite's sourcesContent in an inline map so the CDP frontend never needs
// to reach back to the project filesystem (and HMR revisions remain exact).
function withInlineSourceMap(code: string, map: unknown): string {
  if (!map || /sourceMappingURL=/.test(code)) return code;
  try {
    const json = JSON.stringify(map);
    return `${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(json).toString('base64')}`;
  } catch {
    return code;
  }
}

function toViteTransformId(modulePath: string): string {
  const path = modulePath.split('?')[0] ?? modulePath;
  if (path.startsWith('/@id/__x00__')) {
    return `\0${decodeURIComponent(path.slice('/@id/__x00__'.length))}`;
  }
  if (path.startsWith('/@id/')) {
    return decodeURIComponent(path.slice('/@id/'.length));
  }
  return path;
}

// The `from` (importer) a client sends is the module's serving URL form
// (/@fs/<abs>, /@id/<virtual>, /src/...). vite's resolveId needs the real
// importer id, so a relative require (e.g. react-refresh/runtime.js requiring
// './cjs/...') can be resolved against the importer's actual directory.
function toViteImporter(from: string, root: string): string | undefined {
  if (!from) return undefined;
  if (from.startsWith('/@fs/')) return from.slice('/@fs'.length);
  if (from.startsWith('/@id/')) return toViteTransformId(from);
  if (from.startsWith('/node_modules/') || from.startsWith('/src/')) {
    return path.join(root, from.slice(1));
  }
  return from;
}

/** Strip Vite SSR top-level await imports for QuickJS sync eval. */
export function convertViteSsrToRayactSync(code: string, moduleUrl: string): string {
  let out = code;
  out = out.replace(
    /const\s+(__vite_ssr_import_\d+__)\s*=\s*await\s+__vite_ssr_import__\(\s*("(?:\\.|[^"\\])+")(?:,\s*\{[^}]*\})?\s*\)/g,
    'const $1 = __require($2, __moduleUrl)'
  );
  out = out.replace(
    /await\s+__vite_ssr_import__\(\s*("(?:\\.|[^"\\])+")(?:,\s*\{[^}]*\})?\s*\)/g,
    '__require($1, __moduleUrl)'
  );
  // vite emits `const __vite_ssr_export_default__ = <expr>;` for `export default`.
  // wrapRayactModule already declares `var __vite_ssr_export_default__`, so a second
  // `const` would be a redeclaration SyntaxError — but stripping the whole line
  // loses the assignment and leaves the default export undefined (e.g.
  // use-latest-callback's default → "not a function"). Drop only the `const`.
  out = out.replace(/^(\s*)const\s+(__vite_ssr_export_default__\s*=)/gm, '$1$2');
  out = out.replace(/\brequire\s*\(\s*("(?:\\.|[^"\\])+")\s*\)/g, '__require($1, __moduleUrl)');
  out = out.replace(/\brequire\s*\(\s*('(?:\\.|[^'\\])+')\s*\)/g, '__require($1, __moduleUrl)');
  out = out.replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, '');
  out = out.replace(
    /export\s+\{\s*([^}]+)\s*\}\s+from\s+("(?:\\.|[^"\\])+")\s*;?/g,
    (_, names, spec) => {
      const tmp = `__reexport_${Math.random().toString(36).slice(2, 8)}__`;
      const lines = [`var ${tmp} = __require(${spec}, __moduleUrl);`];
      for (const entry of names.split(',')) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const asIdx = trimmed.indexOf(' as ');
        const local = (asIdx >= 0 ? trimmed.slice(0, asIdx) : trimmed).trim();
        const exported = (asIdx >= 0 ? trimmed.slice(asIdx + 4) : trimmed).trim();
        lines.push(
          `Object.defineProperty(exports, ${JSON.stringify(exported)}, { enumerable: true, get: function() { return ${tmp}[${JSON.stringify(local)}]; } });`
        );
      }
      return lines.join('\n');
    }
  );
  out = out.replace(
    /export\s+\*\s+from\s+("(?:\\.|[^"\\])+")\s*;?/g,
    '__vite_ssr_exportAll__(__require($1, __moduleUrl));'
  );
  out = out.replace(/export\s+default\s+/g, 'exports.default = ');
  out = out.replace(/export\s+\{\s*([^}]+)\s*\}\s*;?/g, (_, names) => {
    const lines: string[] = [];
    for (const entry of names.split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const asIdx = trimmed.indexOf(' as ');
      const local = (asIdx >= 0 ? trimmed.slice(0, asIdx) : trimmed).trim();
      const exported = (asIdx >= 0 ? trimmed.slice(asIdx + 4) : trimmed).trim();
      lines.push(
        `Object.defineProperty(exports, ${JSON.stringify(exported)}, { enumerable: true, get: function() { return ${local}; } });`
      );
    }
    return lines.join('\n');
  });
  if (moduleUrl && out.includes('__moduleUrl')) {
    out = out.replace(/__moduleUrl/g, JSON.stringify(moduleUrl));
  }
  return out;
}

/** Wrap Vite SSR-transformed module code for QuickJS eval + registry. */
export function wrapRayactModule(registryKey: string, code: string, moduleUrl?: string): string {
  const resolveUrl = moduleUrl ?? registryKey.split('?')[0] ?? registryKey;
  const body = convertViteSsrToRayactSync(code, resolveUrl);
  return [
    '(function(){',
    'var exports={};',
    'var module={exports:exports};',
    `var __moduleUrl=${JSON.stringify(resolveUrl)};`,
    'var __require=globalThis.__rayactRequire;',
    'var require=function(id){return __require(id,__moduleUrl);};',
    'var __vite_ssr_export_default__;',
    'var __vite_ssr_import_meta__={url:__moduleUrl,env:{}};',
    // Declared (not assigned) so it hoists above the body: ssrTransform may emit
    // the call before this line in source order.
    'function __vite_ssr_dynamic_import__(id) {',
    '  try {',
    '    var loadAsync = globalThis.__rayactRequireAsync;',
    '    return Promise.resolve(loadAsync ? loadAsync(id, __moduleUrl) : __require(id, __moduleUrl));',
    '  } catch (e) { return Promise.reject(e); }',
    '}',
    'function __vite_ssr_exportName__(name, getter) {',
    '  Object.defineProperty(exports, name, { enumerable: true, get: getter });',
    '}',
    'function __vite_ssr_exportAll__(source) {',
    '  for (var key in source) {',
    '    if (key === "default" || key === "__esModule") continue;',
    '    if (Object.prototype.hasOwnProperty.call(source, key)) {',
    '      Object.defineProperty(exports, key, { enumerable: true, get: function() { return source[key]; } });',
    '    }',
    '  }',
    '}',
    body,
    `globalThis.__rayactRegisterModule(${JSON.stringify(registryKey)},function(){return module.exports;});`,
    '})();'
  ].join('\n');
}

/**
 * The exact text `/rayact/m/<path>` serves for one module, or null when it does
 * not resolve. Shared by the module middleware and the dev bundler so a bundled
 * module and a lazily-fetched one can never drift apart.
 */
export async function renderRayactModule(
  vite: ViteDevServer,
  modulePath: string,
  query: string
): Promise<string | null> {
  const result = await transformRayactModule(vite, modulePath, query);
  if (!result?.code) return null;
  const registryKey = `/rayact/m${modulePath}${query}`;
  return wrapRayactModule(registryKey, withInlineSourceMap(result.code, result.map), modulePath);
}

/**
 * Render the entry's whole module graph into one script.
 *
 * The device's loader is registry-first: `loadModuleSync` returns a registered
 * module and only fetches on a miss. Walking the graph therefore costs one
 * blocking request per module — 241 of them for a real app, which is what makes
 * a cold start slow. This emits every module the entry can reach as a
 * `__rayactDefineModule(key, fn)` call, so the device does one request and every
 * `__require` after that is a local lookup.
 *
 * Each module is wrapped, not executed: `wrapRayactModule` produces an IIFE that
 * runs the body immediately and registers the finished exports, so concatenating
 * those directly would execute every module eagerly in emission order, reordering
 * side effects and breaking cycles. Deferring them behind `__rayactDefineModule`
 * keeps today's lazy, dependency-driven execution order exactly as it is.
 */
export async function buildRayactDevBundle(
  vite: ViteDevServer,
  entryModulePath: string,
  query: string,
  opts: { budgetMs?: number } = {}
): Promise<{ code: string; moduleCount: number; skipped: number }> {
  const budgetMs = opts.budgetMs ?? 120_000;
  const start = Date.now();
  const seen = new Set<string>();
  const parts: string[] = [];
  let skipped = 0;

  // Walk device-facing module URLs (node.url is the same form the device asks
  // for), starting from the entry's own transform so the graph root exists.
  await transformRayactModule(vite, entryModulePath, query).catch(() => {});
  const wantFile = entryModulePath.replace(/^\//, '').split('?')[0];
  let entry: import('vite').ModuleNode | undefined;
  for (const node of vite.moduleGraph.idToModuleMap.values()) {
    if (node.file && normalizePath(node.file).endsWith(wantFile)) { entry = node; break; }
  }

  const queue: import('vite').ModuleNode[] = entry ? [entry] : [];
  while (queue.length && Date.now() - start < budgetMs) {
    const node = queue.shift();
    if (!node || !node.url) continue;
    // `node.url` can already carry a query (vite appends its own, and the entry
    // arrives with ?platform=…). The middleware always builds its registry key
    // from a query-less path plus the platform query, so strip it here or the
    // key ends up doubled and never matches what the device asks for.
    const modulePath = node.url.split('?')[0] ?? node.url;
    if (!modulePath || seen.has(modulePath)) continue;
    seen.add(modulePath);
    let rendered: string | null = null;
    try {
      rendered = await renderRayactModule(vite, modulePath, query);
    } catch {
      rendered = null;
    }
    if (rendered) {
      parts.push(
        `globalThis.__rayactDefineModule(${JSON.stringify(`/rayact/m${modulePath}${query}`)},` +
          `function(){\n${rendered}\n});`
      );
    } else {
      // Not fatal: anything omitted here is still reachable through the normal
      // per-module fetch, so the bundle degrades to today's behaviour.
      skipped += 1;
    }
    for (const dep of node.ssrImportedModules) {
      const depPath = dep?.url?.split('?')[0];
      if (depPath && !seen.has(depPath)) queue.push(dep);
    }
  }

  return { code: parts.join('\n'), moduleCount: parts.length, skipped };
}

// Pre-transform the entry's whole SSR module graph so the first device connect
// hits Vite's warm transform cache instead of cold-compiling hundreds of
// modules on demand (each an in-order blocking fetch on the device — that was
// the "several minutes to open" / "dev server timeout" symptom). Runs in the
// background after startup; concurrency-limited and time-budgeted so it never
// blocks serving. Returns the number of modules warmed.
export async function warmRayactModuleGraph(
  vite: ViteDevServer,
  entryModulePath: string,
  query: string,
  opts: { concurrency?: number; budgetMs?: number } = {}
): Promise<number> {
  const concurrency = opts.concurrency ?? 12;
  const budgetMs = opts.budgetMs ?? 90_000;
  const start = Date.now();
  const seen = new Set<string>();
  // Prime the entry through the exact transform the device will request so the
  // graph root and its immediate edges are populated.
  await transformRayactModule(vite, entryModulePath, query).catch(() => {});
  const wantFile = entryModulePath.replace(/^\//, '').split('?')[0];
  let entry: import('vite').ModuleNode | undefined;
  for (const node of vite.moduleGraph.idToModuleMap.values()) {
    if (node.file && normalizePath(node.file).endsWith(wantFile)) { entry = node; break; }
  }
  const queue: import('vite').ModuleNode[] = entry ? [entry] : [];
  const worker = async () => {
    while (queue.length && Date.now() - start < budgetMs) {
      const node = queue.shift();
      if (!node || !node.id || seen.has(node.id)) continue;
      seen.add(node.id);
      try { await vite.transformRequest(node.id, { ssr: true }); } catch { /* keep warming the rest */ }
      for (const dep of node.ssrImportedModules) {
        if (dep && dep.id && !seen.has(dep.id)) queue.push(dep);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return seen.size;
}

/**
 * Module errors go back as an `Error:`-prefixed body, not a bare sentence.
 *
 * The device fetches modules through a synchronous shim that only returns text
 * — it never sees the status code. A body like `Cannot resolve ./x from /y`
 * was therefore handed to `eval()` as if it were module source, which turned a
 * mistyped import into a meaningless SyntaxError (or, on Android, a crash).
 * ModuleHmrRuntime treats a leading `Error:` as a failed load and shows it.
 */
function sendModuleError(
  res: ServerResponse,
  status: number,
  tag: string,
  message: string,
  hint?: string
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`Error: [rayact:${tag}] ${message}${hint ? `\n${hint}` : ''}`);
}

export function createRayactModuleMiddleware(
  getVite: () => ViteDevServer | null
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/rayact/m/') && !url.startsWith('/rayact/resolve')) return next();

    const vite = getVite();
    if (!vite) {
      sendModuleError(res, 503, 'module', 'Vite dev server not ready');
      return;
    }

    if (url.startsWith('/rayact/resolve')) {
      const parsed = new URL(url, 'http://rayact.local');
      const spec = parsed.searchParams.get('spec') ?? '';
      const from = parsed.searchParams.get('from') ?? '';
      if (!spec) {
        sendModuleError(res, 400, 'resolve', 'missing spec');
        return;
      }
      try {
        const resolved = await vite.pluginContainer.resolveId(spec, toViteImporter(from, vite.config.root), { ssr: true });
        const id = typeof resolved === 'string' ? resolved : resolved?.id;
        if (!id) {
          sendModuleError(
            res,
            404,
            'resolve',
            `Cannot resolve ${JSON.stringify(spec)}${from ? ` from ${from}` : ''}`,
            spec.startsWith('.')
              ? 'Check the path and extension, or that the file exists on disk.'
              : 'Install the package, or check the spelling of the import.'
          );
          return;
        }
        const result = await vite.transformRequest(id, { ssr: true });
        if (!result?.code) {
          sendModuleError(res, 404, 'resolve', `${spec} resolved to ${id} but produced no code`);
          return;
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 200;
        const registryKey = `/rayact/resolve?spec=${encodeURIComponent(spec)}&from=${encodeURIComponent(from)}`;
        res.end(wrapRayactModule(registryKey, withInlineSourceMap(result.code, result.map), id));
      } catch (error) {
        sendModuleError(
          res,
          500,
          'resolve',
          error instanceof Error ? error.stack ?? error.message : String(error)
        );
      }
      return;
    }

    const modulePath = url.slice('/rayact/m'.length).split('?')[0] ?? '/';
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';

    try {
      const rendered = await renderRayactModule(vite, modulePath, query);
      if (!rendered) {
        sendModuleError(
          res,
          404,
          'module',
          `Module not found: ${modulePath}`,
          'The importer references a file that does not exist under the project root.'
        );
        return;
      }

      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 200;
      res.end(rendered);
    } catch (error) {
      sendModuleError(
        res,
        500,
        'module',
        error instanceof Error ? error.stack ?? error.message : String(error)
      );
    }
  };
}
