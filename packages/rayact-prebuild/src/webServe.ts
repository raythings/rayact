import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.qjsbc': 'application/octet-stream'
};

export const DEFAULT_WEB_ENGINE_PORT = 8768;

function coepHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cache-Control': 'no-store',
    ...extra
  };
}

export interface CoepServerHandle {
  url: string;
  port: number;
  close(): Promise<void>;
}

export interface CoepStaticServerOptions {
  dir: string;
  port?: number;
  host?: string;
}

function resolveStaticFile(root: string, urlPath: string): string | null {
  let rel = urlPath.split('?')[0] ?? '/';
  if (rel === '/') rel = '/rayact.html';
  const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.resolve(root, normalized.startsWith('/') ? normalized.slice(1) : normalized);
  if (!filePath.startsWith(path.resolve(root) + path.sep) && filePath !== path.resolve(root)) {
    return null;
  }
  return filePath;
}

export function startCoepStaticServer(opts: CoepStaticServerOptions): Promise<CoepServerHandle> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? DEFAULT_WEB_ENGINE_PORT;
  const root = path.resolve(opts.dir);

  const server = http.createServer((req, res) => {
    const filePath = resolveStaticFile(root, req.url ?? '/');
    if (!filePath) {
      res.writeHead(403, coepHeaders());
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, coepHeaders());
        res.end();
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, coepHeaders({ 'Content-Type': MIME[ext] ?? 'application/octet-stream' }));
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      const url = `http://${host}:${actualPort}`;
      console.log(`COEP server: ${url} serving ${root}`);
      resolve({
        url,
        port: actualPort,
        close: () => new Promise((res, rej) => server.close((err) => (err ? rej(err) : res())))
      });
    });
  });
}

export interface CoepDevProxyOptions {
  engineDir: string;
  devOrigin: string;
  port?: number;
  host?: string;
}

function hostVariants(devOrigin: string): Set<string> {
  const variants = new Set<string>();
  try {
    const u = new URL(devOrigin);
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    variants.add(`${u.host}`);
    variants.add(`${u.hostname}:${port}`);
    if (u.hostname === '127.0.0.1') variants.add(`localhost:${port}`);
    if (u.hostname === 'localhost') variants.add(`127.0.0.1:${port}`);
    if (u.hostname === '0.0.0.0') {
      variants.add(`127.0.0.1:${port}`);
      variants.add(`localhost:${port}`);
    }
  } catch {
    const host = devOrigin.replace(/^https?:\/\//, '').replace(/\/$/, '');
    variants.add(host);
  }
  return variants;
}

function rewriteBody(body: Buffer, selfOrigin: string, devOrigin: string): Buffer {
  let text = body.toString('utf8');
  for (const h of hostVariants(devOrigin)) {
    text = text.replaceAll(`http://${h}`, selfOrigin);
  }
  const devWs = devOrigin.replace(/^http/, 'ws');
  for (const h of hostVariants(devOrigin)) {
    text = text.replaceAll(`ws://${h}`, devWs);
  }
  return Buffer.from(text, 'utf8');
}

async function proxyToDev(
  method: string,
  urlPath: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  devOrigin: string,
  selfOrigin: string
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  try {
    const upstream = await fetch(`${devOrigin}${urlPath}`, {
      method,
      headers: body ? { 'Content-Type': req.headers['content-type'] ?? 'application/octet-stream' } : undefined,
      body
    });
    const raw = Buffer.from(await upstream.arrayBuffer());
    const rewritten = rewriteBody(raw, selfOrigin, devOrigin);
    res.writeHead(upstream.status, coepHeaders({
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Length': String(rewritten.length)
    }));
    res.end(rewritten);
  } catch (error) {
    res.writeHead(502, coepHeaders());
    res.end(error instanceof Error ? error.message : String(error));
  }
}

export function startCoepDevProxy(opts: CoepDevProxyOptions): Promise<CoepServerHandle> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? DEFAULT_WEB_ENGINE_PORT;
  const engineDir = path.resolve(opts.engineDir);
  const devOrigin = opts.devOrigin.replace(/\/$/, '');
  let selfOrigin = `http://${host}:${port}`;

  const server = http.createServer((req, res) => {
    const urlPath = req.url ?? '/';
    if (urlPath.startsWith('/rayact/')) {
      void proxyToDev(req.method ?? 'GET', urlPath, req, res, devOrigin, selfOrigin);
      return;
    }
    const filePath = resolveStaticFile(engineDir, urlPath);
    if (!filePath) {
      res.writeHead(403, coepHeaders());
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, coepHeaders());
        res.end();
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, coepHeaders({ 'Content-Type': MIME[ext] ?? 'application/octet-stream' }));
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      selfOrigin = `http://${host}:${actualPort}`;
      console.log(`proxy+coep server: ${selfOrigin} (engine=${engineDir}, /rayact/* -> ${devOrigin})`);
      resolve({
        url: selfOrigin,
        port: actualPort,
        close: () => new Promise((res, rej) => server.close((err) => (err ? rej(err) : res())))
      });
    });
  });
}

export function webDevOpenUrl(proxyUrl: string, devOrigin: string): string {
  return `${proxyUrl.replace(/\/$/, '')}/rayact.html?dev=${encodeURIComponent(devOrigin)}`;
}
