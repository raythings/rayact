export interface RayactDevServerOptions {
  root?: string;
  host?: string;
  port?: number;
  entry: string;
  platform?: string;
  onClientLog?: () => void;
}

export interface RayactDevServer {
  url: string;
  localUrl: string;
  entry: string;
  platform: string;
  clientCount(): number;
  broadcast(message: DebugMessage): void;
  reload(): Promise<void>;
  close(): Promise<void>;
}

export interface DebugMessage {
  type: string;
  payload?: unknown;
}
