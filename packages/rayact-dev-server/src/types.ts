export interface RayactDevServerOptions {
  root?: string;
  name?: string;
  host?: string;
  port?: number;
  strictPort?: boolean;
  entry: string;
  platform?: string;
  rayactAppKey?: string;
  cdpPort?: number;
  minify?: boolean;
  bytecode?: boolean;
  desktopBin?: string;
  onClientLog?: () => void;
}

export interface RayactDevServer {
  url: string;
  localUrl: string;
  cdpPort: number;
  cdpUrl: string;
  entry: string;
  platform: string;
  rayactAppKey: string;
  qrPayload: string;
  devtoolsUrl: string;
  targets(): RayactDevToolsTarget[];
  clientCount(): number;
  hmrClientCount(): number;
  debuggerClientCount(): number;
  broadcastHmr(message: DebugMessage): void;
  broadcastDebugger(message: DebugMessage): void;
  broadcastInspector(message: DebugMessage): void;
  reload(): Promise<void>;
  close(): Promise<void>;
}

export interface RayactDevToolsTarget {
  id: string;
  deviceId: string;
  pageId: string;
  title: string;
  description: string;
  webSocketDebuggerUrl: string;
  devtoolsFrontendUrl: string;
  reactDevtoolsFrontendUrl: string;
}

export interface DebugMessage {
  type: string;
  payload?: unknown;
}

export interface RayactManifestAsset {
  id: string;
  name: string;
  type: string;
  hash: string;
  size: number;
  outputName: string;
  kind: 'asset' | 'worker';
  url: string;
}
