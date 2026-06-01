import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import { buildRayactBundle, type RayactBuildOutput } from './bundler.js';
import type { DebugMessage, RayactDevServer, RayactDevServerOptions } from './types.js';

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

function normalizeOptions(options: RayactDevServerOptions): Required<RayactDevServerOptions> {
  return {
    root: path.resolve(options.root ?? process.cwd()),
    host: options.host ?? '0.0.0.0',
    port: options.port ?? 8081,
    entry: options.entry,
    platform: options.platform ?? 'desktop',
    onClientLog: options.onClientLog ?? (() => {})
  };
}

export async function startRayactDevServer(rawOptions: RayactDevServerOptions): Promise<RayactDevServer> {
  const options = normalizeOptions(rawOptions);
  let lastBuild: RayactBuildOutput | null = null;
  let lastBundleError: Error | null = null;
  let revision = 1;

  const buildBundle = async () => {
    try {
      lastBuild = await buildRayactBundle({ ...options, mode: 'development' });
      lastBundleError = null;
      return lastBuild.code;
    } catch (error) {
      lastBundleError = error instanceof Error ? error : new Error(String(error));
      throw lastBundleError;
    }
  };

  await buildBundle();

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (requestUrl.pathname === '/rayact/status') {
      sendJson(response, lastBundleError ? 500 : 200, {
        ok: !lastBundleError,
        entry: options.entry,
        platform: options.platform,
        revision,
        error: lastBundleError?.message
      });
      return;
    }

    if (requestUrl.pathname === '/rayact/manifest.json') {
      const baseUrl = `http://${publicHost(options.host)}:${options.port}`;
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
      sendJson(response, 200, {
        entry: options.entry,
        platform: options.platform,
        mode: 'development',
        revision,
        bundleUrl: `${baseUrl}/rayact/bundle`,
        websocketUrl: `${baseUrl.replace(/^http/, 'ws')}/rayact/debugger`,
        assets
      });
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

    if (requestUrl.pathname === '/rayact/bundle') {
      try {
        sendText(response, 200, await buildBundle(), 'application/javascript; charset=utf-8');
      } catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        sendText(response, 500, message);
      }
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  });

  const wss = new WebSocketServer({ server, path: '/rayact/debugger' });
  const broadcast = (message: DebugMessage) => {
    const encoded = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(encoded);
      }
    }
  };

  wss.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'server:hello', payload: { entry: options.entry, platform: options.platform } }));
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
        }
      } catch {
        console.warn('[rayact] ignored malformed debugger message');
      }
    });
  });

  const appDir = path.dirname(path.resolve(options.root, options.entry));
  const appRoot = path.resolve(options.root, appDir.includes(`${path.sep}src`) ? path.dirname(appDir) : appDir);
  const watcher = chokidar.watch([
    appRoot,
    path.resolve(options.root, 'packages/rayact-react/src'),
    path.resolve(options.root, 'packages/rayact-runtime/src')
  ], {
    ignored: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.DS_Store'
    ],
    ignoreInitial: true
  });

  watcher.on('all', async () => {
    try {
      await buildBundle();
      revision++;
      broadcast({ type: 'hmr-update', payload: { revision } });
    } catch (error) {
      const serialized = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
      broadcast({ type: 'build:error', payload: serialized });
    }
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

  return {
    url,
    localUrl,
    entry,
    platform: options.platform,
    clientCount() {
      return wss.clients.size;
    },
    broadcast,
    async reload() {
      await buildBundle();
      revision++;
      broadcast({ type: 'reload', payload: { revision } });
    },
    async close() {
      await watcher.close();
      wss.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  };
}
