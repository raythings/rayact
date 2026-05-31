import type { HostBridge, RayactDevClient, RayactGlobal, WebSocketLike } from './types';

interface DevClientOptions {
  serverUrl: string;
  bridge: HostBridge;
  global?: RayactGlobal;
}

interface DevMessage {
  type: string;
  payload?: unknown;
}

function joinUrl(serverUrl: string, path: string): string {
  return `${serverUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function toWebSocketUrl(serverUrl: string): string {
  return joinUrl(serverUrl, '/rayact/debugger').replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

function serializeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

export function createDevClient(options: DevClientOptions): RayactDevClient {
  const globalObject = options.global ?? globalThis as RayactGlobal;
  let socket: WebSocketLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastRevision: number | null = null;

  const send = (type: string, payload?: unknown) => {
    if (!socket || socket.readyState !== 1) return;
    socket.send(JSON.stringify({ type, payload }));
  };

  const loadBundle = async (): Promise<boolean> => {
    try {
      const fetchFn = globalObject.fetch;
      if (typeof fetchFn !== 'function') {
        throw new Error('Rayact dev client requires fetch()');
      }
      const response = await fetchFn(joinUrl(options.serverUrl, '/rayact/bundle'));
      const source = await response.text();
      await options.bridge.reload(source);
      send('client:reloaded');
      return true;
    } catch (error) {
      const serialized = serializeError(error);
      options.bridge.showError?.(serialized.message, serialized.stack);
      send('client:error', serialized);
      return false;
    }
  };

  const pollStatus = async () => {
    try {
      if (lastRevision === null) {
        globalObject.console?.info?.('[rayact] checking initial revision');
      }
      const fetchFn = globalObject.fetch;
      if (typeof fetchFn !== 'function') return;
      const response = await fetchFn(joinUrl(options.serverUrl, '/rayact/status'));
      const status = JSON.parse(await response.text()) as { revision?: number };
      if (typeof status.revision !== 'number') return;

      if (lastRevision === null) {
        lastRevision = status.revision;
        return;
      }

      if (status.revision !== lastRevision) {
        globalObject.console?.info?.(`[rayact] revision ${status.revision} detected`);
        if (await loadBundle()) {
          lastRevision = status.revision;
        }
      }
    } catch (error) {
      globalObject.console?.warn?.('[rayact] revision poll failed', error);
    }
  };

  const connect = () => {
    if (!pollTimer) {
      globalObject.console?.info?.('[rayact] starting revision poller');
      pollTimer = setInterval(() => {
        void pollStatus();
      }, 1000);
      void pollStatus();
    }

    const WebSocketCtor = globalObject.WebSocket;
    if (typeof WebSocketCtor !== 'function') {
      globalObject.console?.warn?.('Rayact dev client requires WebSocket()');
      return;
    }

    if (socket) return;

    const websocketUrl = toWebSocketUrl(options.serverUrl);
    globalObject.console?.info?.(`[rayact] connecting debugger: ${websocketUrl}`);
    socket = new WebSocketCtor(websocketUrl);
    socket.onopen = () => {
      globalObject.console?.info?.('[rayact] debugger connected');
      send('client:ready', { serverUrl: options.serverUrl });
    };
    socket.onclose = () => {
      globalObject.console?.warn?.('[rayact] debugger disconnected');
      socket = null;
      reconnectTimer = setTimeout(connect, 1000);
    };
    socket.onerror = event => {
      globalObject.console?.warn?.('[rayact] debugger socket error', event);
    };
    socket.onmessage = event => {
      let message: DevMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === 'reload' || message.type === 'hmr-update') {
        globalObject.console?.info?.(`[rayact] ${message.type} received`);
        const revision = typeof (message.payload as { revision?: unknown } | undefined)?.revision === 'number'
          ? (message.payload as { revision: number }).revision
          : null;
        void loadBundle().then(ok => {
          if (ok && revision !== null) lastRevision = revision;
        });
      }
    };

  };

  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (socket) {
      const current = socket;
      socket = null;
      current.close();
    }
  };

  return { connect, disconnect, send };
}

export function installConsoleForwarding(client: RayactDevClient, globalObject: RayactGlobal = globalThis as RayactGlobal): void {
  const consoleObject = globalObject.console;
  if (!consoleObject || (globalObject as { __rayactConsoleForwarding?: boolean }).__rayactConsoleForwarding) return;

  (globalObject as { __rayactConsoleForwarding?: boolean }).__rayactConsoleForwarding = true;

  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = consoleObject[level]?.bind(consoleObject);
    if (!original) continue;
    consoleObject[level] = (...args: unknown[]) => {
      original(...args);
      client.send('console', {
        level,
        args: args.map(arg => {
          try {
            return typeof arg === 'string' ? arg : JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
      });
    };
  }
}
