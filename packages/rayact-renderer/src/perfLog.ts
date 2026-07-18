type PerfCounters = {
  created: number;
  updated: number;
  disposed: number;
  mutationCount: number;
  binaryCreateFallbacks: number;
};

const counters: PerfCounters = {
  created: 0,
  updated: 0,
  disposed: 0,
  mutationCount: 0,
  binaryCreateFallbacks: 0,
};

let commitStart = 0;

function enabled(): boolean {
  return (globalThis as { __RAYACT_PERF_LOG?: boolean }).__RAYACT_PERF_LOG === true;
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function perfLog(event: string, data?: Record<string, unknown>): void {
  if (!enabled()) return;
  const payload = data ? { ...data, ts: now() } : { ts: now() };
  console.log(`[rayact:perf] ${event}`, payload);
}

export function perfMarkCommitStart(): void {
  if (!enabled()) return;
  commitStart = now();
  perfLog('commit.start');
}

export function perfMarkCommitEnd(): void {
  if (!enabled()) return;
  perfLog('commit.end', {
    durationMs: commitStart > 0 ? now() - commitStart : 0,
    'created.nodes': counters.created,
    'updated.nodes': counters.updated,
    'disposed.nodes': counters.disposed,
    'mutation.count': counters.mutationCount,
    'binary.create.fallbacks': counters.binaryCreateFallbacks,
  });
  counters.created = 0;
  counters.updated = 0;
  counters.disposed = 0;
  counters.mutationCount = 0;
  counters.binaryCreateFallbacks = 0;
}

export function perfIncCreated(): void {
  counters.created++;
}

export function perfIncUpdated(): void {
  counters.updated++;
}

export function perfIncDisposed(): void {
  counters.disposed++;
}

export function perfLogBatch(durationMs: number, count: number): void {
  if (!enabled()) return;
  counters.mutationCount += count;
  perfLog('native.batch.durationMs', { durationMs, count });
}

export function perfIncBinaryCreateFallback(type: string, reason: string): void {
  if (!enabled()) return;
  counters.binaryCreateFallbacks++;
  perfLog('binary.create.fallback', { type, reason });
}

export function perfNavPress(): void {
  perfLog('nav.press.ts');
}

export function perfTransitionShellMounted(): void {
  perfLog('transition.shellMounted.ts');
}

export function perfTransitionAnimationStarted(): void {
  perfLog('transition.animationStarted.ts');
}

export function perfTransitionContentMounted(): void {
  perfLog('transition.contentMounted.ts');
}
