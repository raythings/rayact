import type { Server } from 'node:http';

export interface ListenWithFallbackOptions {
  strictPort?: boolean;
  maxAttempts?: number;
  onPortFallback?: (requested: number, actual: number) => void;
}

function boundPort(server: Server, fallback: number): number {
  const addr = server.address();
  return typeof addr === 'object' && addr ? addr.port : fallback;
}

function listenOnce(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      server.off('error', onError);
      server.off('listening', onListening);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export async function listenWithFallback(
  server: Server,
  host: string,
  startPort: number,
  opts: ListenWithFallbackOptions = {}
): Promise<number> {
  const strictPort = opts.strictPort ?? false;
  const maxAttempts = opts.maxAttempts ?? 20;
  let port = startPort;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await listenOnce(server, host, port);
      const actualPort = boundPort(server, port);
      if (startPort !== 0 && actualPort !== startPort) {
        if (opts.onPortFallback) {
          opts.onPortFallback(startPort, actualPort);
        } else {
          console.warn(`[rayact] Port ${startPort} in use, using ${actualPort}`);
        }
      }
      return actualPort;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EADDRINUSE' || strictPort) throw error;
      port++;
    }
  }

  throw new Error(`[rayact] No available port after ${maxAttempts} attempts starting at ${startPort}`);
}
