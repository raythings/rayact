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
  name?: string;
  appKey: string;
  entry: string;
  cdpPort: number;
}

export interface RayactMdnsService {
  stop(): void;
}

const MDNS_ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Bonjour can emit the same multicast socket error for every announcement.
 * Keep the first warning visible, then summarize repeats at most once a minute.
 */
export function createMdnsErrorReporter(
  warn: (message: string) => void = console.warn,
  now: () => number = Date.now
): (err: Error) => void {
  let lastMessage = '';
  let lastLoggedAt = Number.NEGATIVE_INFINITY;
  let suppressed = 0;

  return (err: Error) => {
    const message = err.message || String(err);
    const timestamp = now();
    const sameError = message === lastMessage;

    if (sameError && timestamp - lastLoggedAt < MDNS_ERROR_LOG_INTERVAL_MS) {
      suppressed++;
      return;
    }

    const repeatSummary = sameError && suppressed > 0
      ? ` (${suppressed} identical errors suppressed)`
      : '';
    warn(`[rayact:mdns] discovery error (non-fatal): ${message}${repeatSummary}`);
    lastMessage = message;
    lastLoggedAt = timestamp;
    suppressed = 0;
  };
}

export function advertiseRayactServer(options: MdnsAdvertiseOptions): RayactMdnsService {
  // Discovery is best-effort: multicast send errors (EHOSTUNREACH when an
  // interface drops, VPN toggles, etc.) must never crash the dev server —
  // without this callback bonjour's dgram error is an uncaught exception.
  const bonjour = new Bonjour(undefined, createMdnsErrorReporter());
  const ips = getLanAddresses();
  const service: Service = bonjour.publish({
    name: options.name?.trim() || `rayact-${options.appKey}`,
    type: 'rayact',
    protocol: 'tcp',
    port: options.port,
    txt: {
      appKey: options.appKey,
      appName: options.name?.trim() || options.appKey,
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
