export interface UnavailableDiagnosticMetricV1 {
  available: false;
  reason: string;
}

export interface AvailableDiagnosticMetricV1 {
  available: true;
  value: number;
  unit: 'ms' | 'fps' | 'count' | '%' | 'MiB';
}

export type DiagnosticMetricV1 = AvailableDiagnosticMetricV1 | UnavailableDiagnosticMetricV1;

export interface DiagnosticsSnapshotV1 {
  schemaVersion: 1;
  timestamp: number;
  frameTime: DiagnosticMetricV1;
  rollingFrameTime: DiagnosticMetricV1;
  fps: DiagnosticMetricV1;
  droppedFrames: DiagnosticMetricV1;
  jankyFrames: DiagnosticMetricV1;
  memory: DiagnosticMetricV1;
  cpu: DiagnosticMetricV1;
  platform: string;
  engineVersion: string;
}

type DiagnosticsGlobal = typeof globalThis & {
  __rayactGetFrameDiagnostics?: () => Record<string, unknown>;
  __rayactGetProcessDiagnostics?: () => Record<string, unknown>;
  __rayactPlatform?: { os?: string; target?: string };
  __RAYACT_ENGINE_VERSION__?: string;
};

const unavailable = (reason: string): UnavailableDiagnosticMetricV1 => ({ available: false, reason });
const numberMetric = (value: unknown, unit: AvailableDiagnosticMetricV1['unit']): DiagnosticMetricV1 =>
  typeof value === 'number' && Number.isFinite(value)
    ? { available: true, value, unit }
    : unavailable('Metric is not exposed by this host');

export function getDiagnostics(
  source: DiagnosticsGlobal = globalThis as DiagnosticsGlobal,
): DiagnosticsSnapshotV1 {
  const frame = source.__rayactGetFrameDiagnostics?.() ?? {};
  const process = source.__rayactGetProcessDiagnostics?.() ?? {};
  return {
    schemaVersion: 1,
    timestamp: Date.now(),
    frameTime: numberMetric(frame.frameTimeMs, 'ms'),
    rollingFrameTime: numberMetric(frame.rollingFrameTimeMs, 'ms'),
    fps: numberMetric(frame.fps, 'fps'),
    droppedFrames: numberMetric(frame.droppedFrames, 'count'),
    jankyFrames: numberMetric(frame.jankyFrames, 'count'),
    memory: numberMetric(process.memoryMb, 'MiB'),
    cpu: numberMetric(process.cpuPercent, '%'),
    platform: source.__rayactPlatform?.target ?? source.__rayactPlatform?.os ?? 'unknown',
    engineVersion: source.__RAYACT_ENGINE_VERSION__ ?? 'unknown',
  };
}

export function subscribeDiagnostics(
  listener: (snapshot: DiagnosticsSnapshotV1) => void,
  intervalMs = 500,
): () => void {
  const sample = () => listener(getDiagnostics());
  sample();
  const timer = setInterval(sample, Math.max(250, intervalMs));
  return () => clearInterval(timer);
}
