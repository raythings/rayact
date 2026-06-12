import os from 'node:os';

export interface QrTransport {
  type: 'websocket' | 'cdp';
  ips?: string[];
  port: number;
}

export interface RayactQrPayload {
  rayactAppKey: string;
  url: string;
  transports: QrTransport[];
}

function getLanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap(addresses => addresses ?? [])
    .filter(address => address.family === 'IPv4' && !address.internal)
    .map(address => address.address);
}

export function buildQrPayload(options: {
  url: string;
  port: number;
  rayactAppKey: string;
  cdpPort: number;
}): RayactQrPayload {
  const ips = getLanAddresses();
  return {
    rayactAppKey: options.rayactAppKey,
    url: options.url,
    transports: [
      { type: 'websocket', ips, port: options.port },
      { type: 'cdp', port: options.cdpPort }
    ]
  };
}

export function parseDevServerUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('{')) {
    try {
      const payload = JSON.parse(trimmed) as RayactQrPayload;
      if (payload.url) return payload.url.replace(/\/+$/, '');
      const ws = payload.transports?.find(t => t.type === 'websocket');
      if (ws?.ips?.[0]) return `http://${ws.ips[0]}:${ws.port}`;
    } catch {
      // fall through
    }
  }
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}
