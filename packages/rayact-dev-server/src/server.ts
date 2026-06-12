import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import { buildRayactBundle, type RayactBuildOutput } from './bundler.js';
import { loadRayactConfig } from './config.js';
import { advertiseRayactServer } from './mdns.js';
import { buildQrPayload } from './qr.js';
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
  let lastBuild: RayactBuildOutput | null = null;
  let lastBundleError: Error | null = null;
  let revision = 1;
  let hmrActive = true;

  const buildBundle = async () => {
    const useBytecode = options.bytecode && !hmrActive;
    try {
      lastBuild = await buildRayactBundle({
        ...options,
        mode: 'development',
        minify: options.minify,
        bytecode: useBytecode
      });
      lastBundleError = null;
      return lastBuild;
    } catch (error) {
      lastBundleError = error instanceof Error ? error : new Error(String(error));
      throw lastBundleError;
    }
  };

  await buildBundle();

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const baseUrl = `http://${publicHost(options.host)}:${options.port}`;
    const wsBase = baseUrl.replace(/^http/, 'ws');

    if (requestUrl.pathname === '/rayact/status') {
      sendJson(response, lastBundleError ? 500 : 200, {
        ok: !lastBundleError,
        rayactAppKey: options.rayactAppKey,
        entry: options.entry,
        platform: options.platform,
        revision,
        bundleFormat: lastBuild?.bundleFormat ?? 'js',
        error: lastBundleError?.message
      });
      return;
    }

    if (requestUrl.pathname === '/rayact/manifest.json') {
      const assets = (lastBuild?.assets ?? []).map(asset => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        hash: asset.hash,
        size: asset.size,
        outputName: asset.outputName,
        kind: asset.kind,
        url: `${baseUrl}/rayact/assets/${encodeURIComponent(asset.id)}/${encodeURIComponent(asset.name)}`
      }));
      const bundleFormat = lastBuild?.bundleFormat ?? 'js';
      const bundlePath = bundleFormat === 'qjsbc' ? '/rayact/bundle.qjsbc' : '/rayact/bundle';
      sendJson(response, 200, {
        rayactAppKey: options.rayactAppKey,
        entry: options.entry,
        platform: options.platform,
        mode: 'development',
        revision,
        bundleFormat,
        bundleUrl: `${baseUrl}${bundlePath}`,
        hmrUrl: `${wsBase}/rayact/hmr`,
        debuggerUrl: `${wsBase}/rayact/debugger`,
        inspectorUrl: `${wsBase}/rayact/inspector`,
        websocketUrl: `${wsBase}/rayact/debugger`,
        cdpPort: options.cdpPort,
        assets,
        capabilities: ['hmr', 'cdp', 'react-devtools', 'inspector']
      });
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
      const [, , , encodedId] = requestUrl.pathname.split('/');
      const id = encodedId ? decodeURIComponent(encodedId) : '';
      const asset = lastBuild?.assets.find(item => item.id === id);
      if (!asset) {
        sendJson(response, 404, { error: 'Asset not found' });
        return;
      }
      const sourcePath = path.isAbsolute(asset.sourcePath)
        ? asset.sourcePath
        : path.resolve(options.root, asset.sourcePath);
      try {
        sendBuffer(response, 200, await fs.promises.readFile(sourcePath), asset.type);
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (requestUrl.pathname === '/rayact/bundle' || requestUrl.pathname === '/rayact/bundle.qjsbc') {
      try {
        const output = await buildBundle();
        if (output.bundleFormat === 'qjsbc' && output.bytecode) {
          sendBuffer(response, 200, output.bytecode, 'application/octet-stream');
        } else {
          sendText(response, 200, output.code, 'application/javascript; charset=utf-8');
        }
      } catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        sendText(response, 500, message);
      }
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  });

  const hmrWss = new WebSocketServer({ server, path: '/rayact/hmr' });
  const debuggerWss = new WebSocketServer({ server, path: '/rayact/debugger' });
  const inspectorWss = new WebSocketServer({ server, path: '/rayact/inspector' });

  const broadcastHmr = createWsBroadcast(hmrWss);
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

  hmrWss.on('connection', socket => {
    socket.send(JSON.stringify({
      type: 'server:hello',
      payload: { entry: options.entry, platform: options.platform, channel: 'hmr', revision }
    }));
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

  const appDir = path.dirname(path.resolve(options.root, options.entry));
  const appRoot = path.resolve(options.root, appDir.includes(`${path.sep}src`) ? path.dirname(appDir) : appDir);
  const watcher = chokidar.watch([
    appRoot,
    path.resolve(options.root, 'packages/rayact-react/src'),
    path.resolve(options.root, 'packages/rayact-runtime/src'),
    path.resolve(options.root, 'packages/rayact-dev-client/src')
  ], {
    ignored: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.DS_Store'],
    ignoreInitial: true
  });

  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  watcher.on('all', () => {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(async () => {
      try {
        await buildBundle();
        revision++;
        broadcastHmr({ type: 'hmr-update', payload: { revision } });
      } catch (error) {
        const serialized = error instanceof Error
          ? { message: error.message, stack: error.stack }
          : { message: String(error) };
        broadcastHmr({ type: 'build:error', payload: serialized });
      }
    }, 200);
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
    port: options.port,
    rayactAppKey: options.rayactAppKey,
    cdpPort: options.cdpPort
  }));

  const mdns = advertiseRayactServer({
    port: options.port,
    appKey: options.rayactAppKey,
    entry,
    cdpPort: options.cdpPort
  });

  return {
    url,
    localUrl,
    entry,
    platform: options.platform,
    rayactAppKey: options.rayactAppKey,
    qrPayload,
    clientCount() {
      return hmrWss.clients.size + debuggerWss.clients.size + inspectorWss.clients.size;
    },
    hmrClientCount() {
      return hmrWss.clients.size;
    },
    debuggerClientCount() {
      return debuggerWss.clients.size;
    },
    broadcastHmr,
    broadcastDebugger,
    broadcastInspector,
    async reload() {
      await buildBundle();
      revision++;
      broadcastHmr({ type: 'reload', payload: { revision } });
    },
    async close() {
      mdns.stop();
      await watcher.close();
      hmrWss.close();
      debuggerWss.close();
      inspectorWss.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  };
}
