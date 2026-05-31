import path from 'node:path';
import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import type { Plugin, UserConfig } from 'vite';
import type { OutputChunk, OutputAsset, RollupOutput } from 'rollup';
import { build } from 'vite';

// Injected as banner before the IIFE on every bundle eval.
// $RefreshReg$ / $RefreshSig$ must exist before transformed component code runs.
const REFRESH_BANNER = `
var __isHotReload = !!globalThis.__RAYACT_HMR_ACTIVE__;
globalThis.$RefreshReg$ = function(type, id) {
  var rt = globalThis.__REACT_REFRESH__;
  if (rt) rt.register(type, id);
};
globalThis.$RefreshSig$ = function() {
  var rt = globalThis.__REACT_REFRESH__;
  return rt ? rt.createSignatureFunctionForTransform() : function(type) { return type; };
};
`.trim();

// Injected after the IIFE — marks env as hot and triggers React Refresh.
const REFRESH_FOOTER = `
globalThis.__RAYACT_HMR_ACTIVE__ = true;
if (__isHotReload) {
  try {
    var __rt = globalThis.__REACT_REFRESH__;
    if (__rt) __rt.performReactRefresh();
  } catch(e) { globalThis.console && globalThis.console.error('[rayact:refresh]', e); }
}
`.trim();

export interface BundleOptions {
  root: string;
  entry: string;
  platform: string;
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function resolveCssFile(id: string, importer: string | undefined, root: string): string | null {
  if (!id.endsWith('.css')) return null;

  const candidates: string[] = [];
  if (path.isAbsolute(id)) {
    candidates.push(id);
  } else {
    if (importer && !importer.startsWith('\0')) {
      candidates.push(path.resolve(path.dirname(importer), id));
    }
    candidates.push(path.resolve(root, id));
    if (id.startsWith('./')) {
      candidates.push(path.resolve(root, id.slice(2)));
    }
  }

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

function toNativeCssPath(filePath: string, root: string): string {
  const relative = normalizePath(path.relative(root, filePath));
  return relative.startsWith('..') ? normalizePath(filePath) : `./${relative}`;
}

// The native host re-evaluates the whole IIFE on every hot reload. Without
// sharing, each eval creates a fresh React + jsx-runtime, so the new app code
// talks to a different React than the reconciler that owns the live fiber tree
// — hook dispatch reads a null dispatcher and the screen goes black. We pin a
// single instance of each on globalThis.__RAYACT_VENDOR__ and make every
// `import 'react'` resolve to a thin proxy that returns that cached instance.
const REACT_EXPORTS = [
  'Children', 'Component', 'Fragment', 'Profiler', 'PureComponent', 'StrictMode',
  'Suspense', 'cloneElement', 'createContext', 'createElement', 'createFactory',
  'createRef', 'forwardRef', 'isValidElement', 'lazy', 'memo', 'startTransition',
  'unstable_act', 'useCallback', 'useContext', 'useDebugValue', 'useDeferredValue',
  'useEffect', 'useId', 'useImperativeHandle', 'useInsertionEffect', 'useLayoutEffect',
  'useMemo', 'useReducer', 'useRef', 'useState', 'useSyncExternalStore', 'useTransition',
  'version', '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED'
];

interface VendorSpec {
  key: string;
  probe: string;
  exports: string[];
}

const VENDOR_MODULES: Record<string, VendorSpec> = {
  'react': { key: 'react', probe: 'createElement', exports: REACT_EXPORTS },
  'react/jsx-runtime': { key: 'jsxRuntime', probe: 'jsx', exports: ['Fragment', 'jsx', 'jsxs'] },
  'react/jsx-dev-runtime': { key: 'jsxDevRuntime', probe: 'jsxDEV', exports: ['Fragment', 'jsxDEV'] }
};

function vendorSharePlugin(): Plugin {
  const PREFIX = '\0rayact-vendor:';
  return {
    name: 'rayact-vendor-share',
    enforce: 'pre',
    async resolveId(id, importer) {
      const spec = VENDOR_MODULES[id];
      if (!spec) return null;
      // Avoid intercepting the proxy's own re-import of the real module.
      if (importer && importer.startsWith(PREFIX)) return null;
      return `${PREFIX}${id}`;
    },
    async load(id) {
      if (!id.startsWith(PREFIX)) return null;
      const spec = VENDOR_MODULES[id.slice(PREFIX.length)];
      const resolved = await this.resolve(id.slice(PREFIX.length), undefined, { skipSelf: true });
      if (!resolved) throw new Error(`rayact-vendor-share: cannot resolve ${id}`);
      const realId = JSON.stringify(resolved.id);
      return [
        `import * as __ns from ${realId};`,
        `const __g = (globalThis.__RAYACT_VENDOR__ = globalThis.__RAYACT_VENDOR__ || {});`,
        `const __pick = (__ns.default && __ns.default.${spec.probe}) ? __ns.default : __ns;`,
        `const __mod = __g[${JSON.stringify(spec.key)}] || (__g[${JSON.stringify(spec.key)}] = __pick);`,
        `export default __mod;`,
        ...spec.exports.map(name => `export const ${name} = __mod[${JSON.stringify(name)}];`)
      ].join('\n');
    }
  };
}

// Virtual module that initializes react-refresh/runtime once in the global scope.
// Included first in the bundle entry so it runs before any component code.
const REFRESH_RUNTIME_SETUP_ID = 'virtual:rayact-refresh-runtime';

function rayactRefreshRuntimePlugin(): Plugin {
  return {
    name: 'rayact-refresh-runtime',
    enforce: 'pre',
    resolveId(id) {
      if (id === REFRESH_RUNTIME_SETUP_ID) return `\0${REFRESH_RUNTIME_SETUP_ID}`;
    },
    load(id) {
      if (id !== `\0${REFRESH_RUNTIME_SETUP_ID}`) return null;
      // Idempotent: only initialize the runtime once across bundle re-evals.
      return [
        `import RefreshRuntime from 'react-refresh/runtime';`,
        `if (!globalThis.__REACT_REFRESH__) {`,
        `  RefreshRuntime.injectIntoGlobalHook(globalThis);`,
        `  globalThis.__REACT_REFRESH__ = RefreshRuntime;`,
        `}`,
        // Re-bind $RefreshSig$ now that the runtime is definitely available.
        `globalThis.$RefreshSig$ = function() { return RefreshRuntime.createSignatureFunctionForTransform(); };`,
      ].join('\n');
    }
  };
}

export function rayactVitePlugin(options: BundleOptions): Plugin {
  const resolvedEntry = normalizePath(path.resolve(options.root, options.entry));

  return {
    name: 'rayact-vite',
    enforce: 'pre',
    config(): UserConfig {
      return {
        define: {
          __RAYACT_PLATFORM__: JSON.stringify(options.platform)
        },
        resolve: {
          alias: {
            '@rayact/react': normalizePath(path.resolve(options.root, 'packages/rayact-react/src/index.ts')),
            '@rayact/runtime': normalizePath(path.resolve(options.root, 'packages/rayact-runtime/src/index.ts'))
          }
        }
      };
    },
    resolveId(id, importer) {
      if (id === 'virtual:rayact-entry') return '\0virtual:rayact-entry';
      const cssFile = resolveCssFile(id, importer, options.root);
      if (cssFile) return `\0rayact-css:${encodeURIComponent(cssFile)}.js`;
      return null;
    },
    load(id) {
      if (id.startsWith('\0rayact-css:')) {
        const encoded = id.slice('\0rayact-css:'.length, -'.js'.length);
        const cssFile = decodeURIComponent(encoded);
        const nativePath = toNativeCssPath(cssFile, options.root);
        return [
          `const cssClasses = globalThis.importCSS(${JSON.stringify(nativePath)});`,
          'export default cssClasses;'
        ].join('\n');
      }

      if (id !== '\0virtual:rayact-entry') return null;
      return [
        `globalThis.__RAYACT_ENTRY__ = ${JSON.stringify(resolvedEntry)};`,
        // Refresh runtime must initialize before any component code runs.
        `import ${JSON.stringify(REFRESH_RUNTIME_SETUP_ID)};`,
        `import ${JSON.stringify(resolvedEntry)};`
      ].join('\n');
    }
  };
}

export async function bundleRayactApp(options: BundleOptions): Promise<string> {
  const result = await build({
    root: options.root,
    configFile: false,
    mode: 'development',
    logLevel: 'silent',
    plugins: [
      vendorSharePlugin(),
      rayactVitePlugin(options),
      rayactRefreshRuntimePlugin(),
      react({
        babel: {
          // Force the refresh transform even in build mode (skipEnvCheck bypasses
          // the NODE_ENV=production guard that would otherwise disable it).
          plugins: [['react-refresh/babel', { skipEnvCheck: true }]]
        }
      })
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify('development')
    },
    build: {
      write: false,
      minify: false,
      sourcemap: 'inline',
      target: 'es2020',
      emptyOutDir: false,
      rollupOptions: {
        input: 'virtual:rayact-entry',
        output: {
          format: 'iife',
          name: 'RayactDevBundle',
          inlineDynamicImports: true,
          extend: true,
          banner: REFRESH_BANNER,
          footer: REFRESH_FOOTER
        }
      }
    }
  });

  const rollupOutputs = (Array.isArray(result) ? result : [result]) as RollupOutput[];
  const outputs: Array<OutputChunk | OutputAsset> = rollupOutputs.flatMap(item => item.output);
  const chunk = outputs.find((output): output is OutputChunk => output.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') {
    throw new Error('Vite did not produce a JavaScript bundle');
  }

  return chunk.code;
}
