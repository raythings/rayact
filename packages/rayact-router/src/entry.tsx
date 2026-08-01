// @rayact/router/entry — the zero-wiring application entry. Selected either
// explicitly via rayact.config.json { "entry": "@rayact/router/entry" } or
// automatically when the project has an app/ directory and no entry of its
// own. Mirrors the shape of a scaffolded src/App.tsx entry.
import * as React from 'react';
import { render } from '@rayact/react';
import { ctx } from 'virtual:rayact-routes';
import { RouterRoot } from './runtime/RouterRoot.js';
import type { RouteContext } from './manifest/types.js';

type EntryHost = typeof globalThis & {
  initRaylib?: (width: number, height: number, title: string) => void;
  __RAYACT_OFFICIAL_APP__?: { name?: string };
};

const host = globalThis as EntryHost;
if (typeof host.initRaylib === 'function') {
  host.initRaylib(800, 600, host.__RAYACT_OFFICIAL_APP__?.name || 'Rayact');
}

render(React.createElement(RouterRoot, { ctx: ctx as RouteContext }));
