import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startRayactDevServer } from '../../dist/dev-server/server.js';

async function withServer(fn) {
  const root = new URL('../..', import.meta.url).pathname;
  const server = await startRayactDevServer({
    root, host: '127.0.0.1', port: 0, cdpPort: 0,
    entry: 'test-projects/release-consumer-smoke/src/App.tsx', platform: 'android'
  });
  try { await fn(server); } finally { await server.close(); }
}

async function connect(url) {
  const ws = new WebSocket(url);
  await once(ws, 'open');
  return ws;
}

function nextMatching(ws, predicate) {
  return new Promise(resolve => {
    const listener = data => {
      let parsed;
      try { parsed = JSON.parse(String(data)); } catch { return; }
      if (predicate(parsed)) { ws.off('message', listener); resolve(parsed); }
    };
    ws.on('message', listener);
  });
}

async function register(server, deviceId, pageId = 'main') {
  const socket = await connect(`${server.localUrl.replace(/^http/, 'ws')}/rayact/devtools/device`);
  socket.send(JSON.stringify({ event: 'hello', payload: {
    protocolVersion: 1, deviceId, deviceName: deviceId, appId: `app.${deviceId}`,
    platform: 'test', pages: [{ id: pageId, title: `Rayact ${deviceId}`, vm: 'QuickJS' }]
  }}));
  await new Promise(resolve => setTimeout(resolve, 20));
  return socket;
}

test('CDP discovery uses a separate loopback listener and standard target paths', async () => {
  await withServer(async server => {
    assert.notEqual(server.cdpPort, Number(new URL(server.localUrl).port));
    assert.equal((await fetch(`${server.localUrl}/json/list`)).status, 404);
    assert.deepEqual(await (await fetch(`${server.cdpUrl}/json/list`)).json(), []);
    const device = await register(server, 'android-1');
    const [target] = await (await fetch(`${server.cdpUrl}/json/list`)).json();
    assert.match(target.id, /^rayact-[a-f0-9]{16}$/);
    assert.match(target.webSocketDebuggerUrl, /\/devtools\/page\/rayact-[a-f0-9]{16}$/);
    assert.match(target.devtoolsFrontendUrl, /\/devtools\/page\/rayact-[a-f0-9]{16}$/);
    device.close();
  });
});

test('multiple device targets route CDP by page and session', async () => {
  await withServer(async server => {
    const a = await register(server, 'android-1');
    const b = await register(server, 'ios-1');
    const targets = await (await fetch(`${server.cdpUrl}/json/list`)).json();
    assert.equal(targets.length, 2);
    const targetA = targets.find(target => target.title.includes('android-1'));
    const frontend = await connect(targetA.webSocketDebuggerUrl);
    const connected = await nextMatching(a, message => message.event === 'connect');
    const sessionId = connected.payload.sessionId;
    const command = nextMatching(a, message => message.event === 'wrappedEvent');
    frontend.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    assert.equal(JSON.parse((await command).payload.message).method, 'Runtime.enable');

    const reply = nextMatching(frontend, message => message.id === 1);
    a.send(JSON.stringify({ event: 'wrappedEvent', payload: {
      pageId: 'main', sessionId, message: JSON.stringify({ id: 1, result: {} })
    }}));
    assert.deepEqual(await reply, { id: 1, result: {} });
    frontend.close(); a.close(); b.close();
  });
});

test('a replacement frontend detaches the previous session', async () => {
  await withServer(async server => {
    const device = await register(server, 'android-1');
    const [target] = await (await fetch(`${server.cdpUrl}/json/list`)).json();
    const first = await connect(target.webSocketDebuggerUrl);
    await nextMatching(device, message => message.event === 'connect');
    const firstClosed = once(first, 'close');
    const second = await connect(target.webSocketDebuggerUrl);
    const [code] = await firstClosed;
    assert.equal(code, 1012);
    second.close(); device.close();
  });
});

test('device disconnect removes only its targets', async () => {
  await withServer(async server => {
    const a = await register(server, 'android-1');
    const b = await register(server, 'ios-1');
    a.close();
    await once(a, 'close');
    await new Promise(resolve => setTimeout(resolve, 20));
    const targets = await (await fetch(`${server.cdpUrl}/json/list`)).json();
    assert.equal(targets.length, 1);
    assert.match(targets[0].title, /ios-1/);
    b.close();
  });
});
