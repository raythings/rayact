export interface RayactDevServerOptions {
  root?: string;
  host?: string;
  port?: number;
  entry: string;
  platform?: string;
  rayactAppKey?: string;
  cdpPort?: number;
  minify?: boolean;
  bytecode?: boolean;
  onClientLog?: () => void;
}

export interface RayactDevServer {
  url: string;
  localUrl: string;
  entry: string;
  platform: string;
  rayactAppKey: string;
  qrPayload: string;
  clientCount(): number;
  hmrClientCount(): number;
  debuggerClientCount(): number;
  broadcastHmr(message: DebugMessage): void;
  broadcastDebugger(message: DebugMessage): void;
  broadcastInspector(message: DebugMessage): void;
  reload(): Promise<void>;
  close(): Promise<void>;
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
