import fs from 'node:fs';
import path from 'node:path';
import { isRouteFile } from '../manifest/parse.js';

// Type-only: the consumer (rayact-dev-server / the app's vite.config.ts) owns
// the vite dependency; this module must stay importable without it installed.
type VitePlugin = {
  name: string;
  enforce?: 'pre' | 'post';
  resolveId?: (id: string) => string | null;
  load?: (id: string) => string | null;
  configureServer?: (server: {
    watcher: { on(event: string, cb: (file: string) => void): void };
    moduleGraph: {
      getModuleById(id: string): unknown;
      invalidateModule(mod: never): void;
    };
    ws: { send(payload: { type: 'full-reload'; path?: string }): void };
  }) => void;
};

export const RAYACT_ROUTES_ID = 'virtual:rayact-routes';
export const RESOLVED_RAYACT_ROUTES_ID = `\0${RAYACT_ROUTES_ID}`;

export interface RayactRouterPluginOptions {
  root: string;
  /** Routes directory relative to root. Default 'app'. */
  appDir?: string;
}

const SKIP_DIRS = new Set(['node_modules', '__tests__']);

/**
 * Absolute path of the routes directory when the project uses file-based
 * routing (directory exists and contains at least one route file), else null.
 */
export function findAppDir(root: string, appDir = 'app'): string | null {
  const abs = path.resolve(root, appDir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return null;
  return scanRouteFiles(abs).length > 0 ? abs : null;
}

/** Relative context keys ('./index.tsx') of every route file, sorted. */
export function scanRouteFiles(appRoot: string): string[] {
  const keys: string[] = [];
  const walk = (dir: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel);
      } else if (entry.isFile() && isRouteFile(`./${rel}`)) {
        keys.push(`./${rel}`);
      }
    }
  };
  walk(appRoot, '');
  return keys.sort();
}

/** Source of the virtual routes manifest module (eager static imports). */
export function generateRoutesModule(appRoot: string): string {
  const keys = scanRouteFiles(appRoot);
  const normalizedRoot = appRoot.split(path.sep).join('/');
  const lines: string[] = [];
  keys.forEach((key, i) => {
    lines.push(`import * as R${i} from ${JSON.stringify(`${normalizedRoot}/${key.slice(2)}`)};`);
  });
  lines.push('export const ctx = {');
  keys.forEach((key, i) => {
    lines.push(`  ${JSON.stringify(key)}: R${i},`);
  });
  lines.push('};');
  lines.push(`export const appRoot = ${JSON.stringify(normalizedRoot)};`);
  return lines.join('\n');
}

/**
 * Vite plugin backing `virtual:rayact-routes`. Wired automatically by
 * @rayact/dev-server's createRayactViteConfig when the project has an app/
 * directory; standalone Vite users can add it to plugins themselves.
 */
export function rayactRouterPlugin(options: RayactRouterPluginOptions): VitePlugin {
  const appRoot = path.resolve(options.root, options.appDir ?? 'app');
  return {
    name: 'rayact-router',
    enforce: 'pre',
    // Module-HMR fetches can carry a ?platform= query on the id; strip it so
    // the virtual module resolves regardless of how it was addressed.
    resolveId(id) {
      return id.split('?')[0] === RAYACT_ROUTES_ID ? RESOLVED_RAYACT_ROUTES_ID : null;
    },
    load(id) {
      if (id.split('?')[0] !== RESOLVED_RAYACT_ROUTES_ID) return null;
      return generateRoutesModule(appRoot);
    },
    // Standalone-Vite dev path (browser target via plain `vite`): adding or
    // removing a route file must regenerate the manifest. The rayact dev
    // server runs with hmr disabled and re-implements this invalidation in
    // its own broadcast pipeline, so this hook is inert there.
    configureServer(server) {
      const onFileEvent = (file: string) => {
        if (!path.resolve(file).startsWith(appRoot + path.sep)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_RAYACT_ROUTES_ID);
        if (mod) server.moduleGraph.invalidateModule(mod as never);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onFileEvent);
      server.watcher.on('unlink', onFileEvent);
    },
  };
}
