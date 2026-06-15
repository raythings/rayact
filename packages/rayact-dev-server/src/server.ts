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

function normalizeOptions(options: RayactDevServerOptions): Required<RayactDevServerOptions> {
  const config = loadRayactConfig(options.root ?? process.cwd());
  return {
    root: path.resolve(options.root ?? process.cwd()),
    host: options.host ?? config.devServer?.host ?? '0.0.0.0',
    port: options.port ?? config.devServer?.port ?? 8081,
    entry: options.entry ?? config.entry ?? 'apps/desktop/src/App.tsx',
    platform: options.platform ?? config.platform ?? 'desktop',
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

  let bootstrapCode: string | null = null;
  let bootstrapError: Error | null = null;
  let bootstrapInFlight: Promise<string> | null = null;
  let revision = 1;
  let assetRegistry: RayactBuildOutput['assets'] = [];

  const bundleOptions = {
    root: options.root,
    entry: options.entry,
    platform: options.platform,
    mode: 'development' as const,
    minify: options.minify,
    bytecode: false
  };

  const rebuildBootstrap = async () => {
    if (bootstrapInFlight) return bootstrapInFlight;
    bootstrapInFlight = (async () => {
      try {
        bootstrapCode = await buildRayactBootstrap(bundleOptions);
        bootstrapError = null;
        revision++;
        return bootstrapCode;
      } catch (error) {
        bootstrapError = error instanceof Error ? error : new Error(String(error));
        throw bootstrapError;
      } finally {
        bootstrapInFlight = null;
      }
    })();
    return bootstrapInFlight;
  };

  await rebuildBootstrap();

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

  let vite: ViteDevServer | null = null;

  vite = await createRayactViteDevServer(bundleOptions, server);

  const broadcastModuleUpdates = (file: string, event: 'change' | 'add' | 'unlink') => {
    if (!vite) return;
    const root = options.root;
    const normalized = file.split(path.sep).join('/');
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel.startsWith('..')) return;

    if (event === 'unlink' || normalized.endsWith('rayact.config.json') || normalized.includes('/native/')) {
      broadcastModuleHmr({ type: 'full-reload' });
      return;
    }

    const mods = vite.moduleGraph.getModulesByFile(file);
    const updates: Array<{ type: 'js-update'; path: string; acceptedPath: string; timestamp: number }> = [];
    const timestamp = Date.now();

    if (mods?.size) {
      for (const mod of mods) {
        const hmrPath = mod.url?.startsWith('/') ? mod.url : `/${rel}`;
        updates.push({ type: 'js-update', path: hmrPath, acceptedPath: hmrPath, timestamp });
      }
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(file)) {
      updates.push({ type: 'js-update', path: `/${rel}`, acceptedPath: `/${rel}`, timestamp });
    }

    if (updates.length) {
      broadcastModuleHmr({ type: 'update', updates } as DebugMessage);
    }
  };

  vite.watcher.on('change', file => broadcastModuleUpdates(file, 'change'));
  vite.watcher.on('add', file => broadcastModuleUpdates(file, 'add'));
  vite.watcher.on('unlink', file => broadcastModuleUpdates(file, 'unlink'));

  const rayactModuleMiddleware = createRayactModuleMiddleware(() => vite);

  server.on('request', (request, response) => {
    void handleRequest(request, response);
  });

  async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const baseUrl = `http://${publicHost(options.host)}:${options.port}`;
    const wsBase = baseUrl.replace(/^http/, 'ws');

    if (requestUrl.pathname === '/rayact/status') {
      sendJson(response, bootstrapError ? 500 : 200, {
        ok: !bootstrapError,
        rayactAppKey: options.rayactAppKey,
        entry: options.entry,
        platform: options.platform,
        revision,
        hmrMode: 'module',
        bundleFormat: 'js',
        compiler: RAYACT_REACT_COMPILER,
        binaryCommands: RAYACT_BINARY_COMMANDS,
        error: bootstrapError?.message
      });
      return;
    }

    if (requestUrl.pathname === '/rayact/manifest.json') {
      const entryModuleUrl = `${baseUrl}${ENTRY_MODULE_PATH}`;
      const bootstrapUrl = `${baseUrl}/rayact/bootstrap.js`;
      sendJson(response, 200, {
        rayactAppKey: options.rayactAppKey,
        entry: options.entry,
        platform: options.platform,
        mode: 'development',
        revision,
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
        assets: assetRegistry.map(asset => ({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          hash: asset.hash,
          size: asset.size,
          outputName: asset.outputName,
          kind: asset.kind,
          url: `${baseUrl}/rayact/assets/${encodeURIComponent(asset.id)}/${encodeURIComponent(asset.name)}`
        })),
        nativeModules,
        capabilities: ['hmr', 'cdp', 'react-devtools', 'inspector', 'module-hmr']
      });
      return;
    }

    if (requestUrl.pathname === '/rayact/bootstrap.js' || requestUrl.pathname === '/rayact/bundle') {
      try {
        const code = bootstrapCode ?? await rebuildBootstrap();
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
      if (!vite) {
        sendText(response, 503, 'Vite dev server not ready');
        return;
      }
      try {
        const result = await vite.transformRequest(RAYACT_ENTRY_ID, { ssr: true });
        if (!result?.code) {
          sendText(response, 404, 'Entry module not found');
          return;
        }
        sendText(response, 200, wrapRayactModule('/rayact/entry.js', result.code, RAYACT_ENTRY_ID), 'application/javascript; charset=utf-8');
      } catch (error) {
        sendText(response, 500, error instanceof Error ? error.message : String(error));
      }
      return;
    }

    if (requestUrl.pathname.startsWith('/rayact/m/') || requestUrl.pathname === '/rayact/resolve') {
      await new Promise<void>((resolve, reject) => {
        rayactModuleMiddleware(request, response, err => {
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

    if (vite) {
      vite.middlewares(request, response, () => {
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
      payload: { entry: options.entry, platform: options.platform, channel: 'debugger' }
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

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
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
      await rebuildBootstrap();
      broadcastModuleHmr({ type: 'full-reload' });
    },
    async close() {
      mdns.stop();
      debuggerWss.close();
      inspectorWss.close();
      if (vite) await vite.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  };
}
