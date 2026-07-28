import test from 'node:test';
import assert from 'node:assert/strict';

import {
  convertViteSsrToRayactSync,
  wrapRayactModule,
} from '../../dist/dev-server/rayactHostModule.js';

/**
 * Evaluate a wrapped module the way the device host does: a classic script with
 * the registry globals in place. Returns the module's exports.
 */
function evalWrapped(key, code, { modules = {}, async: asyncRequire = false } = {}) {
  const registry = new Map();
  const previous = {
    register: globalThis.__rayactRegisterModule,
    require: globalThis.__rayactRequire,
    requireAsync: globalThis.__rayactRequireAsync,
  };
  globalThis.__rayactRegisterModule = (url, factory) => registry.set(url, factory);
  globalThis.__rayactRequire = spec => {
    if (!(spec in modules)) throw new Error(`unexpected require: ${spec}`);
    return modules[spec];
  };
  globalThis.__rayactRequireAsync = asyncRequire
    ? spec => Promise.resolve(globalThis.__rayactRequire(spec))
    : undefined;
  try {
    (0, eval)(wrapRayactModule(key, code));
    return registry.get(key)?.();
  } finally {
    globalThis.__rayactRegisterModule = previous.register;
    globalThis.__rayactRequire = previous.require;
    globalThis.__rayactRequireAsync = previous.requireAsync;
  }
}

test('the dynamic-import helper survives the static-import rewrite', () => {
  // The static rewrite matches `__vite_ssr_import__`; the dynamic helper's name
  // embeds a different segment (`ssr_dynamic_import`) and must pass through
  // untouched, or the prelude binding would have nothing to bind to.
  const out = convertViteSsrToRayactSync(
    'const p = __vite_ssr_dynamic_import__("./late.js");',
    '/rayact/m/src/App.tsx'
  );
  assert.match(out, /__vite_ssr_dynamic_import__\("\.\/late\.js"\)/);
});

test('wrapped modules define the ssr helpers ssrTransform emits', () => {
  const wrapped = wrapRayactModule('/rayact/m/src/App.tsx', '');
  assert.match(wrapped, /function __vite_ssr_dynamic_import__/);
  assert.match(wrapped, /var __vite_ssr_import_meta__=/);
});

test('await import() resolves through the module registry', async () => {
  const exports = evalWrapped(
    '/rayact/m/src/App.tsx',
    `
    exports.load = async function () {
      const mod = await __vite_ssr_dynamic_import__("./late.js");
      return mod.value;
    };
    `,
    { modules: { './late.js': { value: 42 } } }
  );
  assert.equal(await exports.load(), 42);
});

test('await import() prefers __rayactRequireAsync when the host installs it', async () => {
  const exports = evalWrapped(
    '/rayact/m/src/App.tsx',
    `
    exports.load = function () { return __vite_ssr_dynamic_import__("./late.js"); };
    `,
    { modules: { './late.js': { value: 'async' } }, async: true }
  );
  assert.equal((await exports.load()).value, 'async');
});

test('a failed dynamic import rejects rather than throwing synchronously', async () => {
  const exports = evalWrapped('/rayact/m/src/App.tsx', `
    exports.load = function () { return __vite_ssr_dynamic_import__("./missing.js"); };
  `);
  // The call itself must return a promise — a synchronous throw would escape
  // the caller's try/catch inside an async function boundary.
  const promise = exports.load();
  assert.ok(promise instanceof Promise);
  await assert.rejects(promise, /unexpected require/);
});

test('the dynamic helper is hoisted above the module body', () => {
  // ssrTransform can emit the call before any of our prelude lines in source
  // order, so the binding has to be a hoisted function declaration.
  const exports = evalWrapped(
    '/rayact/m/src/App.tsx',
    `
    var eager = typeof __vite_ssr_dynamic_import__;
    exports.kind = eager;
    `
  );
  assert.equal(exports.kind, 'function');
});

test('import.meta.url reports the module url', () => {
  const exports = evalWrapped(
    '/rayact/m/src/App.tsx',
    'exports.url = __vite_ssr_import_meta__.url;'
  );
  assert.equal(exports.url, '/rayact/m/src/App.tsx');
});
