import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import type { Plugin, UserConfig } from 'vite';
import type { OutputAsset, OutputChunk, RollupOutput } from 'rollup';
import { build } from 'vite';

const require = createRequire(import.meta.url);

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

const REFRESH_FOOTER = `
globalThis.__RAYACT_HMR_ACTIVE__ = true;
if (__isHotReload) {
  try {
    var __rt = globalThis.__REACT_REFRESH__;
    if (__rt) __rt.performReactRefresh();
  } catch(e) { globalThis.console && globalThis.console.error('[rayact:refresh]', e); }
}
`.trim();

export type RayactBuildMode = 'development' | 'dev-client' | 'release';

export interface BundleOptions {
  root: string;
  entry: string;
  platform: string;
  mode?: RayactBuildMode;
  outDir?: string;
  minify?: boolean;
  bytecode?: boolean;
  desktopBin?: string;
}

export interface RayactAssetRecord {
  id: string;
  name: string;
  type: string;
  hash: string;
  size: number;
  sourcePath: string;
  outputName: string;
  kind: 'asset' | 'worker';
}

export interface RayactBuildOutput {
  code: string;
  bytecode?: Buffer;
  bundleFormat: 'js' | 'qjsbc';
  assets: RayactAssetRecord[];
  entry: string;
  platform: string;
  mode: RayactBuildMode;
  compiler: 'react-compiler';
  binaryCommands: boolean;
}

export const RAYACT_REACT_COMPILER = 'react-compiler' as const;
export const RAYACT_BINARY_COMMANDS = true;
const reactCompilerBabelPlugin = ['babel-plugin-react-compiler', { target: '19' }] as const;

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };
  return types[ext] ?? 'application/octet-stream';
}

function assetId(hash: string, filePath: string): string {
  const cleanName = path.basename(filePath).replace(/[^A-Za-z0-9_.-]/g, '_');
  return `${hash.slice(0, 12)}-${cleanName}`;
}

function isAssetImport(filePath: string, root: string): boolean {
  const relative = normalizePath(path.relative(root, filePath));
  if (relative.split('/').includes('assets')) return true;
  return /\.(?:avif|gif|jpe?g|otf|png|svg|ttf|webp|woff2?)$/i.test(filePath);
}

function isScriptOrStyle(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?|css|scss|sass)$/i.test(filePath);
}

function isWorkerPath(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?|jsc|wasm)$/i.test(filePath);
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

function resolveFileSpecifier(specifier: string, importer: string | undefined, root: string): string | null {
  const candidates: string[] = [];
  if (path.isAbsolute(specifier)) {
    candidates.push(specifier);
  } else if (specifier.startsWith('.') || specifier.startsWith('/')) {
    if (importer && !importer.startsWith('\0')) {
      candidates.push(path.resolve(path.dirname(importer), specifier));
    }
    candidates.push(path.resolve(root, specifier));
  } else {
    try {
      candidates.push(require.resolve(specifier, {
        paths: [importer && !importer.startsWith('\0') ? path.dirname(importer) : root]
      }));
    } catch {
      candidates.push(path.resolve(root, specifier));
      candidates.push(path.resolve(root, 'node_modules', specifier));
    }
  }
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

class AssetRegistry {
  private readonly records = new Map<string, RayactAssetRecord>();

  constructor(private readonly root: string) {}

  add(sourcePath: string, kind: 'asset' | 'worker'): RayactAssetRecord {
    const absolute = path.resolve(sourcePath);
    const bytes = fs.readFileSync(absolute);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const id = assetId(hash, absolute);
    const existing = this.records.get(id);
    if (existing) return existing;
    const name = path.basename(absolute);
    const outputName = `${hash.slice(0, 16)}-${name.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
    const record: RayactAssetRecord = {
      id,
      name,
      type: contentType(absolute),
      hash,
      size: bytes.byteLength,
      sourcePath: normalizePath(path.relative(this.root, absolute)).startsWith('..')
        ? normalizePath(absolute)
        : normalizePath(path.relative(this.root, absolute)),
      outputName,
      kind
    };
    this.records.set(id, record);
    return record;
  }

  all(): RayactAssetRecord[] {
    return [...this.records.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}

function assetExpression(record: RayactAssetRecord): string {
  return `createAsset(${JSON.stringify({
    id: record.id,
    name: record.name,
    type: record.type,
    hash: record.hash,
    size: record.size,
    outputName: `assets/${record.outputName}`,
    kind: record.kind
  })})`;
}

const REACT_EXPORTS = [
  'Children', 'Component', 'Fragment', 'Profiler', 'PureComponent', 'StrictMode',
  'Suspense', 'cloneElement', 'createContext', 'createElement', 'createFactory',
  'createRef', 'forwardRef', 'isValidElement', 'lazy', 'memo', 'startTransition',
  'unstable_act', 'useCallback', 'useContext', 'useDebugValue', 'useDeferredValue',
  'useEffect', 'useId', 'useImperativeHandle', 'useInsertionEffect', 'useLayoutEffect',
  'useMemo', 'useReducer', 'useRef', 'useState', 'useSyncExternalStore', 'useTransition',
  'version', '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
  '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'
];

interface VendorSpec {
  key: string;
  probe: string;
  exports: string[];
}

const VENDOR_MODULES: Record<string, VendorSpec> = {
  react: { key: 'react', probe: 'createElement', exports: REACT_EXPORTS },
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

const REFRESH_RUNTIME_SETUP_ID = 'virtual:rayact-refresh-runtime';
const REACT_NATIVE_VIRTUAL_ID = 'virtual:rayact-react-native';
export const RAYACT_ENTRY_ID = 'virtual:rayact-entry';
const ENTRY_ID = RAYACT_ENTRY_ID;
const DEV_CLIENT_ENTRY_ID = 'virtual:rayact-dev-client-entry';

const RAYACT_PKG_ALIASES: { find: RegExp; pkg: string; src: string }[] = [
  { find: /^@rayact\/react$/, pkg: '@rayact/react', src: 'src/index.ts' },
  { find: /^@rayact\/runtime$/, pkg: '@rayact/runtime', src: 'src/index.ts' },
  { find: /^@rayact\/shared$/, pkg: '@rayact/shared', src: 'src/index.ts' },
  { find: /^@rayact\/shared\/material-icons$/, pkg: '@rayact/shared', src: 'src/material_icons.js' },
  { find: /^@rayact\/navigation$/, pkg: '@rayact/navigation', src: 'src/index.tsx' },
  { find: /^@rayact\/navigation\/native$/, pkg: '@rayact/navigation', src: 'src/native.tsx' },
  { find: /^@rayact\/navigation\/stack$/, pkg: '@rayact/navigation', src: 'src/stack.tsx' },
  { find: /^@rayact\/navigation\/bottom-tabs$/, pkg: '@rayact/navigation', src: 'src/bottom-tabs.tsx' },
  { find: /^@rayact\/crypto$/, pkg: '@rayact/crypto', src: 'src/index.ts' },
  { find: /^@rayact\/dev-client$/, pkg: '@rayact/dev-client', src: 'src/index.ts' }
];

function resolveRayactPackage(root: string, pkg: string, srcRel: string): string {
  const folder = pkg.replace('@rayact/', 'rayact-');
  const monorepoSrc = path.resolve(root, 'packages', folder, srcRel);
  if (fs.existsSync(monorepoSrc)) return normalizePath(monorepoSrc);

  const projectRoot = path.resolve(root);
  const req = createRequire(path.join(projectRoot, 'package.json'));
  try {
    const pkgRoot = path.dirname(req.resolve(`${pkg}/package.json`));
    const srcPath = path.join(pkgRoot, srcRel);
    if (fs.existsSync(srcPath)) return normalizePath(srcPath);
    return normalizePath(req.resolve(pkg));
  } catch {
    const parentMono = path.resolve(projectRoot, '..', '..', 'packages', folder, srcRel);
    if (fs.existsSync(parentMono)) return normalizePath(parentMono);
    throw new Error(`Cannot resolve ${pkg} from ${projectRoot}`);
  }
}

function rayactResolveAliases(root: string): { find: RegExp; replacement: string }[] {
  return RAYACT_PKG_ALIASES.flatMap(({ find, pkg, src }) => {
    try {
      return [{ find, replacement: resolveRayactPackage(root, pkg, src) }];
    } catch {
      return [];
    }
  });
}

function rayactRefreshRuntimePlugin(): Plugin {
  return {
    name: 'rayact-refresh-runtime',
    enforce: 'pre',
    resolveId(id) {
      if (id === REFRESH_RUNTIME_SETUP_ID) return `\0${REFRESH_RUNTIME_SETUP_ID}`;
      return null;
    },
    load(id) {
      if (id !== `\0${REFRESH_RUNTIME_SETUP_ID}`) return null;
      return [
        `import RefreshRuntime from 'react-refresh/runtime';`,
        `if (!globalThis.__REACT_REFRESH__) {`,
        `  RefreshRuntime.injectIntoGlobalHook(globalThis);`,
        `  globalThis.__REACT_REFRESH__ = RefreshRuntime;`,
        `}`,
        `globalThis.$RefreshSig$ = function() { return RefreshRuntime.createSignatureFunctionForTransform(); };`
      ].join('\n');
    }
  };
}

// react-native shim: code imported from `react-native` (e.g. upstream
// react-navigation/native's useBackButton.native.tsx does
// `import { BackHandler } from 'react-native'`) needs to resolve to our
// @rayact/react implementation. We don't want to ship a full react-native
// polyfill, so we only wire the names we actually use and forward them
// to our existing engine-side modules. New uses can be added here.
function reactNativeShimPlugin(): Plugin {
  return {
    name: 'rayact-react-native-shim',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'react-native') return `\0${REACT_NATIVE_VIRTUAL_ID}`;
      return null;
    },
    load(id) {
      if (id !== `\0${REACT_NATIVE_VIRTUAL_ID}`) return null;
      return [
        // BackHandler: RN-compatible hardware-back API on rayact. See
        // packages/rayact-react/src/BackHandler.ts. Also re-exported from
        // @rayact/navigation so app code can import it from either place.
        `export { BackHandler, useBackHandler } from '@rayact/react';`,
        `export type { BackHandlerSubscription } from '@rayact/react';`
      ].join('\n');
    }
  };
}

export function rayactVitePlugin(options: BundleOptions, registry = new AssetRegistry(path.resolve(options.root))): Plugin {
  const root = path.resolve(options.root);
  const resolvedEntry = normalizePath(path.resolve(root, options.entry));
  const mode = options.mode ?? 'development';

  return {
    name: 'rayact-vite',
    enforce: 'pre',
    config(): UserConfig {
      return {
        define: {
          __RAYACT_PLATFORM__: JSON.stringify(options.platform)
        },
        resolve: {
          alias: rayactResolveAliases(root)
        }
      };
    },
    resolveId(id, importer) {
      if (id === ENTRY_ID) return `\0${ENTRY_ID}`;
      if (id === DEV_CLIENT_ENTRY_ID) return `\0${DEV_CLIENT_ENTRY_ID}`;

      const cssFile = resolveCssFile(id, importer, root);
      if (cssFile) return `\0rayact-css:${encodeURIComponent(cssFile)}.js`;

      const file = resolveFileSpecifier(id, importer, root);
      if (file && isAssetImport(file, root) && !isScriptOrStyle(file)) {
        return `\0rayact-asset:${encodeURIComponent(file)}.js`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith('\0rayact-css:')) {
        const encoded = id.slice('\0rayact-css:'.length, -'.js'.length);
        const cssFile = decodeURIComponent(encoded);
        const nativePath = toNativeCssPath(cssFile, root);
        return [
          `const cssClasses = globalThis.importCSS(${JSON.stringify(nativePath)});`,
          'export default cssClasses;'
        ].join('\n');
      }

      if (id.startsWith('\0rayact-asset:')) {
        const encoded = id.slice('\0rayact-asset:'.length, -'.js'.length);
        const assetFile = decodeURIComponent(encoded);
        const record = registry.add(assetFile, 'asset');
        return [
          `import { createAsset } from '@rayact/runtime';`,
          `export default ${assetExpression(record)};`
        ].join('\n');
      }

      if (id === `\0${DEV_CLIENT_ENTRY_ID}`) {
        return [
          `import React from 'react';`,
          `import { render } from '@rayact/react';`,
          `import '@rayact/shared/material-icons';`,
          `import { DevLauncherProvider, DevLauncherUI, DevMenu, InspectorPanel, DevConsole, installDevConsoleCapture } from '@rayact/dev-client';`,
          `installDevConsoleCapture();`,
          `import { createBridge, createDevClient, installConsoleForwarding } from '@rayact/runtime';`,
          `const serverUrl = globalThis.__RAYACT_DEV_SERVER__;`,
          `const bridge = createBridge(globalThis);`,
          `if (serverUrl) {`,
          `  const client = createDevClient({ serverUrl, bridge, global: globalThis });`,
          `  installConsoleForwarding(client, globalThis);`,
          `  client.connect();`,
          `}`,
          `render(`,
          `  React.createElement(DevLauncherProvider, null,`,
          `    React.createElement(DevLauncherUI),`,
          `    React.createElement(DevMenu),`,
          `    React.createElement(InspectorPanel),`,
          `    React.createElement(DevConsole)`,
          `  )`,
          `);`
        ].join('\n');
      }

      if (id !== `\0${ENTRY_ID}`) return null;
      const imports = [
        // Polyfill first so the React reconciler (which calls crypto.getRandomValues
        // for fiber IDs during the very first commit) finds it on globalThis.
        `import ${JSON.stringify('@rayact/crypto')};`,
        `globalThis.__RAYACT_ENTRY__ = ${JSON.stringify(resolvedEntry)};`
      ];
      if (mode === 'development') {
        imports.push(`import ${JSON.stringify(REFRESH_RUNTIME_SETUP_ID)};`);
      }
      imports.push(`import ${JSON.stringify(resolvedEntry)};`);
      return imports.join('\n');
    },
    async transform(source, id) {
      if (id.startsWith('\0') || !/\.[cm]?[jt]sx?$/.test(id)) return null;
      const workerCall = /spawnWorker\s*\(\s*(['"])([^'"]+\.(?:wasm|jsc|[cm]?[jt]sx?))\1/g;
      let changed = false;
      const imports = new Map<string, string>();
      const transformed = source.replace(workerCall, (match, quote: string, specifier: string) => {
        const file = resolveFileSpecifier(specifier, id, root);
        if (!file || !isWorkerPath(file)) return match;
        const record = registry.add(file, 'worker');
        const local = `__rayactWorkerAsset${imports.size}`;
        imports.set(local, assetExpression(record));
        changed = true;
        return `spawnWorker(${local}`;
      });
      if (!changed) return null;
      return {
        code: [
          `import { createAsset } from '@rayact/runtime';`,
          ...[...imports].map(([local, expr]) => `const ${local} = ${expr};`),
          transformed
        ].join('\n'),
        map: null
      };
    }
  };
}

function extractCode(result: Awaited<ReturnType<typeof build>>): string {
  const rollupOutputs = (Array.isArray(result) ? result : [result]) as RollupOutput[];
  const outputs: Array<OutputChunk | OutputAsset> = rollupOutputs.flatMap(item => item.output);
  const chunk = outputs.find((output): output is OutputChunk => output.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') {
    throw new Error('Vite did not produce a JavaScript bundle');
  }
  return chunk.code;
}

function shouldMinify(options: BundleOptions): boolean {
  if (options.minify !== undefined) return options.minify;
  return options.mode === 'release';
}

export function createRayactViteConfig(options: BundleOptions, input = ENTRY_ID): UserConfig {
  const mode = options.mode ?? 'development';
  const root = path.resolve(options.root);
  const isDev = mode === 'development';
  const minify = shouldMinify(options);
  const registry = new AssetRegistry(root);

  return {
    root,
    mode: isDev ? 'development' : 'production',
    resolve: {
      alias: [{ find: /^nanoid\/non-secure$/, replacement: 'nanoid' }]
    },
    plugins: [
      ...(isDev ? [vendorSharePlugin()] : []),
      rayactVitePlugin({ ...options, root, mode }, registry),
      reactNativeShimPlugin(),
      ...(isDev ? [rayactRefreshRuntimePlugin()] : []),
      react({
        babel: {
          plugins: [
            // React Compiler — auto-memoizes components + JSX so unchanged
            // subtrees skip re-render/reconciliation (the dominant update cost in
            // QuickJS). Must run first; target 19 uses React 19's built-in
            // compiler runtime (react/compiler-runtime).
            reactCompilerBabelPlugin,
            ...(isDev ? [['react-refresh/babel', { skipEnvCheck: true }]] : [])
          ]
        }
      })
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
      // Branding + bundled-module list for a prebuilt dev app. The env values are
      // already JSON text, so they inline as object/array literals the dev client
      // reads via officialApp.ts. Default to empty when building a normal app.
      __RAYACT_OFFICIAL_APP__:
        process.env.RAYACT_DEV_CLIENT_OFFICIAL_APP_METADATA_JSON || '{}',
      __RAYACT_BUNDLED_MODULES__:
        process.env.RAYACT_DEV_CLIENT_BUNDLED_MODULES_JSON || '[]'
    },
    build: {
      outDir: options.outDir ? path.resolve(options.outDir) : 'dist',
      emptyOutDir: true,
      minify,
      sourcemap: isDev && !minify ? 'inline' : true,
      target: 'es2020',
      rollupOptions: {
        input,
        output: {
          format: 'iife',
          name: mode === 'dev-client' ? 'RayactDevClientBundle' : 'RayactBundle',
          inlineDynamicImports: true,
          extend: true,
          entryFileNames: mode === 'dev-client' ? 'dev-client.js' : 'bundle.js',
          banner: isDev ? REFRESH_BANNER : undefined,
          footer: isDev ? REFRESH_FOOTER : undefined
        }
      }
    }
  };
}

async function runViteBuild(options: BundleOptions, registry: AssetRegistry, input: string): Promise<string> {
  const result = await build({
    ...createRayactViteConfig({ ...options, outDir: undefined }, input),
    configFile: false,
    logLevel: 'silent',
    build: {
      ...createRayactViteConfig({ ...options, outDir: undefined }, input).build,
      write: false
    }
  });
  return extractCode(result);
}

export async function buildRayactBundle(options: BundleOptions): Promise<RayactBuildOutput> {
  const mode = options.mode ?? 'development';
  const root = path.resolve(options.root);
  const registry = new AssetRegistry(root);
  const input = mode === 'dev-client' ? DEV_CLIENT_ENTRY_ID : ENTRY_ID;
  const code = await runViteBuild({ ...options, root, mode }, registry, input);

  const useBytecode = options.bytecode ?? (mode === 'release');
  let bytecode: Buffer | undefined;
  let bundleFormat: 'js' | 'qjsbc' = 'js';

  if (useBytecode) {
    const { compileToBytecode } = await import('./compile.js');
    bytecode = await compileToBytecode(code, { root, desktopBin: options.desktopBin });
    bundleFormat = 'qjsbc';
  }

  return {
    code,
    bytecode,
    bundleFormat,
    assets: registry.all(),
    entry: normalizePath(path.relative(root, path.resolve(root, options.entry))),
    platform: options.platform,
    mode,
    compiler: RAYACT_REACT_COMPILER,
    binaryCommands: RAYACT_BINARY_COMMANDS
  };
}

export async function bundleRayactApp(options: BundleOptions): Promise<string> {
  return (await buildRayactBundle({ ...options, mode: options.mode ?? 'development' })).code;
}

export async function writeRayactBuild(options: BundleOptions): Promise<RayactBuildOutput> {
  if (!options.outDir) {
    throw new Error('writeRayactBuild requires outDir');
  }
  const output = await buildRayactBundle(options);
  const outDir = path.resolve(options.outDir);
  const assetDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetDir, { recursive: true });
  const bundleName = output.mode === 'dev-client' ? 'dev-client.js' : 'bundle.js';
  fs.writeFileSync(path.join(outDir, bundleName), output.code);
  if (output.bytecode) {
    const bcName = output.mode === 'dev-client' ? 'dev-client.qjsbc' : 'bundle.qjsbc';
    fs.writeFileSync(path.join(outDir, bcName), output.bytecode);
  }

  for (const asset of output.assets) {
    const sourcePath = path.isAbsolute(asset.sourcePath)
      ? asset.sourcePath
      : path.resolve(options.root, asset.sourcePath);
    fs.copyFileSync(sourcePath, path.join(assetDir, asset.outputName));
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({
    entry: output.entry,
    platform: output.platform,
    mode: output.mode,
    compiler: output.compiler,
    binaryCommands: output.binaryCommands,
    bundleFormat: output.bundleFormat,
    bundle: output.bundleFormat === 'qjsbc'
      ? (output.mode === 'dev-client' ? 'dev-client.qjsbc' : 'bundle.qjsbc')
      : bundleName,
    assets: output.assets.map(asset => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      hash: asset.hash,
      size: asset.size,
      outputName: `assets/${asset.outputName}`,
      kind: asset.kind
    }))
  }, null, 2));

  return output;
}
