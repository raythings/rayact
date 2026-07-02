import os from 'node:os';
import { Bonjour } from 'bonjour-service';
import type { Service } from 'bonjour-service';

function getLanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap(addresses => addresses ?? [])
    .filter(address => address.family === 'IPv4' && !address.internal)
    .map(address => address.address);
}

export interface MdnsAdvertiseOptions {
  port: number;
  appKey: string;
  entry: string;
  cdpPort: number;
}

export interface RayactMdnsService {
  stop(): void;
}

export function advertiseRayactServer(options: MdnsAdvertiseOptions): RayactMdnsService {
  // Discovery is best-effort: multicast send errors (EHOSTUNREACH when an
  // interface drops, VPN toggles, etc.) must never crash the dev server —
  // without this callback bonjour's dgram error is an uncaught exception.
  const bonjour = new Bonjour(undefined, (err: Error) => {
    console.warn(`[rayact:mdns] discovery error (non-fatal): ${err.message}`);
  });
  const ips = getLanAddresses();
  const service: Service = bonjour.publish({
    name: `rayact-${options.appKey}`,
    type: 'rayact',
    protocol: 'tcp',
    port: options.port,
    txt: {
      appKey: options.appKey,
      entry: options.entry,
      cdpPort: String(options.cdpPort),
      ips: ips.join(',')
    }
  });

  return {
    stop() {
      try {
        bonjour.unpublishAll(() => bonjour.destroy());
      } catch {
        service.stop?.();
        bonjour.destroy();
      }
    }
  };
}
