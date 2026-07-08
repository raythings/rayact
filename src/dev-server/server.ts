import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { WebSocketServer } from 'ws';
import {
  buildRayactBootstrap,
  createRayactViteDevServer,
  RAYACT_ENTRY_ID,
  RAYACT_BINARY_COMMANDS,
  RAYACT_REACT_COMPILER,
  type RayactBuildOutput
} from './bundler.js';
import { loadRayactConfig } from './config.js';
import { listenWithFallback } from './listen.js';
import { advertiseRayactServer } from './mdns.js';
import { buildQrPayload } from './qr.js';
import { createRayactModuleMiddleware, wrapRayactModule } from './rayactHostModule.js';
import type { DebugMessage, RayactDevServer, RayactDevServerOptions } from './types.js';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const ENTRY_MODULE_PATH = '/rayact/entry.js';
const SUPPORTED_PLATFORMS = ['desktop', 'android', 'ios', 'web'] as const;
type DevPlatform = typeof SUPPORTED_PLATFORMS[number];

interface PlatformContext {
  platform: DevPlatform;
  bundleOptions: {
    root: string;
    entry: string;
    platform: DevPlatform;
    mode: 'development';
    minify: boolean;
    bytecode: false;
  };
  bootstrapCode: string | null;
  bootstrapError: Error | null;
  bootstrapInFlight: Promise<string> | null;
  revision: number;
  assets: RayactBuildOutput['assets'];
  vite: ViteDevServer | null;
  middleware: ReturnType<typeof createRayactModuleMiddleware> | null;
}

export function canonicalHmrPath(url: string | undefined, fallback: string): string {
  const candidate = url?.startsWith('/') ? url : fallback;
  const pathOnly = candidate.split(/[?#]/, 1)[0] || fallback;
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}

export function claimHmrBroadcast(
  claims: Map<string, number>,
  key: string,
  timestamp: number,
  windowMs = 50
): boolean {
  const previous = claims.get(key);
  if (previous !== undefined && timestamp - previous < windowMs) return false;
  claims.set(key, timestamp);
  if (claims.size > 1024) {
    for (const [claim, claimedAt] of claims) {
      if (timestamp - claimedAt >= windowMs) claims.delete(claim);
    }
  }
  return true;
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendText(response: http.ServerResponse, status: number, body: string, type = 'text/plain; charset=utf-8'): void {
  response.writeHead(status, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'cache-control': 'no-store'
  });
  response.end(body);
}

function sendBuffer(response: http.ServerResponse, status: number, body: Buffer, type: string): void {
  response.writeHead(status, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'cache-control': 'no-store'
  });
  response.end(body);
}

function getLanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap(addresses => addresses ?? [])
    .filter(address => address.family === 'IPv4' && !address.internal)
    .map(address => address.address);
}

function publicHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') {
    return getLanAddresses()[0] ?? '127.0.0.1';
  }
  return host;
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const resolved = path.resolve(candidate);
  const base = path.resolve(root);
  return resolved === base || resolved.startsWith(base + path.sep);
}

function normalizePlatform(value: string | undefined | null, fallback: DevPlatform): DevPlatform {
  return SUPPORTED_PLATFORMS.includes(value as DevPlatform) ? value as DevPlatform : fallback;
}

function platformQuery(platform: DevPlatform): string {
  return `platform=${encodeURIComponent(platform)}`;
}

function normalizeOptions(options: RayactDevServerOptions): Required<RayactDevServerOptions> {
  const config = loadRayactConfig(options.root ?? process.cwd());
  return {
    root: path.resolve(options.root ?? process.cwd()),
    host: options.host ?? config.devServer?.host ?? '0.0.0.0',
    port: options.port ?? config.devServer?.port ?? 8081,
    strictPort: options.strictPort ?? config.devServer?.strictPort ?? false,
    entry: options.entry ?? config.entry ?? 'test-projects/release-consumer-smoke/src/App.tsx',
    platform: normalizePlatform(options.platform ?? config.platform, 'desktop'),
    rayactAppKey: options.rayactAppKey ?? config.rayactAppKey ?? 'rayact-app',
    cdpPort: options.cdpPort ?? config.devServer?.cdpPort ?? 9229,
    minify: options.minify ?? false,
    bytecode: options.bytecode ?? false,
    onClientLog: options.onClientLog ?? (() => {})
  };
}

function createWsBroadcast(wss: WebSocketServer) {
  return (message: DebugMessage) => {
    const encoded = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(encoded);
    }
  };
}

export async function startRayactDevServer(rawOptions: RayactDevServerOptions): Promise<RayactDevServer> {
  const options = normalizeOptions(rawOptions);
  const nativeModules = loadRayactConfig(options.root).nativeModules ?? [];

  const server = http.createServer();
  const moduleHmrWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const debuggerWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const inspectorWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const broadcastModuleHmr = createWsBroadcast(moduleHmrWss);

  moduleHmrWss.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'connected' }));
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://rayact.local').pathname;
    const route =
      pathname === '/rayact/hmr'
        ? moduleHmrWss
        : pathname === '/rayact/debugger'
          ? debuggerWss
          : pathname === '/rayact/inspector'
            ? inspectorWss
            : null;
    if (!route) {
      socket.destroy();
      return;
    }
    route.handleUpgrade(request, socket, head, ws => {
      route.emit('connection', ws, request);
    });
  });

  const contexts = new Map<DevPlatform, PlatformContext>();
  const hmrBroadcastClaims = new Map<string, number>();

  function createPlatformContext(platform: DevPlatform): PlatformContext {
    const context: PlatformContext = {
      platform,
      bundleOptions: {
        root: options.root,
        entry: options.entry,
        platform,
        mode: 'development',
        minify: options.minify,
        bytecode: false
      },
      bootstrapCode: null,
      bootstrapError: null,
      bootstrapInFlight: null,
      revision: 1,
      assets: [],
      vite: null,
      middleware: null
    };
    contexts.set(platform, context);
    return context;
  }

  function selectPlatform(requestUrl: URL, request: http.IncomingMessage): DevPlatform {
    const query = requestUrl.searchParams.get('platform');
    const header = Array.isArray(request.headers['x-rayact-platform'])
      ? request.headers['x-rayact-platform'][0]
      : request.headers['x-rayact-platform'];
    return normalizePlatform(query ?? header, options.platform as DevPlatform);
  }

  const rebuildBootstrap = async (context: PlatformContext) => {
    if (context.bootstrapInFlight) return context.bootstrapInFlight;
    context.bootstrapInFlight = (async () => {
      try {
        context.bootstrapCode = await buildRayactBootstrap(context.bundleOptions);
        context.bootstrapError = null;
        context.revision++;
        return context.bootstrapCode;
      } catch (error) {
        context.bootstrapError = error instanceof Error ? error : new Error(String(error));
        throw context.bootstrapError;
      } finally {
        context.bootstrapInFlight = null;
      }
    })();
    return context.bootstrapInFlight;
  };

  const broadcastModuleUpdates = (context: PlatformContext, file: string, event: 'change' | 'add' | 'unlink') => {
    if (!context.vite) return;
    const root = options.root;
    const normalized = file.split(path.sep).join('/');
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel.startsWith('..')) return;

    if (event === 'unlink' || normalized.endsWith('rayact.config.json') || normalized.includes('/native/')) {
      const timestamp = Date.now();
      if (claimHmrBroadcast(hmrBroadcastClaims, `reload:${event}:${rel}`, timestamp)) {
        broadcastModuleHmr({ type: 'full-reload' });
      }
      return;
    }

    const mods = context.vite.moduleGraph.getModulesByFile(file);
    const updates = new Map<
      string,
      { type: 'js-update'; path: string; acceptedPath: string; timestamp: number }
    >();
    const timestamp = Date.now();

    if (mods?.size) {
      for (const mod of mods) {
        const hmrPath = canonicalHmrPath(mod.url, rel);
        if (claimHmrBroadcast(hmrBroadcastClaims, `${event}:${hmrPath}`, timestamp)) {
          updates.set(hmrPath, { type: 'js-update', path: hmrPath, acceptedPath: hmrPath, timestamp });
        }
      }
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(file)) {
      const hmrPath = canonicalHmrPath(undefined, rel);
      if (claimHmrBroadcast(hmrBroadcastClaims, `${event}:${hmrPath}`, timestamp)) {
        updates.set(hmrPath, { type: 'js-update', path: hmrPath, acceptedPath: hmrPath, timestamp });
      }
    }

    if (updates.size) {
      broadcastModuleHmr({ type: 'update', updates: [...updates.values()] } as DebugMessage);
    }
  };

  async function getContext(platform: DevPlatform): Promise<PlatformContext> {
    const context = contexts.get(platform) ?? createPlatformContext(platform);
    if (!context.vite) {
      context.vite = await createRayactViteDevServer(context.bundleOptions, server);
      context.middleware = createRayactModuleMiddleware(() => context.vite);
      context.vite.watcher.on('change', file => broadcastModuleUpdates(context, file, 'change'));
      context.vite.watcher.on('add', file => broadcastModuleUpdates(context, file, 'add'));
      context.vite.watcher.on('unlink', file => broadcastModuleUpdates(context, file, 'unlink'));
    }
    if (!context.bootstrapCode && !context.bootstrapError) {
      await rebuildBootstrap(context);
    }
    return context;
  }

  await getContext(options.platform as DevPlatform);

  server.on('request', (request, response) => {
    void handleRequest(request, response);
  });

  async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const platform = selectPlatform(requestUrl, request);
    const context = await getContext(platform);
    const baseUrl = `http://${publicHost(options.host)}:${options.port}`;
    const wsBase = baseUrl.replace(/^http/, 'ws');
    const platformSuffix = platformQuery(platform);

    if (requestUrl.pathname === '/rayact/status') {
      sendJson(response, context.bootstrapError ? 500 : 200, {
        ok: !context.bootstrapError,
        rayactAppKey: options.rayactAppKey,
        entry: options.entry,
        platform,
        revision: context.revision,
        hmrMode: 'module',
        bundleFormat: 'js',
        compiler: RAYACT_REACT_COMPILER,
        binaryCommands: RAYACT_BINARY_COMMANDS,
        error: context.bootstrapError?.message
      });
      return;
    }

    if (requestUrl.pathname === '/rayact/manifest.json') {
      const entryModuleUrl = `${baseUrl}${ENTRY_MODULE_PATH}?${platformSuffix}`;
      const bootstrapUrl = `${baseUrl}/rayact/bootstrap.js?${platformSuffix}`;
      sendJson(response, 200, {
        rayactAppKey: options.rayactAppKey,
        entry: options.entry,
        platform,
        mode: 'development',
        revision: context.revision,
        hmrMode: 'module',
        bundleFormat: 'js',
        compiler: RAYACT_REACT_COMPILER,
        binaryCommands: RAYACT_BINARY_COMMANDS,
        bootstrapUrl,
        entryModuleUrl,
        bundleUrl: bootstrapUrl,
        hmrUrl: `${wsBase}/rayact/hmr`,
        debuggerUrl: `${wsBase}/rayact/debugger`,
        inspectorUrl: `${wsBase}/rayact/inspector`,
        websocketUrl: `${wsBase}/rayact/debugger`,
        cdpPort: options.cdpPort,
        assets: context.assets.map(asset => ({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          hash: asset.hash,
          size: asset.size,
          outputName: asset.outputName,
          kind: asset.kind,
          url: `${baseUrl}/rayact/assets/${encodeURIComponent(asset.id)}/${encodeURIComponent(asset.name)}?${platformSuffix}`
        })),
        nativeModules,
        capabilities: ['hmr', 'cdp', 'react-devtools', 'inspector', 'module-hmr']
      });
      return;
    }

    if (requestUrl.pathname === '/rayact/bootstrap.js' || requestUrl.pathname === '/rayact/bundle') {
      try {
        const code = context.bootstrapCode ?? await rebuildBootstrap(context);
        sendText(response, 200, code, 'application/javascript; charset=utf-8');
      } catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        sendText(response, 500, message);
      }
      return;
    }

    if (requestUrl.pathname.startsWith('/rayact/raw/')) {
      const relative = decodeURIComponent(requestUrl.pathname.slice('/rayact/raw/'.length));
      const filePath = path.resolve(options.root, relative);
      if (!isPathInsideRoot(options.root, filePath)) {
        sendJson(response, 403, { error: 'Forbidden' });
        return;
      }
      try {
        const data = await fs.promises.readFile(filePath);
        sendBuffer(response, 200, data, mimeFor(filePath));
      } catch (error) {
        sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (requestUrl.pathname.startsWith('/rayact/assets/')) {
      sendJson(response, 404, { error: 'Asset not found' });
      return;
    }

    if (requestUrl.pathname === '/rayact/entry.js') {
      if (!context.vite) {
        sendText(response, 503, 'Vite dev server not ready');
        return;
      }
      try {
        const result = await context.vite.transformRequest(RAYACT_ENTRY_ID, { ssr: true });
        if (!result?.code) {
          sendText(response, 404, 'Entry module not found');
          return;
        }
        sendText(response, 200, wrapRayactModule(`/rayact/entry.js?${platformSuffix}`, result.code, RAYACT_ENTRY_ID), 'application/javascript; charset=utf-8');
      } catch (error) {
        sendText(response, 500, error instanceof Error ? error.message : String(error));
      }
      return;
    }

    if (requestUrl.pathname.startsWith('/rayact/m/') || requestUrl.pathname === '/rayact/resolve') {
      await new Promise<void>((resolve, reject) => {
        context.middleware?.(request, response, err => {
          if (err) reject(err);
          else resolve();
        });
      }).catch(error => {
        if (!response.headersSent) {
          sendText(response, 500, error instanceof Error ? error.message : String(error));
        }
      });
      return;
    }

    if (context.vite) {
      context.vite.middlewares(request, response, () => {
        sendJson(response, 404, { error: 'Not found' });
      });
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  }

  const broadcastDebugger = createWsBroadcast(debuggerWss);
  const broadcastInspector = createWsBroadcast(inspectorWss);

  debuggerWss.on('connection', socket => {
    socket.send(JSON.stringify({
      type: 'server:hello',
      payload: { entry: options.entry, platform: 'multi', defaultPlatform: options.platform, channel: 'debugger' }
    }));
    socket.on('message', data => {
      try {
        const message = JSON.parse(String(data)) as DebugMessage;
        if (message.type === 'console') {
          const payload = message.payload as { level?: string; args?: string[] };
          const level = payload.level === 'error' || payload.level === 'warn' ? payload.level : 'log';
          options.onClientLog?.();
          console[level](`[client:${payload.level ?? 'log'}]`, ...(payload.args ?? []));
        } else if (message.type === 'client:error') {
          options.onClientLog?.();
          console.error('[client:error]', message.payload);
        } else if (message.type === 'react-devtools') {
          broadcastDebugger(message);
        } else if (message.type === 'inspector:tree') {
          broadcastInspector(message);
        }
      } catch {
        console.warn('[rayact] ignored malformed debugger message');
      }
    });
  });

  inspectorWss.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'server:hello', payload: { channel: 'inspector' } }));
    socket.on('message', data => {
      try {
        const message = JSON.parse(String(data)) as DebugMessage;
        if (message.type === 'inspector:highlight' || message.type === 'inspector:select') {
          broadcastInspector(message);
        }
      } catch {
        // ignore
      }
    });
  });

  const requestedPort = options.port;
  options.port = await listenWithFallback(server, options.host, requestedPort, {
    strictPort: options.strictPort
  });

  const url = `http://${publicHost(options.host)}:${options.port}`;
  const localUrl = `http://127.0.0.1:${options.port}`;
  const entry = path.relative(options.root, path.resolve(options.root, options.entry));
  const qrPayload = JSON.stringify(buildQrPayload({
    url,
    port: options.port
  }));

  const mdns = advertiseRayactServer({
    port: options.port,
    appKey: options.rayactAppKey,
    entry,
    cdpPort: options.cdpPort
  });

  const broadcastHmr = (message: DebugMessage) => {
    broadcastModuleHmr(message);
  };

  return {
    url,
    localUrl,
    entry,
    platform: options.platform,
    rayactAppKey: options.rayactAppKey,
    qrPayload,
    clientCount() {
      const hmrClients = moduleHmrWss.clients.size;
      return hmrClients + debuggerWss.clients.size + inspectorWss.clients.size;
    },
    hmrClientCount() {
      return moduleHmrWss.clients.size;
    },
    debuggerClientCount() {
      return debuggerWss.clients.size;
    },
    broadcastHmr,
    broadcastDebugger,
    broadcastInspector,
    async reload() {
      await Promise.all([...contexts.values()].map(context => rebuildBootstrap(context)));
      broadcastModuleHmr({ type: 'full-reload' });
    },
    async close() {
      mdns.stop();
      debuggerWss.close();
      inspectorWss.close();
      await Promise.all([...contexts.values()].map(async context => {
        if (context.vite) await context.vite.close();
      }));
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  };
}
