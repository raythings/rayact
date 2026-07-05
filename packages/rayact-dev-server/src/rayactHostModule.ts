import type { Connect, ViteDevServer } from 'vite';
import path from 'node:path';

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

export function createRayactModuleMiddleware(
  getVite: () => ViteDevServer | null
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/rayact/m/') && !url.startsWith('/rayact/resolve')) return next();

    const vite = getVite();
    if (!vite) {
      res.statusCode = 503;
      res.end('Vite dev server not ready');
      return;
    }

    if (url.startsWith('/rayact/resolve')) {
      const parsed = new URL(url, 'http://rayact.local');
      const spec = parsed.searchParams.get('spec') ?? '';
      const from = parsed.searchParams.get('from') ?? '';
      if (!spec) {
        res.statusCode = 400;
        res.end('missing spec');
        return;
      }
      try {
        const resolved = await vite.pluginContainer.resolveId(spec, toViteImporter(from, vite.config.root), { ssr: true });
        const id = typeof resolved === 'string' ? resolved : resolved?.id;
        if (!id) {
          res.statusCode = 404;
          res.end('unresolved');
          return;
        }
        const result = await vite.transformRequest(id, { ssr: true });
        if (!result?.code) {
          res.statusCode = 404;
          res.end('Module not found');
          return;
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 200;
        const registryKey = `/rayact/resolve?spec=${encodeURIComponent(spec)}&from=${encodeURIComponent(from)}`;
        res.end(wrapRayactModule(registryKey, result.code, id));
      } catch (error) {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.stack ?? error.message : String(error));
      }
      return;
    }

    const modulePath = url.slice('/rayact/m'.length).split('?')[0] ?? '/';
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';

    try {
      const viteId = toViteTransformId(modulePath);
      const result = await vite.transformRequest(`${viteId}${query}`, { ssr: true });
      if (!result?.code) {
        res.statusCode = 404;
        res.end('Module not found');
        return;
      }

      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 200;
      const registryKey = `/rayact/m${modulePath}`;
      res.end(wrapRayactModule(registryKey, result.code, modulePath));
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  };
}
