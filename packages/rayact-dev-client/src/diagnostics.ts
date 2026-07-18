import { getPerformanceMetrics, setPerformanceSampling, type PerformanceMetrics } from './native.js';

export interface UnavailableMetric {
  available: false;
  reason: string;
}

export interface AvailableMetric {
  available: true;
  value: number;
  unit: string;
}

export type OptionalDiagnosticMetric = AvailableMetric | UnavailableMetric;

export interface FrameDiagnostics {
  frameTimeMs: number;
  rollingFrameTimeMs: number;
  fps: number;
  targetRefreshRate: number;
  droppedFrames: number;
  jankyFrames: number;
  sampleFrames: number;
}

export interface DiagnosticsSnapshot {
  frame: FrameDiagnostics;
  cpu: OptionalDiagnosticMetric;
  gpu: OptionalDiagnosticMetric;
  gpuDeviceName: string | null;
  gpuBackend: string | null;
  memory: OptionalDiagnosticMetric;
  bundleRevision: number | null;
  hmrState: string;
  platform: string;
  mode: string;
  engineVersion: string;
  loadedWasmModules: string[];
}

type NativeFrameSnapshot = Partial<FrameDiagnostics>;
type DiagnosticsGlobal = typeof globalThis & {
  __rayactGetFrameDiagnostics?: () => NativeFrameSnapshot;
  __RAYACT_REVISION__?: number;
  __RAYACT_HMR_ACTIVE__?: boolean;
  __RAYACT_HMR_STATE__?: string;
  __RAYACT_MODE__?: string;
  __RAYACT_ENGINE_VERSION__?: string;
  __rayactPlatform?: { os?: string; target?: string };
  getLoadedWasmModules?: () => string;
};

function readLoadedWasmModules(source: DiagnosticsGlobal): string[] {
  if (typeof source.getLoadedWasmModules !== 'function') return [];
  try {
    const parsed = JSON.parse(source.getLoadedWasmModules());
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

const unavailable = (reason: string): UnavailableMetric => ({ available: false, reason });
const available = (value: number, unit: string): AvailableMetric => ({ available: true, value, unit });

let hostMetrics: PerformanceMetrics = {};

export function getDiagnosticsSnapshot(source: DiagnosticsGlobal = globalThis as DiagnosticsGlobal): DiagnosticsSnapshot {
  const raw = typeof source.__rayactGetFrameDiagnostics === 'function'
    ? source.__rayactGetFrameDiagnostics()
    : {};
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return {
    frame: {
      frameTimeMs: number(hostMetrics.frameTimeMs ?? raw.frameTimeMs),
      rollingFrameTimeMs: number(hostMetrics.rollingFrameTimeMs ?? raw.rollingFrameTimeMs),
      fps: number(hostMetrics.fps ?? raw.fps),
      targetRefreshRate: number(hostMetrics.targetRefreshRate ?? raw.targetRefreshRate) || 60,
      droppedFrames: number(hostMetrics.droppedFrames ?? raw.droppedFrames),
      jankyFrames: number(hostMetrics.jankyFrames ?? raw.jankyFrames),
      sampleFrames: number(hostMetrics.sampleFrames ?? raw.sampleFrames),
    },
    cpu: typeof hostMetrics.cpuPercent === 'number'
      ? available(hostMetrics.cpuPercent, '%')
      : unavailable('Process CPU measurement is not supported by this host'),
    // "Utilization" here is a proxy — GPU busy time as a fraction of the
    // frame budget (gpuFrameTimeMs / (1000/targetRefreshRate)) — not an
    // occupancy counter (Vulkan/Metal don't expose one portably). A frame
    // that takes the full budget on the GPU reads ~100%.
    gpu: typeof hostMetrics.gpuPercent === 'number'
      ? available(hostMetrics.gpuPercent, '%')
      : typeof hostMetrics.gpuFrameTimeMs === 'number'
        ? available(
            Math.min(100, (hostMetrics.gpuFrameTimeMs / (1000 / (number(hostMetrics.targetRefreshRate) || 60))) * 100),
            '%',
          )
        : unavailable('GPU timing/utilization is not exposed reliably by this graphics backend'),
    gpuDeviceName: hostMetrics.gpuDeviceName || null,
    gpuBackend: hostMetrics.gpuBackend || null,
    memory: typeof hostMetrics.memoryMb === 'number'
      ? available(hostMetrics.memoryMb, 'MB')
      : unavailable('Process memory measurement is not supported by this host'),
    bundleRevision: typeof source.__RAYACT_REVISION__ === 'number' ? source.__RAYACT_REVISION__ : null,
    hmrState: source.__RAYACT_HMR_STATE__ ?? (source.__RAYACT_HMR_ACTIVE__ ? 'active' : 'idle'),
    platform: source.__rayactPlatform?.os ?? source.__rayactPlatform?.target ?? 'unknown',
    mode: source.__RAYACT_MODE__ ?? 'development',
    engineVersion: source.__RAYACT_ENGINE_VERSION__ ?? 'QuickJS-ng',
    loadedWasmModules: readLoadedWasmModules(source),
  };
}

/** Expensive host metrics are sampled only for the lifetime of a subscription. */
export function subscribeDiagnostics(
  listener: (snapshot: DiagnosticsSnapshot) => void,
  intervalMs = 500,
): () => void {
  const sample = () => {
    void getPerformanceMetrics()
      .then(metrics => { hostMetrics = metrics; })
      .catch(() => {});
    listener(getDiagnosticsSnapshot());
  };
  void setPerformanceSampling(true).catch(() => {});
  sample();
  const timer = setInterval(sample, Math.max(250, intervalMs));
  return () => {
    clearInterval(timer);
    void setPerformanceSampling(false).catch(() => {});
  };
}
