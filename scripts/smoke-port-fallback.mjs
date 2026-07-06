#!/usr/bin/env node
/**
 * Verify dev-server and COEP proxy pick the next port when the requested port is busy.
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import { listenWithFallback } from '../packages/rayact-dev-server/dist/listen.js';
import { listenWithFallback as prebuildListen } from '../packages/rayact-prebuild/dist/listen.js';

async function holdPort(host, port) {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

async function testDevServerFallback() {
  const host = '127.0.0.1';
  const blocker = await holdPort(host, 18081);
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  const actual = await listenWithFallback(server, host, 18081);
  assert.equal(actual, 18082);
  await new Promise(r => server.close(() => r()));
  await new Promise(r => blocker.close(() => r()));
  console.log('PASS dev-server port fallback');
}

async function testCoepFallback() {
  const host = '127.0.0.1';
  const blocker = http.createServer();
  const basePort = await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, host, () => {
      const addr = blocker.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  const actual = await prebuildListen(server, host, basePort);
  assert.equal(actual, basePort + 1);
  await new Promise(r => server.close(() => r()));
  await new Promise(r => blocker.close(() => r()));
  console.log('PASS COEP proxy port fallback');
}

await testDevServerFallback();
await testCoepFallback();
