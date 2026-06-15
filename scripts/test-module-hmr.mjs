import { startRayactDevServer } from '../packages/rayact-dev-server/dist/server.js';

const server = await startRayactDevServer({
  root: './apps/dev-app',
  port: 9877,
  host: '127.0.0.1'
});

const serverUrl = 'http://127.0.0.1:9877';
globalThis.__RAYACT_DEV_SERVER__ = serverUrl;
globalThis.createView = () => ({ id: 1 });
globalThis.appendChild = () => {};
globalThis.createText = () => ({ id: 2 });
globalThis.setRootNode = () => {};
globalThis.initRaylib = () => {};
globalThis.render = () => {};
const nativeModuleStubs = new Map([
  ['rayact-react/src/index.ts', 'var exports={render:function(){},createView:function(){return{};}};var module={exports:exports};'],
  ['@rayact/dev-client/src/index.ts', 'var exports={DevLauncherProvider:function(p){return p.children;},DevLauncherUI:function(){return null;},DevMenu:function(){return null;}};var module={exports:exports};']
]);

const origFetch = globalThis.fetch;
globalThis.fetch = async (url, ...args) => {
  const href = String(url);
  for (const [needle, body] of nativeModuleStubs) {
    if (href.includes(needle)) {
      const modulePath = href.includes('/rayact/m/')
        ? href.slice(href.indexOf('/rayact/m/') + '/rayact/m'.length).split('?')[0]
        : href;
      const wrapped = [
        '(function(){',
        'var exports={};var module={exports:exports};',
        `var __moduleUrl=${JSON.stringify(modulePath)};`,
        'var __require=globalThis.__rayactRequire;',
        'var require=function(id){return __require(id,__moduleUrl);};',
        body,
        `globalThis.__rayactRegisterModule(${JSON.stringify(modulePath)},function(){return module.exports;});`,
        '})();'
      ].join('\n');
      return new Response(wrapped, { status: 200, headers: { 'content-type': 'application/javascript' } });
    }
  }
  return origFetch(url, ...args);
};

process.on('unhandledRejection', err => {
  console.error('unhandledRejection:', err?.message ?? err);
});

const manifest = await (await fetch(`${serverUrl}/rayact/manifest.json`)).json();
const bootstrap = await (await fetch(manifest.bootstrapUrl)).text();

try {
  // eslint-disable-next-line no-eval
  eval(bootstrap);
} catch (error) {
  console.error('bootstrap eval failed:', error);
  await server.close();
  process.exit(1);
}

await new Promise(r => setTimeout(r, 8000));

const vendor = globalThis.__RAYACT_VENDOR__ ?? {};
const registry = [...(globalThis.__rayactModuleRegistry?.keys() ?? [])];
const runtime = globalThis.__rayactHmrRuntime;

console.log('vendor keys:', Object.keys(vendor));
console.log('registry modules:', registry);
console.log('hmr runtime:', !!runtime);

const ok =
  Object.keys(vendor).length >= 3 &&
  registry.some(k => k.includes('App.tsx')) &&
  runtime;

if (!ok) {
  console.error('module HMR smoke test FAILED');
  await server.close();
  process.exit(1);
}

console.log('module HMR smoke test passed');
await server.close();
