export type HostNodeType = 'root' | 'view' | 'text' | 'button' | 'image' | 'icon';

export type HostNodeId = number;

export interface HostNode {
  id: HostNodeId;
  type: HostNodeType;
}

export type HostEventName = 'press' | 'click';

export interface HostBridge {
  createNode(type: HostNodeType, props?: Record<string, unknown>): HostNode;
  updateNode(node: HostNode, props: Record<string, unknown>): void;
  appendChild(parent: HostNode, child: HostNode): void;
  removeChild(parent: HostNode, child: HostNode): void;
  insertBefore(parent: HostNode, child: HostNode, beforeChild: HostNode): void;
  setRoot(node: HostNode | null): void;
  setEventHandler(node: HostNode, eventName: HostEventName, handler?: (() => void) | null): void;
  disposeNode(node: HostNode): void;
  reload(source?: string): Promise<void> | void;
  showError?(message: string, stack?: string): void;
}

export interface RayactRuntime {
  bridge: HostBridge;
  devClient?: RayactDevClient;
  reportError(error: unknown): void;
}

export interface RayactRuntimeOptions {
  bridge?: HostBridge;
  devClient?: RayactDevClient | boolean;
  global?: RayactGlobal;
}

export interface RayactDevClient {
  connect(): void;
  disconnect(): void;
  send(type: string, payload?: unknown): void;
}

export interface RayactGlobal {
  [key: string]: unknown;
  createView?: (props?: Record<string, unknown>) => number;
  createText?: (text: string, props?: Record<string, unknown>) => number;
  createButton?: (label: string, props?: Record<string, unknown>) => number;
  createImage?: (src: string, props?: Record<string, unknown>) => number | null;
  createIcon?: (name: string, size?: number, color?: number, props?: Record<string, unknown>) => number;
  appendChild?: (parentId: number, childId: number) => void;
  removeChild?: (parentId: number, childId: number) => void;
  insertBefore?: (parentId: number, childId: number, beforeChildId: number) => void;
  setRootNode?: (nodeId: number | null) => void;
  setStyle?: (nodeId: number, props: Record<string, unknown>) => void;
  setText?: (nodeId: number, text: string) => void;
  setOnPress?: (nodeId: number, handler?: (() => void) | null) => void;
  disposeNode?: (nodeId: number) => void;
  clearRootNode?: () => void;
  fetch?: (url: string) => Promise<{ text(): Promise<string> }>;
  eval?: (source: string) => unknown;
  WebSocket?: new (url: string) => WebSocketLike;
  console?: Console;
}

export interface WebSocketLike {
  onopen?: (() => void) | null;
  onclose?: (() => void) | null;
  onerror?: ((event: unknown) => void) | null;
  onmessage?: ((event: { data: string }) => void) | null;
  readyState?: number;
  send(data: string): void;
  close(): void;
}

export interface DevServerManifest {
  entry: string;
  platform: string;
  mode: 'development';
  bundleUrl: string;
  websocketUrl: string;
}
