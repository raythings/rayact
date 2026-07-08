import os from 'node:os';

// The QR encodes the minimum needed to reach the server: a bare JSON array
// of "host:port" entries, one per LAN interface. Everything else — app key,
// bundle URL, hosted assets, HMR/debugger/inspector websocket URLs — is
// served by GET http://<host:port>/rayact/manifest.json, so growing the
// handshake never grows the QR. Smaller payload = larger QR modules =
// easier scanning (the old payload embedded full transport JSON and was
// painful to scan from a terminal).
export type RayactQrPayload = string[];

function getLanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap(addresses => addresses ?? [])
    .filter(address => address.family === 'IPv4' && !address.internal)
    .map(address => address.address);
}

export function buildQrPayload(options: { url: string; port: number }): RayactQrPayload {
  const hosts = getLanAddresses().map(ip => `${ip}:${options.port}`);
  if (hosts.length === 0) {
    hosts.push(options.url.replace(/^https?:\/\//i, '').replace(/\/+$/, ''));
  }
  return hosts;
}

function normalizeHttpUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

export function parseDevServerUrl(input: string): string {
  const trimmed = input.trim();
  // Current QR format: JSON array of "host:port" strings.
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed) as unknown;
      if (Array.isArray(arr) && typeof arr[0] === 'string' && arr[0]) {
        return normalizeHttpUrl(arr[0]);
      }
    } catch {
      // fall through
    }
  }
  // Legacy QR format: {url, transports:[{type:'websocket', ips, port}, …]}.
  if (trimmed.startsWith('{')) {
    try {
      const payload = JSON.parse(trimmed) as {
        url?: string;
        transports?: { type: string; ips?: string[]; port: number }[];
      };
      if (payload.url) return payload.url.replace(/\/+$/, '');
      const ws = payload.transports?.find(t => t.type === 'websocket');
      if (ws?.ips?.[0]) return `http://${ws.ips[0]}:${ws.port}`;
    } catch {
      // fall through
    }
  }
  return normalizeHttpUrl(trimmed);
}
