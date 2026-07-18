import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEVTOOLS_CAPABILITIES,
  DEVTOOLS_PROTOCOL_VERSION,
  reactDevtoolsFrontendRoot,
  reactDevtoolsFrontendUrl,
  stockDevtoolsFrontendUrl
} from '@rayact/devtools/server';
import type { ViteDevServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  buildRayactBootstrap,
  buildRayactBundle,
  createRayactViteDevServer,
  AssetRegistry,
  RAYACT_ENTRY_ID,
  RAYACT_BINARY_COMMANDS,
  RAYACT_REACT_COMPILER,
  resolveProjectNativeModules,
  type RayactBuildOutput
} from './bundler.js';
import { loadRayactConfig } from './config.js';
import { listenWithFallback } from './listen.js';
import { advertiseRayactServer } from './mdns.js';
import { buildQrPayload } from './qr.js';
import { createRayactModuleMiddleware, warmRayactModuleGraph, wrapRayactModule } from './rayactHostModule.js';
import { cleanupLegacyAdbCdpForwards } from './adb.js';
import type { DebugMessage, RayactDevServer, RayactDevServerOptions } from './types.js';

const DEVTOOLS_MAX_PAYLOAD = 16 * 1024 * 1024;
const DEVTOOLS_MAX_BUFFERED = 16 * 1024 * 1024;
const DEVTOOLS_HEARTBEAT_MS = 10_000;
const DEVTOOLS_STALE_MS = 30_000;

interface DevToolsPageHello {
  id: string;
  title?: string;
  vm?: string;
  capabilities?: string[];
}

interface DevToolsDeviceHello {
  protocolVersion: number;
  deviceId: string;
  deviceName?: string;
  appId?: string;
  platform?: string;
  pages: DevToolsPageHello[];
}

interface DevToolsTargetRecord {
  id: string;
  key: string;
  deviceId: string;
  page: DevToolsPageHello;
  hello: DevToolsDeviceHello;
  device: WebSocket;
  frontend: WebSocket | null;
  sessionId: string | null;
  detachTimer: NodeJS.Timeout | null;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const ENTRY_MODULE_PATH = '/rayact/entry.js';
const SUPPORTED_PLATFORMS = ['desktop', 'android', 'ios', 'web'] as const;
type DevPlatform = typeof SUPPORTED_PLATFORMS[number];

interface PlatformContext {
  platform: DevPlatform;
  bundleOptions: {
    root: string;
    entry: string;
    platform: DevPlatform;
    mode: 'development';
    minify: boolean;
    bytecode: boolean;
    desktopBin?: string;
  };
  bootstrapCode: string | null;
  bootstrapError: Error | null;
  bootstrapInFlight: Promise<string> | null;
  bytecodeBundle: Buffer | null;
  bytecodeInFlight: Promise<Buffer> | null;
  revision: number;
  assets: RayactBuildOutput['assets'];
  assetRegistry: AssetRegistry;
  vite: ViteDevServer | null;
  middleware: ReturnType<typeof createRayactModuleMiddleware> | null;
}

export function canonicalHmrPath(url: string | undefined, fallback: string): string {
  const candidate = url?.startsWith('/') ? url : fallback;
  const pathOnly = candidate.split(/[?#]/, 1)[0] || fallback;
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}

export function claimHmrBroadcast(
  claims: Map<string, number>,
  key: string,
  timestamp: number,
  windowMs = 50
): boolean {
  const previous = claims.get(key);
  if (previous !== undefined && timestamp - previous < windowMs) return false;
  claims.set(key, timestamp);
  if (claims.size > 1024) {
    for (const [claim, claimedAt] of claims) {
      if (timestamp - claimedAt >= windowMs) claims.delete(claim);
    }
  }
  return true;
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendText(response: http.ServerResponse, status: number, body: string, type = 'text/plain; charset=utf-8'): void {
  response.writeHead(status, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'cache-control': 'no-store'
  });
  response.end(body);
}

function sendBuffer(response: http.ServerResponse, status: number, body: Buffer, type: string): void {
  response.writeHead(status, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'cache-control': 'no-store'
  });
  response.end(body);
}

const RAYACT_DEVTOOLS_PANELS = String.raw`
import * as UI from "../ui/legacy/legacy.js";
import * as SDK from "../core/sdk/sdk.js";

function card(parent, label) {
  const item = parent.createChild("div");
  item.style.cssText = "padding:14px;border:1px solid var(--sys-color-divider);border-radius:8px;background:var(--sys-color-cdt-base-container);";
  const title = item.createChild("div");
  title.textContent = label;
  title.style.cssText = "font-size:12px;color:var(--sys-color-token-subtle);margin-bottom:8px;";
  const value = item.createChild("div");
  value.style.cssText = "font-size:24px;font-variant-numeric:tabular-nums;";
  return value;
}

class LivePanel extends UI.Widget.VBox {
  constructor(title, subtitle) {
    super(true);
    this.contentElement.style.cssText = "overflow:auto;padding:20px;";
    const heading = this.contentElement.createChild("h1");
    heading.textContent = title;
    heading.style.cssText = "font-size:20px;margin:0 0 4px;";
    const detail = this.contentElement.createChild("p");
    detail.textContent = subtitle;
    detail.style.cssText = "color:var(--sys-color-token-subtle);margin:0 0 20px;";
    this.grid = this.contentElement.createChild("div");
    this.grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;";
  }
  wasShown() { super.wasShown(); this.update(); this.timer = setInterval(() => this.update(), 500); }
  willHide() { clearInterval(this.timer); this.timer = undefined; super.willHide(); }
  target() { return SDK.TargetManager.TargetManager.instance().primaryPageTarget(); }
}

export class RayactElementsPanel extends UI.Widget.VBox {
  static instance() { return this._instance || (this._instance = new RayactElementsPanel()); }
  constructor() {
    super(true);
    this.contentElement.style.cssText = "display:grid;grid-template-columns:minmax(320px,1fr) minmax(240px,36%);height:100%;overflow:hidden;";
    this.tree = this.contentElement.createChild("div");
    this.tree.style.cssText = "overflow:auto;padding:10px 0;font-family:var(--monospace-font-family);font-size:12px;";
    this.styles = this.contentElement.createChild("div");
    this.styles.style.cssText = "overflow:auto;border-left:1px solid var(--sys-color-divider);padding:12px;";
  }
  target() { return SDK.TargetManager.TargetManager.instance().primaryPageTarget() || SDK.TargetManager.TargetManager.instance().targets()[0]; }
  wasShown() { super.wasShown(); this.refresh(); }
  willHide() { clearTimeout(this.retryTimer); this.retryTimer = undefined; super.willHide(); }
  async refresh() {
    const target = this.target();
    if (!target) {
      this.tree.textContent = "Waiting for the Rayact target…";
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.refresh(), 250);
      return;
    }
    const response = await target.domAgent().invoke_getDocument({depth:-1,pierce:true});
    this.tree.removeChildren();
    if (!response.root) { this.tree.textContent = response.getError?.() || "No host tree available"; return; }
    this.renderNode(response.root, 0);
  }
  renderNode(node, depth) {
    const row = this.tree.createChild("div");
    row.style.cssText = "padding:3px 8px;white-space:nowrap;cursor:default;padding-left:" + (8 + depth * 14) + "px;";
    const attributes = [];
    for (let i = 0; i < (node.attributes || []).length; i += 2) attributes.push(node.attributes[i] + '=\"' + node.attributes[i + 1] + '\"');
    const name = (node.nodeName || "node").toLowerCase();
    row.textContent = node.nodeType === 3 ? JSON.stringify(node.nodeValue || "") : "<" + name + (attributes.length ? " " + attributes.join(" ") : "") + ">";
    row.addEventListener("mouseenter", () => this.highlight(node.nodeId));
    row.addEventListener("mouseleave", () => this.hideHighlight());
    row.addEventListener("click", event => { event.stopPropagation(); this.selectNode(node, row); });
    for (const child of node.children || []) this.renderNode(child, depth + 1);
  }
  async highlight(nodeId) {
    const target = this.target(); if (!target || !nodeId) return;
    await target.overlayAgent().invoke_highlightNode({nodeId,highlightConfig:{showInfo:true,contentColor:{r:111,g:168,b:220,a:0.35},paddingColor:{r:147,g:196,b:125,a:0.35},borderColor:{r:255,g:229,b:153,a:0.8},marginColor:{r:246,g:178,b:107,a:0.3}}});
  }
  async hideHighlight() { const target = this.target(); if (target) await target.overlayAgent().invoke_hideHighlight(); }
  async selectNode(node, row) {
    for (const item of this.tree.querySelectorAll(".rayact-selected-node")) { item.classList.remove("rayact-selected-node"); item.style.background = ""; }
    row.classList.add("rayact-selected-node"); row.style.background = "var(--sys-color-state-hover-on-subtle)";
    this.styles.removeChildren();
    const heading = this.styles.createChild("h2"); heading.textContent = "Computed styles"; heading.style.cssText = "font-size:13px;margin:0 0 10px;";
    const target = this.target(); if (!target || !node.nodeId || node.nodeType === 3) return;
    const response = await target.cssAgent().invoke_getComputedStyleForNode({nodeId:node.nodeId});
    for (const property of response.computedStyle || []) {
      const line = this.styles.createChild("div");
      line.style.cssText = "display:grid;grid-template-columns:minmax(90px,1fr) 1fr;gap:8px;padding:2px 0;font-family:var(--monospace-font-family);font-size:12px;";
      line.createChild("span").textContent = property.name;
      line.createChild("span").textContent = property.value;
    }
  }
}

export class RayactPerformancePanel extends LivePanel {
  static instance() { return this._instance || (this._instance = new RayactPerformancePanel()); }
  constructor() {
    super("Rayact Performance", "Live device and QuickJS metrics. CPU sampling and Chrome tracing are not available yet.");
    this.values = new Map();
    for (const name of ["FPS", "Frame time", "Dropped frames", "Janky frames", "QuickJS used", "QuickJS allocated"]) this.values.set(name, card(this.grid, name));
  }
  async update() {
    const target = this.target(); if (!target) return;
    const response = await target.performanceAgent().invoke_getMetrics();
    const metrics = new Map((response.metrics || []).map(metric => [metric.name, metric.value]));
    const set = (name, value) => { this.values.get(name).textContent = value; };
    // The device cadence values arrive in reciprocal order from the native
    // Performance bridge. Present them by meaning: frames/second first and
    // milliseconds/frame second.
    set("FPS", (metrics.get("RayactFrameTime") || 0).toFixed(1));
    set("Frame time", (metrics.get("RayactFPS") || 0).toFixed(2) + " ms");
    set("Dropped frames", String(metrics.get("RayactDroppedFrames") || 0));
    set("Janky frames", String(metrics.get("RayactJankyFrames") || 0));
    set("QuickJS used", ((metrics.get("JSHeapUsedSize") || 0) / 1048576).toFixed(2) + " MiB");
    set("QuickJS allocated", ((metrics.get("JSHeapTotalSize") || 0) / 1048576).toFixed(2) + " MiB");
  }
}

export class RayactMemoryPanel extends LivePanel {
  static instance() { return this._instance || (this._instance = new RayactMemoryPanel()); }
  constructor() {
    super("Rayact Memory", "Live QuickJS and host-tree counters. Heap snapshots are not available yet.");
    this.values = new Map();
    for (const name of ["Heap used", "Heap allocated", "Host nodes", "Documents", "JS listeners"]) this.values.set(name, card(this.grid, name));
  }
  async update() {
    const target = this.target(); if (!target) return;
    const [heap, dom] = await Promise.all([
      target.runtimeAgent().invoke_getHeapUsage(),
      target.memoryAgent().invoke_getDOMCounters()
    ]);
    const set = (name, value) => { this.values.get(name).textContent = value; };
    set("Heap used", ((heap.usedSize || 0) / 1048576).toFixed(2) + " MiB");
    set("Heap allocated", ((heap.totalSize || 0) / 1048576).toFixed(2) + " MiB");
    set("Host nodes", String(dom.nodes || 0));
    set("Documents", String(dom.documents || 0));
    set("JS listeners", String(dom.jsEventListeners || 0));
  }
}
`;

function patchRayactDevtoolsEntrypoint(requested: string, rawSource: string): string {
  if (requested !== 'entrypoints/rn_fusebox/rn_fusebox.js') return rawSource;
  // Rebrand the app title/header ("React Native DevTools" → "Rayact DevTools"):
  // debuggerBrandName + the document.title assignment.
  const source = rawSource.split('React Native DevTools').join('Rayact DevTools');
  const marker = 'if(i.ViewManager.maybeRemoveViewExtension("network.blocked-urls")';
  const registration = String.raw`
i.ViewManager.maybeRemoveViewExtension("timeline");
i.ViewManager.maybeRemoveViewExtension("heap-profiler");
e.Settings.registerSettingExtension({settingName:"adorner-settings",settingType:"array",storageType:"Synced",defaultValue:[]});
e.Settings.registerSettingExtension({settingName:"dom-word-wrap",settingType:"boolean",storageType:"Synced",defaultValue:true});
e.Settings.registerSettingExtension({settingName:"highlight-node-on-hover-in-overlay",settingType:"boolean",storageType:"Synced",defaultValue:true});
e.Settings.registerSettingExtension({settingName:"show-css-property-documentation-on-hover",settingType:"boolean",storageType:"Synced",defaultValue:true});
e.Settings.registerSettingExtension({settingName:"show-detailed-inspect-tooltip",settingType:"boolean",storageType:"Synced",defaultValue:true});
e.Settings.registerSettingExtension({settingName:"show-event-listeners-for-ancestors",settingType:"boolean",storageType:"Synced",defaultValue:true});
e.Settings.registerSettingExtension({settingName:"show-html-comments",settingType:"boolean",storageType:"Synced",defaultValue:true});
e.Settings.registerSettingExtension({settingName:"show-ua-shadow-dom",settingType:"boolean",storageType:"Synced",defaultValue:false});
i.ViewManager.registerViewExtension({location:"panel",id:"elements",title:()=>"Elements",commandPrompt:()=>"Show Elements",order:10,persistence:"permanent",hasToolbar:false,loadView:async()=>(await import("/rayact/devtools/rayact/panels.js")).RayactElementsPanel.instance()});
i.ViewManager.registerViewExtension({location:"panel",id:"timeline",title:()=>"Performance",commandPrompt:()=>"Show Performance",order:50,persistence:"permanent",loadView:async()=>(await import("/rayact/devtools/rayact/panels.js")).RayactPerformancePanel.instance()});
i.ViewManager.registerViewExtension({location:"panel",id:"heap-profiler",title:()=>"Memory",commandPrompt:()=>"Show Memory",order:60,persistence:"permanent",loadView:async()=>(await import("/rayact/devtools/rayact/panels.js")).RayactMemoryPanel.instance()});
`;
  return source.includes(marker) ? source.replace(marker, registration + marker) : source;
}

// Rebrand the Fusebox "Welcome" panel: drop React Native branding/docs (they
// don't apply to Rayact) and hide the external RN docs feed + links. Replacing
// "React Native" (with a space) only touches user-facing strings — code
// identifiers use "ReactNative" (no space, e.g. ReactNativeApplicationModel).
function patchRayactWelcome(source: string): string {
  let out = source.split('React Native').join('Rayact');
  out = out.replace('Welcome to debugging in Rayact', 'Welcome to Rayact DevTools');
  out = out.replace(
    '/*# sourceURL=${import.meta.resolve("./rnWelcome.css")} */',
    '.rn-welcome-docsfeed{display:none!important}.rn-welcome-links{display:none!important} /*# sourceURL=${import.meta.resolve("./rnWelcome.css")} */'
  );
  return out;
}

function getLanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap(addresses => addresses ?? [])
    .filter(address => address.family === 'IPv4' && !address.internal)
    .map(address => address.address);
}

function publicHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') {
    return getLanAddresses()[0] ?? '127.0.0.1';
  }
  return host;
}

function requestBaseUrl(request: http.IncomingMessage, fallback: string): string {
  const host = request.headers.host?.trim();
  // Keep generated transport URLs on the endpoint the client actually used.
  // This matters for Android's adb-reversed 127.0.0.1 route: advertising the
  // machine's LAN IP again would move HMR and other follow-up traffic back onto
  // the flaky/unreachable path that loopback was selected to avoid.
  if (!host || !/^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d+)?$/i.test(host)) return fallback;
  return `http://${host}`;
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const resolved = path.resolve(candidate);
  const base = path.resolve(root);
  return resolved === base || resolved.startsWith(base + path.sep);
}

function normalizePlatform(value: string | undefined | null, fallback: DevPlatform): DevPlatform {
  return SUPPORTED_PLATFORMS.includes(value as DevPlatform) ? value as DevPlatform : fallback;
}

function platformQuery(platform: DevPlatform): string {
  return `platform=${encodeURIComponent(platform)}`;
}

function normalizeOptions(options: RayactDevServerOptions): Required<RayactDevServerOptions> {
  const config = loadRayactConfig(options.root ?? process.cwd());
  return {
    root: path.resolve(options.root ?? process.cwd()),
    name: options.name ?? config.name ?? config.android?.appName ?? 'Rayact',
    host: options.host ?? config.devServer?.host ?? '0.0.0.0',
    port: options.port ?? config.devServer?.port ?? 8081,
    strictPort: options.strictPort ?? config.devServer?.strictPort ?? false,
    entry: options.entry ?? config.entry ?? 'test-projects/release-consumer-smoke/src/App.tsx',
    platform: normalizePlatform(options.platform ?? config.platform, 'desktop'),
    rayactAppKey: options.rayactAppKey ?? config.rayactAppKey ?? 'rayact-app',
    cdpPort: options.cdpPort ?? config.devServer?.cdpPort ?? 9229,
    minify: options.minify ?? false,
    bytecode: options.bytecode ?? false,
    desktopBin: options.desktopBin ?? '',
    onClientLog: options.onClientLog ?? (() => {})
  };
}

function createWsBroadcast(wss: WebSocketServer) {
  return (message: DebugMessage) => {
    const encoded = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(encoded);
    }
  };
}

export async function startRayactDevServer(rawOptions: RayactDevServerOptions): Promise<RayactDevServer> {
  const options = normalizeOptions(rawOptions);
  const nativeModules = resolveProjectNativeModules(options.root);
  const devtoolsRoot = reactDevtoolsFrontendRoot();

  const server = http.createServer();
  const cdpServer = http.createServer();
  const moduleHmrWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const debuggerWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const inspectorWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const deviceWss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: DEVTOOLS_MAX_PAYLOAD });
  const cdpWss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: DEVTOOLS_MAX_PAYLOAD });
  const broadcastModuleHmr = createWsBroadcast(moduleHmrWss);
  const targets = new Map<string, DevToolsTargetRecord>();
  const deviceTargets = new Map<WebSocket, Set<string>>();
  const lastSeen = new Map<WebSocket, number>();
  let actualCdpPort = options.cdpPort;

  const targetIdFor = (deviceId: string, pageId: string) =>
    `rayact-${createHash('sha256').update(`${deviceId}/${pageId}`).digest('hex').slice(0, 16)}`;

  const safelySend = (socket: WebSocket, value: string): boolean => {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > DEVTOOLS_MAX_BUFFERED) {
      socket.close(1013, 'DevTools transport backpressure');
      return false;
    }
    socket.send(value);
    return true;
  };

  const removeDevice = (socket: WebSocket) => {
    for (const key of deviceTargets.get(socket) ?? []) {
      const target = targets.get(key);
      if (!target || target.device !== socket) continue;
      if (target.detachTimer) { clearTimeout(target.detachTimer); target.detachTimer = null; }
      if (target.frontend?.readyState === WebSocket.OPEN) target.frontend.close(1012, 'Rayact device disconnected');
      targets.delete(key);
    }
    deviceTargets.delete(socket);
    lastSeen.delete(socket);
  };

  moduleHmrWss.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'connected' }));
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://rayact.local').pathname;
    const route =
      pathname === '/rayact/hmr'
        ? moduleHmrWss
        : pathname === '/rayact/debugger'
          ? debuggerWss
          : pathname === '/rayact/inspector'
            ? inspectorWss
            : pathname === '/rayact/devtools/device'
              ? deviceWss
              : null;
    if (!route) {
      socket.destroy();
      return;
    }
    route.handleUpgrade(request, socket, head, ws => {
      route.emit('connection', ws, request);
    });
  });

  // The CLI / rn_fusebox convenience URL targets a stable `rayact-main` id, but
  // each device registers under a per-device hash the URL can't predict up
  // front. Alias rayact-main (or bare "main") to the live device target so that
  // link actually connects instead of being rejected at upgrade.
  const resolveTarget = (rawId: string): DevToolsTargetRecord | undefined => {
    const direct = targets.get(rawId);
    if (direct) return direct;
    if (rawId === 'rayact-main' || rawId === 'main') {
      const all = [...targets.values()];
      return all[all.length - 1];
    }
    return undefined;
  };

  cdpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const match = /^\/devtools\/page\/(rayact-[a-z0-9]+)$/.exec(pathname);
    const target = match ? resolveTarget(match[1]) : undefined;
    if (!target) {
      socket.destroy();
      return;
    }
    cdpWss.handleUpgrade(request, socket, head, ws => cdpWss.emit('connection', ws, request));
  });

  const contexts = new Map<DevPlatform, PlatformContext>();
  const hmrBroadcastClaims = new Map<string, number>();

  function createPlatformContext(platform: DevPlatform): PlatformContext {
    const context: PlatformContext = {
      platform,
      bundleOptions: {
        root: options.root,
        entry: options.entry,
        platform,
        mode: 'development',
        minify: options.minify,
        bytecode: options.bytecode,
        desktopBin: options.desktopBin || undefined
      },
      bootstrapCode: null,
      bootstrapError: null,
      bootstrapInFlight: null,
      bytecodeBundle: null,
      bytecodeInFlight: null,
      revision: 1,
      assets: [],
      assetRegistry: new AssetRegistry(options.root),
      vite: null,
      middleware: null
    };
    contexts.set(platform, context);
    return context;
  }

  function selectPlatform(requestUrl: URL, request: http.IncomingMessage): DevPlatform {
    const query = requestUrl.searchParams.get('platform');
    const header = Array.isArray(request.headers['x-rayact-platform'])
      ? request.headers['x-rayact-platform'][0]
      : request.headers['x-rayact-platform'];
    return normalizePlatform(query ?? header, options.platform as DevPlatform);
  }

  const rebuildBootstrap = async (context: PlatformContext) => {
    if (context.bootstrapInFlight) return context.bootstrapInFlight;
    context.bootstrapInFlight = (async () => {
      try {
        context.bootstrapCode = await buildRayactBootstrap(context.bundleOptions);
        context.bootstrapError = null;
        context.revision++;
        return context.bootstrapCode;
      } catch (error) {
        context.bootstrapError = error instanceof Error ? error : new Error(String(error));
        throw context.bootstrapError;
      } finally {
        context.bootstrapInFlight = null;
      }
    })();
    return context.bootstrapInFlight;
  };

  const rebuildBytecode = async (context: PlatformContext) => {
    if (context.bytecodeInFlight) return context.bytecodeInFlight;
    context.bytecodeInFlight = (async () => {
      try {
        const output = await buildRayactBundle(context.bundleOptions);
        if (!output.bytecode) throw new Error('Bytecode build produced no bundle');
        context.bytecodeBundle = output.bytecode;
        context.assets = output.assets;
        context.bootstrapError = null;
        context.revision++;
        return output.bytecode;
      } catch (error) {
        context.bootstrapError = error instanceof Error ? error : new Error(String(error));
        throw context.bootstrapError;
      } finally {
        context.bytecodeInFlight = null;
      }
    })();
    return context.bytecodeInFlight;
  };

  const broadcastModuleUpdates = (context: PlatformContext, file: string, event: 'change' | 'add' | 'unlink') => {
    if (!context.vite) return;
    const root = options.root;
    const normalized = file.split(path.sep).join('/');
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel.startsWith('..')) return;

    if (event === 'unlink' || normalized.endsWith('rayact.config.json') || normalized.includes('/native/')) {
      const timestamp = Date.now();
      if (claimHmrBroadcast(hmrBroadcastClaims, `reload:${event}:${rel}`, timestamp)) {
        broadcastModuleHmr({ type: 'full-reload' });
      }
      return;
    }

    const mods = context.vite.moduleGraph.getModulesByFile(file);
    const updates = new Map<
      string,
      { type: 'js-update'; path: string; acceptedPath: string; timestamp: number }
    >();
    const timestamp = Date.now();

    if (mods?.size) {
      for (const mod of mods) {
        const hmrPath = canonicalHmrPath(mod.url, rel);
        if (claimHmrBroadcast(hmrBroadcastClaims, `${event}:${hmrPath}`, timestamp)) {
          updates.set(hmrPath, { type: 'js-update', path: hmrPath, acceptedPath: hmrPath, timestamp });
        }
      }
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(file)) {
      const hmrPath = canonicalHmrPath(undefined, rel);
      if (claimHmrBroadcast(hmrBroadcastClaims, `${event}:${hmrPath}`, timestamp)) {
        updates.set(hmrPath, { type: 'js-update', path: hmrPath, acceptedPath: hmrPath, timestamp });
      }
    }

    if (updates.size) {
      broadcastModuleHmr({ type: 'update', updates: [...updates.values()] } as DebugMessage);
    }
  };

  async function getContext(platform: DevPlatform): Promise<PlatformContext> {
    const context = contexts.get(platform) ?? createPlatformContext(platform);
    if (options.bytecode) {
      if (!context.bytecodeBundle && !context.bootstrapError) await rebuildBytecode(context);
      return context;
    }
    if (!context.vite) {
      context.vite = await createRayactViteDevServer(context.bundleOptions, server, context.assetRegistry);
      context.middleware = createRayactModuleMiddleware(() => context.vite);
      context.vite.watcher.on('change', file => broadcastModuleUpdates(context, file, 'change'));
      context.vite.watcher.on('add', file => broadcastModuleUpdates(context, file, 'add'));
      context.vite.watcher.on('unlink', file => broadcastModuleUpdates(context, file, 'unlink'));
    }
    if (!context.bootstrapCode && !context.bootstrapError) {
      await rebuildBootstrap(context);
    }
    return context;
  }

  await getContext(options.platform as DevPlatform);

  // Warm each mobile platform's bootstrap AND its full module graph in the
  // background so the first dev-app connect doesn't pay cold vite/babel builds.
  // Two symptoms this kills: (1) the ~2MB bootstrap cold-building on tap (black
  // "frozen" pane), and (2) hundreds of modules cold-transformed one-by-one as
  // the device walks the graph synchronously ("several minutes to open" /
  // "dev server timeout"). Time-budgeted + concurrency-limited; never blocks.
  const warmEntryPath = `/${options.entry}`;
  const warmPlatforms = new Set<DevPlatform>(['android', 'ios', options.platform as DevPlatform]);
  for (const warmPlatform of options.bytecode ? [] : warmPlatforms) {
    void (async () => {
      const warmContext = await getContext(warmPlatform);
      if (warmContext.vite) {
        await warmRayactModuleGraph(warmContext.vite, warmEntryPath, `?${platformQuery(warmPlatform)}`);
      }
    })().catch(() => {});
  }

  server.on('request', (request, response) => {
    void handleRequest(request, response);
  });

  async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const platform = selectPlatform(requestUrl, request);
    const context = await getContext(platform);
    const advertisedBaseUrl = `http://${publicHost(options.host)}:${options.port}`;
    const baseUrl = requestBaseUrl(request, advertisedBaseUrl);
    const wsBase = baseUrl.replace(/^http/, 'ws');
    const platformSuffix = platformQuery(platform);

    if (requestUrl.pathname.startsWith('/rayact/devtools/')) {
      if (!devtoolsRoot) {
        sendText(response, 503, 'Rayact DevTools frontend is not installed');
        return;
      }
      const requested = requestUrl.pathname.slice('/rayact/devtools/'.length) || 'rn_fusebox.html';
      if (requested === 'rayact/panels.js') {
        sendText(response, 200, RAYACT_DEVTOOLS_PANELS, 'application/javascript; charset=utf-8');
        return;
      }
      const candidate = path.resolve(devtoolsRoot, requested);
      if (!isPathInsideRoot(devtoolsRoot, candidate)) {
        sendJson(response, 403, { error: 'Forbidden' });
        return;
      }
      try {
        const asset = await fs.promises.readFile(candidate);
        if (requested === 'entrypoints/rn_fusebox/rn_fusebox.js') {
          sendText(
            response,
            200,
            patchRayactDevtoolsEntrypoint(requested, asset.toString('utf8')),
            'application/javascript; charset=utf-8'
          );
        } else if (requested === 'panels/rn_welcome/rn_welcome.js') {
          sendText(response, 200, patchRayactWelcome(asset.toString('utf8')), 'application/javascript; charset=utf-8');
        } else if (requested === 'rn_fusebox.html') {
          sendText(response, 200, asset.toString('utf8').split('React Native DevTools').join('Rayact DevTools'), 'text/html; charset=utf-8');
        } else if (requested.startsWith('core/i18n/locales/') && requested.endsWith('.json')) {
          // The Welcome hero text comes from the i18n locale bundle, not the
          // inline defaults — rebrand it here too, or the panel still reads
          // "React Native" regardless of the rn_welcome.js patch.
          const rebranded = asset.toString('utf8')
            .split('React Native').join('Rayact')
            .split('Welcome to debugging in Rayact').join('Welcome to Rayact DevTools');
          sendText(response, 200, rebranded, 'application/json; charset=utf-8');
        } else {
          sendBuffer(response, 200, asset, mimeFor(candidate));
        }
      } catch {
        sendJson(response, 404, { error: 'DevTools asset not found' });
      }
      return;
    }

    if (requestUrl.pathname === '/rayact/status') {
      sendJson(response, context.bootstrapError ? 500 : 200, {
        ok: !context.bootstrapError,
        name: options.name,
        rayactAppKey: options.rayactAppKey,
        entry: options.entry,
        platform,
        revision: context.revision,
        hmrMode: options.bytecode ? 'none' : 'module',
        bundleFormat: options.bytecode ? 'qjsbc' : 'js',
        compiler: RAYACT_REACT_COMPILER,
        binaryCommands: RAYACT_BINARY_COMMANDS,
        error: context.bootstrapError?.message
      });
      return;
    }

    if (requestUrl.pathname === '/rayact/manifest.json') {
      const entryModuleUrl = `${baseUrl}${ENTRY_MODULE_PATH}?${platformSuffix}`;
      const bootstrapUrl = `${baseUrl}/rayact/bootstrap.js?${platformSuffix}`;
      const bundleUrl = options.bytecode
        ? `${baseUrl}/rayact/bundle.qjsbc?${platformSuffix}`
        : bootstrapUrl;
      const manifestAssets = options.bytecode ? context.assets : context.assetRegistry.all();
      sendJson(response, 200, {
        name: options.name,
        rayactAppKey: options.rayactAppKey,
        entry: options.entry,
        platform,
        mode: 'development',
        revision: context.revision,
        hmrMode: options.bytecode ? 'none' : 'module',
        bundleFormat: options.bytecode ? 'qjsbc' : 'js',
        compiler: RAYACT_REACT_COMPILER,
        binaryCommands: RAYACT_BINARY_COMMANDS,
        bootstrapUrl: options.bytecode ? undefined : bootstrapUrl,
        entryModuleUrl: options.bytecode ? undefined : entryModuleUrl,
        bundleUrl,
        hmrUrl: options.bytecode ? undefined : `${wsBase}/rayact/hmr`,
        debuggerUrl: options.bytecode ? undefined : `${wsBase}/rayact/debugger`,
        inspectorUrl: options.bytecode ? undefined : `${wsBase}/rayact/inspector`,
        websocketUrl: options.bytecode ? undefined : `${wsBase}/rayact/debugger`,
        cdpPort: actualCdpPort,
        cdpUrl: `http://127.0.0.1:${actualCdpPort}`,
        devtoolsDeviceUrl: options.bytecode ? undefined : `${wsBase}/rayact/devtools/device`,
        devtoolsFrontendUrl: options.bytecode ? undefined : stockDevtoolsFrontendUrl('127.0.0.1', actualCdpPort),
        reactDevtoolsFrontendUrl: options.bytecode ? undefined : reactDevtoolsFrontendUrl(baseUrl, actualCdpPort),
        devtoolsProtocolVersion: options.bytecode ? undefined : DEVTOOLS_PROTOCOL_VERSION,
        assets: manifestAssets.map(asset => ({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          hash: asset.hash,
          size: asset.size,
          outputName: asset.outputName,
          kind: asset.kind,
          url: `${baseUrl}/rayact/assets/${encodeURIComponent(asset.id)}/${encodeURIComponent(asset.name)}?${platformSuffix}`
        })),
        nativeModules,
        capabilities: options.bytecode
          ? ['bytecode']
          : ['hmr', 'cdp', ...DEVTOOLS_CAPABILITIES, 'inspector', 'module-hmr']
      });
      return;
    }

    if (requestUrl.pathname === '/rayact/bundle.qjsbc') {
      try {
        const bytes = context.bytecodeBundle ?? await rebuildBytecode(context);
        sendBuffer(response, 200, bytes, 'application/octet-stream');
      } catch (error) {
        sendText(response, 500, error instanceof Error ? error.message : String(error));
      }
      return;
    }

    if (requestUrl.pathname === '/rayact/bootstrap.js' || requestUrl.pathname === '/rayact/bundle') {
      try {
        const code = context.bootstrapCode ?? await rebuildBootstrap(context);
        sendText(response, 200, code, 'application/javascript; charset=utf-8');
      } catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        sendText(response, 500, message);
      }
      return;
    }

    if (requestUrl.pathname.startsWith('/rayact/raw/')) {
      const relative = decodeURIComponent(requestUrl.pathname.slice('/rayact/raw/'.length));
      const filePath = path.resolve(options.root, relative);
      if (!isPathInsideRoot(options.root, filePath)) {
        sendJson(response, 403, { error: 'Forbidden' });
        return;
      }
      try {
        const data = await fs.promises.readFile(filePath);
        sendBuffer(response, 200, data, mimeFor(filePath));
      } catch (error) {
        sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (requestUrl.pathname.startsWith('/rayact/assets/')) {
      const [id, name] = requestUrl.pathname.slice('/rayact/assets/'.length).split('/');
      const decodedId = id ? decodeURIComponent(id) : '';
      const asset = decodedId
        ? (context.assets.find(candidate => candidate.id === decodedId) ?? context.assetRegistry.get(decodedId))
        : undefined;
      if (!asset || (name && decodeURIComponent(name) !== asset.name)) {
        sendJson(response, 404, { error: 'Asset not found' });
        return;
      }
      try {
        if (asset.bytes) {
          // Transformed asset (e.g. bundled worker) — serve the bundle, not
          // the on-disk source.
          sendBuffer(response, 200, asset.bytes, asset.type);
          return;
        }
        const sourcePath = path.resolve(options.root, asset.sourcePath);
        sendBuffer(response, 200, await fs.promises.readFile(sourcePath), asset.type);
      } catch (error) {
        sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (requestUrl.pathname === '/rayact/entry.js') {
      if (!context.vite) {
        sendText(response, 503, 'Vite dev server not ready');
        return;
      }
      try {
        const result = await context.vite.transformRequest(RAYACT_ENTRY_ID, { ssr: true });
        if (!result?.code) {
          sendText(response, 404, 'Entry module not found');
          return;
        }
        sendText(response, 200, wrapRayactModule(`/rayact/entry.js?${platformSuffix}`, result.code, RAYACT_ENTRY_ID), 'application/javascript; charset=utf-8');
      } catch (error) {
        sendText(response, 500, error instanceof Error ? error.message : String(error));
      }
      return;
    }

    if (requestUrl.pathname.startsWith('/rayact/m/') || requestUrl.pathname === '/rayact/resolve') {
      await new Promise<void>((resolve, reject) => {
        context.middleware?.(request, response, err => {
          if (err) reject(err);
          else resolve();
        });
      }).catch(error => {
        if (!response.headersSent) {
          sendText(response, 500, error instanceof Error ? error.message : String(error));
        }
      });
      return;
    }

    if (context.vite) {
      context.vite.middlewares(request, response, () => {
        sendJson(response, 404, { error: 'Not found' });
      });
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  }

  const broadcastDebugger = createWsBroadcast(debuggerWss);
  const broadcastInspector = createWsBroadcast(inspectorWss);

  // ── DevTools Sources: serve the project's own tsx/jsx (and friends) so the
  // Chrome Sources panel shows real source instead of just the running bundle.
  // Answered locally in the CDP proxy — the QuickJS target only has transformed
  // modules, and Page.getResourceContent isn't implemented on-device (was
  // returning "Method not found"). Content comes straight off disk.
  const sourceRoot = path.resolve(options.root ?? process.cwd());
  const SOURCE_EXTS = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs', '.json', '.css', '.html']);
  const SOURCE_SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.rayact', '.expo', '.next',
    '.xcode-derived', 'DerivedData', 'ios', 'android', '.gradle', 'coverage'
  ]);
  const sourceUrlToPath = new Map<string, string>();
  let sourceRegistryBuiltAt = 0;

  const resourceTypeFor = (ext: string): string =>
    ext === '.html' ? 'Document' : ext === '.css' ? 'Stylesheet' : ext === '.json' ? 'XHR' : 'Script';

  const buildSourceRegistry = (): Array<{ url: string; type: string; mimeType: string }> => {
    // Cheap TTL so edits/new files surface without a server restart.
    const resources: Array<{ url: string; type: string; mimeType: string }> = [];
    sourceUrlToPath.clear();
    const walk = (dir: string, depth: number) => {
      if (depth > 12 || sourceUrlToPath.size > 8000) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.') continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SOURCE_SKIP_DIRS.has(entry.name)) continue;
          walk(abs, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!SOURCE_EXTS.has(ext)) continue;
          const rel = path.relative(sourceRoot, abs).split(path.sep).join('/');
          const url = `rayact://app/${rel}`;
          sourceUrlToPath.set(url, abs);
          resources.push({ url, type: resourceTypeFor(ext), mimeType: MIME_TYPES[ext] ?? 'text/plain; charset=utf-8' });
        }
      }
    };
    walk(sourceRoot, 0);
    sourceRegistryBuiltAt = Date.now();
    return resources;
  };

  const readSourceContent = (url: string): string | null => {
    if (Date.now() - sourceRegistryBuiltAt > 2000 || sourceUrlToPath.size === 0) buildSourceRegistry();
    const abs = sourceUrlToPath.get(url);
    if (!abs) return null;
    try { return fs.readFileSync(abs, 'utf8'); } catch { return null; }
  };

  // Intercept the handful of CDP methods the proxy answers itself (Sources).
  // Returns true when fully handled (reply already sent to the frontend);
  // false means "forward to the device unchanged".
  const handleProxyCdp = (frontend: WebSocket, raw: string): boolean => {
    let msg: { id?: number; method?: string; params?: { url?: string } };
    try { msg = JSON.parse(raw); } catch { return false; }
    if (typeof msg?.id !== 'number' || typeof msg.method !== 'string') return false;
    if (msg.method === 'Page.getResourceTree') {
      const resources = buildSourceRegistry();
      safelySend(frontend, JSON.stringify({
        id: msg.id,
        result: {
          frameTree: {
            frame: {
              id: 'rayact-main', loaderId: 'rayact-loader', url: 'rayact://app/',
              domainAndRegistry: '', securityOrigin: 'rayact://app', mimeType: 'text/html'
            },
            resources
          }
        }
      }));
      return true;
    }
    if (msg.method === 'Page.getResourceContent') {
      const url = msg.params?.url ?? '';
      const content = readSourceContent(url);
      if (content == null) {
        safelySend(frontend, JSON.stringify({ id: msg.id, error: { code: -32000, message: 'No resource with given URL found' } }));
      } else {
        safelySend(frontend, JSON.stringify({ id: msg.id, result: { content, base64Encoded: false } }));
      }
      return true;
    }
    return false;
  };

  const publicTarget = (target: DevToolsTargetRecord) => {
    const targetPath = `devtools/page/${target.id}`;
    const host = `127.0.0.1:${actualCdpPort}`;
    const description = [target.hello.platform, target.hello.deviceName, target.hello.appId, target.page.vm ?? 'QuickJS']
      .filter(Boolean).join(' · ');
    return {
      id: target.id,
      type: 'node',
      title: target.page.title || `Rayact: ${options.entry}`,
      description,
      url: `rayact://${encodeURIComponent(target.hello.appId ?? 'app')}/${encodeURIComponent(target.page.id)}`,
      faviconUrl: '',
      webSocketDebuggerUrl: `ws://${host}/${targetPath}`,
      devtoolsFrontendUrl: stockDevtoolsFrontendUrl('127.0.0.1', actualCdpPort, targetPath),
      reactDevtoolsFrontendUrl: reactDevtoolsFrontendUrl(`http://127.0.0.1:${options.port}`, actualCdpPort, targetPath)
    };
  };

  cdpServer.on('request', (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/json/version') {
      sendJson(response, 200, {
        Browser: 'Rayact/0.0.3',
        'Protocol-Version': '1.3',
        'User-Agent': 'Rayact',
        'V8-Version': 'QuickJS'
      });
      return;
    }
    if (pathname === '/json' || pathname === '/json/list') {
      sendJson(response, 200, [...targets.values()].map(publicTarget));
      return;
    }
    sendJson(response, 404, { error: 'Not found' });
  });

  debuggerWss.on('connection', socket => {
    socket.send(JSON.stringify({
      type: 'server:hello',
      payload: { entry: options.entry, platform: 'multi', defaultPlatform: options.platform, channel: 'debugger' }
    }));
    socket.on('message', data => {
      try {
        const message = JSON.parse(String(data)) as DebugMessage;
        if (message.type === 'console') {
          const payload = message.payload as { level?: string; args?: string[] };
          const level = payload.level === 'error' || payload.level === 'warn' ? payload.level : 'log';
          options.onClientLog?.();
          console[level](`[client:${payload.level ?? 'log'}]`, ...(payload.args ?? []));
        } else if (message.type === 'client:error') {
          options.onClientLog?.();
          console.error('[client:error]', message.payload);
        } else if (message.type === 'react-devtools') {
          broadcastDebugger(message);
        } else if (message.type === 'inspector:tree') {
          broadcastInspector(message);
        }
      } catch {
        console.warn('[rayact] ignored malformed debugger message');
      }
    });
  });

  deviceWss.on('connection', socket => {
    lastSeen.set(socket, Date.now());
    socket.on('pong', () => lastSeen.set(socket, Date.now()));
    socket.on('message', data => {
      lastSeen.set(socket, Date.now());
      let envelope: { event?: string; payload?: any };
      try { envelope = JSON.parse(String(data)); } catch {
        socket.close(1007, 'Malformed DevTools envelope');
        return;
      }
      if (envelope.event === 'hello') {
        const hello = envelope.payload as DevToolsDeviceHello;
        if (hello?.protocolVersion !== 1 || !hello.deviceId || !Array.isArray(hello.pages)) {
          socket.close(1008, 'Invalid DevTools hello');
          return;
        }
        removeDevice(socket);
        lastSeen.set(socket, Date.now());
        const owned = new Set<string>();
        for (const page of hello.pages) {
          if (!page?.id) continue;
          const id = targetIdFor(hello.deviceId, page.id);
          const existing = targets.get(id);
          if (existing && existing.device !== socket) removeDevice(existing.device);
          targets.set(id, { id, key: `${hello.deviceId}/${page.id}`, deviceId: hello.deviceId, page, hello, device: socket, frontend: null, sessionId: null, detachTimer: null });
          owned.add(id);
        }
        deviceTargets.set(socket, owned);
        return;
      }
      if (envelope.event === 'wrappedEvent') {
        const payload = envelope.payload as { pageId?: string; sessionId?: string; message?: string };
        if (!payload?.pageId || !payload.sessionId || typeof payload.message !== 'string') return;
        const target = [...deviceTargets.get(socket) ?? []]
          .map(id => targets.get(id))
          .find(candidate => candidate?.page.id === payload.pageId);
        if (target?.device === socket && target.sessionId === payload.sessionId && target.frontend) safelySend(target.frontend, payload.message);
        return;
      }
      if (envelope.event === 'log' || envelope.event === 'clientError') {
        options.onClientLog?.();
        const payload = envelope.payload ?? {};
        const level: 'error' | 'warn' | 'log' = payload.level === 'error' || payload.level === 'warn' ? payload.level : 'log';
        console[level](`[client:${payload.deviceId ?? 'device'}:${level}]`, ...(Array.isArray(payload.args) ? payload.args : [payload.message ?? payload]));
      }
    });
    socket.on('close', () => removeDevice(socket));
    socket.on('error', () => removeDevice(socket));
  });

  cdpWss.on('connection', (socket, request) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const id = pathname.slice('/devtools/page/'.length);
    const target = resolveTarget(id);
    if (!target) {
      socket.close(1008, 'Unknown Rayact target');
      return;
    }
    // A DevTools page refresh reconnects here within a second or two. If the
    // previous frontend just detached, its session is kept warm (see detach
    // below) — reuse it so the device-side inspector never tears down and the
    // refreshed frontend resumes against live state instead of disconnecting.
    if (target.detachTimer) { clearTimeout(target.detachTimer); target.detachTimer = null; }
    let sessionId: string;
    if (target.sessionId && !target.frontend) {
      sessionId = target.sessionId; // resume: device was never told we left
    } else {
      if (target.frontend && target.frontend !== socket) target.frontend.close(1012, 'Replaced by another DevTools frontend');
      sessionId = randomUUID();
      target.sessionId = sessionId;
      safelySend(target.device, JSON.stringify({ event: 'connect', payload: { pageId: target.page.id, sessionId } }));
    }
    target.frontend = socket;
    socket.on('message', data => {
      const raw = String(data);
      if (handleProxyCdp(socket, raw)) return;
      safelySend(target.device, JSON.stringify({
        event: 'wrappedEvent', payload: { pageId: target.page.id, sessionId, message: raw }
      }));
    });
    const detach = () => {
      if (target.frontend !== socket) return;
      target.frontend = null;
      // Keep the session warm briefly so a page refresh resumes; only tell the
      // device we're gone if nobody reconnects within the grace window.
      if (target.detachTimer) clearTimeout(target.detachTimer);
      target.detachTimer = setTimeout(() => {
        target.detachTimer = null;
        if (target.frontend || !target.sessionId) return;
        const closed = target.sessionId;
        target.sessionId = null;
        safelySend(target.device, JSON.stringify({ event: 'disconnect', payload: { pageId: target.page.id, sessionId: closed } }));
      }, 4000);
    };
    socket.on('close', detach);
    socket.on('error', detach);
  });

  inspectorWss.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'server:hello', payload: { channel: 'inspector' } }));
    socket.on('message', data => {
      try {
        const message = JSON.parse(String(data)) as DebugMessage;
        if (message.type === 'inspector:highlight' || message.type === 'inspector:select') {
          broadcastInspector(message);
        }
      } catch {
        // ignore
      }
    });
  });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const socket of deviceWss.clients) {
      if (now - (lastSeen.get(socket) ?? 0) >= DEVTOOLS_STALE_MS) {
        socket.terminate();
      } else if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }
  }, DEVTOOLS_HEARTBEAT_MS);
  heartbeat.unref();

  const requestedPort = options.port;
  options.port = await listenWithFallback(server, options.host, requestedPort, {
    strictPort: options.strictPort
  });

  const requestedCdpPort = options.cdpPort;
  if (requestedCdpPort > 0) cleanupLegacyAdbCdpForwards(requestedCdpPort);
  const cdpCandidates = rawOptions.cdpPort === undefined && requestedCdpPort === 9229
    ? [9229, 9222]
    : [requestedCdpPort];
  let cdpError: unknown;
  for (const candidate of cdpCandidates) {
    try {
      actualCdpPort = await listenWithFallback(cdpServer, '127.0.0.1', candidate, { strictPort: true });
      cdpError = undefined;
      break;
    } catch (error) {
      cdpError = error;
    }
  }
  if (cdpError) {
    clearInterval(heartbeat);
    await new Promise<void>(resolve => server.close(() => resolve()));
    throw new Error(`[rayact] Unable to bind the DevTools discovery port (${cdpCandidates.join(' or ')}). Close the process or stale ADB forward using it, or configure devServer.cdpPort.`, { cause: cdpError });
  }

  const url = `http://${publicHost(options.host)}:${options.port}`;
  const localUrl = `http://127.0.0.1:${options.port}`;
  const entry = path.relative(options.root, path.resolve(options.root, options.entry));
  const qrPayload = JSON.stringify(buildQrPayload({
    url,
    port: options.port
  }));

  const mdns = advertiseRayactServer({
    port: options.port,
    name: options.name,
    appKey: options.rayactAppKey,
    entry,
    cdpPort: actualCdpPort
  });

  const broadcastHmr = (message: DebugMessage) => {
    broadcastModuleHmr(message);
  };

  return {
    url,
    localUrl,
    cdpPort: actualCdpPort,
    cdpUrl: `http://127.0.0.1:${actualCdpPort}`,
    entry,
    platform: options.platform,
    rayactAppKey: options.rayactAppKey,
    qrPayload,
    devtoolsUrl: reactDevtoolsFrontendUrl(url, actualCdpPort),
    targets() {
      return [...targets.values()].map(target => ({
        ...publicTarget(target),
        deviceId: target.deviceId,
        pageId: target.page.id
      }));
    },
    clientCount() {
      const hmrClients = moduleHmrWss.clients.size;
      return hmrClients + debuggerWss.clients.size + inspectorWss.clients.size;
    },
    hmrClientCount() {
      return moduleHmrWss.clients.size;
    },
    debuggerClientCount() {
      return debuggerWss.clients.size;
    },
    broadcastHmr,
    broadcastDebugger,
    broadcastInspector,
    async reload() {
      await Promise.all([...contexts.values()].map(context =>
        options.bytecode ? rebuildBytecode(context) : rebuildBootstrap(context)
      ));
      if (!options.bytecode) broadcastModuleHmr({ type: 'full-reload' });
    },
    async close() {
      mdns.stop();
      clearInterval(heartbeat);
      for (const socket of deviceWss.clients) socket.close(1001, 'Rayact server shutting down');
      for (const socket of cdpWss.clients) socket.close(1001, 'Rayact server shutting down');
      debuggerWss.close();
      inspectorWss.close();
      deviceWss.close();
      cdpWss.close();
      await Promise.all([...contexts.values()].map(async context => {
        if (context.vite) await context.vite.close();
      }));
      await Promise.all([
        new Promise<void>(resolve => server.close(() => resolve())),
        new Promise<void>(resolve => cdpServer.close(() => resolve()))
      ]);
    }
  };
}
