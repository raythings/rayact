import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const DEVTOOLS_PROTOCOL_VERSION = 2;
export const DEVTOOLS_CAPABILITIES = Object.freeze([
  'dom-readonly',
  'runtime-console',
  'sources-readonly',
  'network-passive',
  'tracing-basic',
  'memory-counters',
  'react-devtools'
]);

export function reactDevtoolsFrontendRoot() {
  try {
    return require.resolve('@react-native/debugger-frontend')
      .replace(/index\.js$/, 'dist/third-party/front_end');
  } catch {
    return null;
  }
}

export function stockDevtoolsFrontendUrl(host = 'localhost', port = 9229, target = 'devtools/page/rayact-main') {
  return `devtools://devtools/bundled/inspector.html?ws=${host}:${port}/${target}`;
}

export function reactDevtoolsFrontendUrl(baseUrl, port = 9229, target = 'devtools/page/rayact-main') {
  return `${String(baseUrl).replace(/\/$/, '')}/rayact/devtools/rn_fusebox.html?ws=localhost:${port}/${target}`;
}
