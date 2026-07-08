import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { listenWithFallback } from '../../dist/dev-server/listen.js';

test('listenWithFallback binds requested port when free', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  const port = await listenWithFallback(server, '127.0.0.1', 0);
  assert.ok(port > 0);
  await new Promise(resolve => server.close(() => resolve()));
});

test('listenWithFallback picks next port when busy', async () => {
  const blocker = http.createServer();
  const basePort = await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, '127.0.0.1', () => {
      const addr = blocker.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });

  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  const actual = await listenWithFallback(server, '127.0.0.1', basePort);
  assert.equal(actual, basePort + 1);

  await new Promise(resolve => server.close(() => resolve()));
  await new Promise(resolve => blocker.close(() => resolve()));
});

test('listenWithFallback strictPort fails when busy', async () => {
  const blocker = http.createServer();
  const basePort = await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, '127.0.0.1', () => {
      const addr = blocker.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });

  const server = http.createServer();
  await assert.rejects(
    () => listenWithFallback(server, '127.0.0.1', basePort, { strictPort: true }),
    (error) => error.code === 'EADDRINUSE'
  );

  await new Promise(resolve => blocker.close(() => resolve()));
});
