#!/usr/bin/env node
/**
 * Serve release1/ assets over HTTP with GitHub-release URL layout so
 * RAYACT_PREBUILT_BASE_URL=http://127.0.0.1:PORT/v0.0.1 works locally.
 *
 * Usage:
 *   node scripts/serve-release-assets.mjs [releaseDir] [port] [tag]
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.resolve(ROOT, process.argv[2] ?? 'release1');
const port = Number(process.argv[3] ?? process.env.RAYACT_RELEASE_SERVE_PORT ?? 9191);
const tag = process.argv[4] ?? process.env.RAYACT_PREBUILT_TAG ?? 'v0.0.1';

if (!fs.existsSync(releaseDir)) {
  console.error(`Release directory not found: ${releaseDir}`);
  process.exit(1);
}

const MIME = {
  '.tgz': 'application/gzip',
  '.tar.gz': 'application/gzip',
  '.gz': 'application/gzip',
  '.zip': 'application/zip',
  '.apk': 'application/vnd.android.package-archive',
  '.ipa': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8'
};

function contentType(file) {
  if (file.endsWith('.tar.gz')) return MIME['.tar.gz'];
  const ext = path.extname(file);
  return MIME[ext] ?? 'application/octet-stream';
}

const prefix = `/${tag.replace(/^\//, '')}/`;

const server = http.createServer((req, res) => {
  const url = req.url?.split('?')[0] ?? '/';
  let assetName = '';

  if (url === `/${tag}/SHA256SUMS` || url === `${prefix}SHA256SUMS`) {
    assetName = 'SHA256SUMS';
  } else if (url.startsWith(prefix)) {
    assetName = decodeURIComponent(url.slice(prefix.length));
  } else if (url === '/SHA256SUMS') {
    assetName = 'SHA256SUMS';
  } else if (url.startsWith('/') && !url.slice(1).includes('/')) {
    assetName = decodeURIComponent(url.slice(1));
  } else {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }

  if (!assetName || assetName.includes('..') || assetName.includes('/')) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('bad path');
    return;
  }

  const filePath = path.join(releaseDir, assetName);
  if (!filePath.startsWith(path.resolve(releaseDir) + path.sep) && filePath !== path.resolve(releaseDir, assetName)) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`missing asset: ${assetName}`);
      return;
    }
    res.writeHead(200, {
      'content-type': contentType(assetName),
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${port}/${tag.replace(/^\//, '')}`;
  console.log(`Release asset server: ${base}`);
  console.log(`Set RAYACT_PREBUILT_BASE_URL=${base}`);
  console.log(`Serving ${releaseDir}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
