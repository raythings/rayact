export type CrashConsent = 'unknown' | 'denied' | 'granted';
export type CrashKind = 'fatal-js' | 'unhandled-rejection' | 'native-exception' | 'native-signal';

export interface CrashEnvelope {
  schemaVersion: 1;
  id: string;
  timestamp: string;
  kind: CrashKind;
  message: string;
  stack?: string;
  platform: string;
  engineVersion: string;
  appVersion?: string;
}

export interface CrashStorage {
  load(): Promise<CrashEnvelope[]>;
  save(reports: CrashEnvelope[]): Promise<void>;
}

export interface CrashReporterConfiguration {
  mode?: 'local' | 'upload';
  endpoint?: string;
  maxStoredReports?: number;
  maxRetries?: number;
  storage?: CrashStorage;
  fetch?: typeof globalThis.fetch;
  appVersion?: string;
}

const MAX_ENVELOPE_BYTES = 64 * 1024;
let consent: CrashConsent = 'unknown';
let memoryReports: CrashEnvelope[] = [];
let configuration: Required<Pick<CrashReporterConfiguration, 'mode' | 'maxStoredReports' | 'maxRetries'>> & CrashReporterConfiguration = {
  mode: 'local',
  maxStoredReports: 20,
  maxRetries: 3,
};

const memoryStorage: CrashStorage = {
  async load() { return [...memoryReports]; },
  async save(reports) { memoryReports = [...reports]; },
};

function storage(): CrashStorage {
  return configuration.storage ?? memoryStorage;
}

function redact(value: string): string {
  // Bound work before applying redactors. Besides enforcing the envelope cap,
  // this prevents attacker-controlled error messages from turning broad regex
  // scans into an unbounded crash-reporting hot path.
  return value.slice(0, 24 * 1024)
    .replace(/(\b[a-z][a-z0-9+.-]{0,15}:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1')
    .replace(/\b(?:authorization|api[_-]?key|password|secret|token|input|value)\s*[:=]\s*[^\s,;]+/gi, '<redacted>')
    .replace(/(?:[A-Za-z]:[\\/]|\/)(?:Users|home|Volumes|private|var|tmp)[\\/][\w./\\ -]+/g, '<path>')
    .replace(/[?#][^\s]*/g, '')
    .replace(/[\w.+-]{1,128}@[\w.-]{1,253}\.[A-Za-z]{2,63}/g, '<email>')
    .replace(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, '<ip>')
    .replace(/\b(?:bearer\s+)?[A-Za-z0-9_-]{24,}\b/gi, '<token>')
    .slice(0, 24 * 1024);
}

function randomId(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function fitEnvelope(envelope: CrashEnvelope): CrashEnvelope {
  let candidate = envelope;
  while (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > MAX_ENVELOPE_BYTES) {
    if (candidate.stack && candidate.stack.length > 256) candidate = { ...candidate, stack: candidate.stack.slice(0, Math.floor(candidate.stack.length * 0.75)) };
    else candidate = { ...candidate, message: candidate.message.slice(0, Math.max(128, Math.floor(candidate.message.length * 0.75))), stack: undefined };
  }
  return candidate;
}

export function configureCrashReporter(next: CrashReporterConfiguration): void {
  if (next.mode === 'upload' && (!next.endpoint || !next.endpoint.startsWith('https://'))) {
    throw new Error('Crash upload mode requires an HTTPS endpoint.');
  }
  configuration = {
    ...configuration,
    ...next,
    mode: next.mode ?? configuration.mode,
    maxStoredReports: Math.min(100, Math.max(1, next.maxStoredReports ?? configuration.maxStoredReports)),
    maxRetries: Math.min(5, Math.max(0, next.maxRetries ?? configuration.maxRetries)),
  };
}

export function setCrashConsent(next: CrashConsent): void {
  consent = next;
}

export function getCrashConsent(): CrashConsent {
  return consent;
}

export async function recordCrash(error: unknown, kind: CrashKind = 'fatal-js'): Promise<CrashEnvelope> {
  const source = globalThis as typeof globalThis & {
    __rayactPlatform?: { target?: string; os?: string };
    __RAYACT_ENGINE_VERSION__?: string;
  };
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const envelope = fitEnvelope({
    schemaVersion: 1,
    id: randomId(),
    timestamp: new Date().toISOString(),
    kind,
    message: redact(message),
    stack: stack ? redact(stack) : undefined,
    platform: source.__rayactPlatform?.target ?? source.__rayactPlatform?.os ?? 'unknown',
    engineVersion: source.__RAYACT_ENGINE_VERSION__ ?? 'unknown',
    appVersion: configuration.appVersion,
  });
  const reports = await storage().load();
  reports.push(envelope);
  await storage().save(reports.slice(-configuration.maxStoredReports));
  return envelope;
}

export async function listCrashReports(): Promise<CrashEnvelope[]> {
  return storage().load();
}

export async function exportCrashReport(id: string): Promise<string | null> {
  const report = (await storage().load()).find(item => item.id === id);
  return report ? JSON.stringify(report, null, 2) : null;
}

export async function deleteCrashReport(id: string): Promise<boolean> {
  const reports = await storage().load();
  const filtered = reports.filter(item => item.id !== id);
  if (filtered.length === reports.length) return false;
  await storage().save(filtered);
  return true;
}

export async function flushCrashReports(): Promise<{ uploaded: number; remaining: number }> {
  const reports = await storage().load();
  if (configuration.mode !== 'upload' || consent !== 'granted') return { uploaded: 0, remaining: reports.length };
  const fetchFn = configuration.fetch ?? globalThis.fetch;
  if (!fetchFn || !configuration.endpoint?.startsWith('https://')) return { uploaded: 0, remaining: reports.length };
  let uploaded = 0;
  for (const report of reports) {
    let ok = false;
    for (let attempt = 0; attempt <= configuration.maxRetries && !ok; attempt++) {
      try {
        const response = await fetchFn(configuration.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(report),
        });
        ok = response.ok;
      } catch {
        ok = false;
      }
    }
    if (!ok) break;
    uploaded++;
  }
  if (uploaded) await storage().save(reports.slice(uploaded));
  return { uploaded, remaining: reports.length - uploaded };
}

type CrashGlobal = typeof globalThis & {
  __rayactRecordCrash?: (error: unknown, kind?: CrashKind) => void;
  addEventListener?: (type: string, listener: (event: any) => void) => void;
};
const host = globalThis as CrashGlobal;
host.__rayactRecordCrash = (error, kind) => { void recordCrash(error, kind); };
host.addEventListener?.('unhandledrejection', event => { void recordCrash(event?.reason, 'unhandled-rejection'); });

try {
  const invoke = (globalThis as { __rayact_invoke?: (name: string, method: string, args?: ArrayBufferLike) => ArrayBuffer }).__rayact_invoke;
  if (invoke) {
    const marker = new Uint8Array(invoke('crash-reporter', 'consumeMarker'));
    if (marker.byteLength === 16) {
      const signalNumber = new DataView(marker.buffer, marker.byteOffset, marker.byteLength).getUint16(6, true);
      void recordCrash(new Error(`Native signal ${signalNumber}`), 'native-signal');
    }
  }
} catch {
  // The JS-only Web implementation has no native signal marker.
}
