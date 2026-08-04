export type SensorType = 'accelerometer' | 'gyroscope' | 'rotation';

export interface SensorMeasurement {
  type: 'accelerometer' | 'gyroscope';
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export interface RotationMeasurement {
  type: 'rotation';
  roll: number;
  pitch: number;
  yaw: number;
  timestamp: number;
}

export interface ShakeEvent {
  type: 'shake';
  timestamp: number;
}

export interface SensorSubscription {
  remove(): void;
}

type NativeEvent = SensorMeasurement | RotationMeasurement | ShakeEvent;
type PlatformResponse = { ok: true; value: unknown } | { ok: false; error?: string };
type PlatformHost = typeof globalThis & {
  platformCall?: (
    module: string,
    method: string,
    payload: unknown,
    callback: (response: PlatformResponse) => void,
  ) => void;
  DeviceMotionEvent?: unknown;
};

const listeners = new Map<string, Set<(event: NativeEvent) => void>>();
let pollTimer: ReturnType<typeof setInterval> | undefined;

function rejectAfterHandlersAttach<T>(error: Error): Promise<T> {
  return new Promise<T>((_resolve, reject) => {
    setTimeout(() => reject(error), 0);
  });
}

function call<T>(method: string, payload: unknown = {}): Promise<T> {
  const host = globalThis as PlatformHost;
  if (!host.platformCall) {
    return rejectAfterHandlersAttach(new Error('Rayact sensors are unavailable on this platform'));
  }
  let response: PlatformResponse | undefined;
  try {
    host.platformCall('sensors', method, payload, value => { response = value; });
  } catch (error) {
    return rejectAfterHandlersAttach(error instanceof Error ? error : new Error(String(error)));
  }
  if (!response) return rejectAfterHandlersAttach(new Error(`Sensor operation did not complete: ${method}`));
  return response.ok
    ? Promise.resolve(response.value as T)
    : rejectAfterHandlersAttach(new Error(response.error || `Sensor operation failed: ${method}`));
}

async function drainEvents(): Promise<void> {
  const events = await call<NativeEvent[]>('drainEvents').catch(() => []);
  for (const event of events) {
    for (const listener of listeners.get(event.type) ?? []) listener(event);
  }
}

function updatePolling(): void {
  const active = [...listeners.values()].some(group => group.size > 0);
  if (active && !pollTimer) {
    pollTimer = setInterval(() => { void drainEvents(); }, 50);
  } else if (!active && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function subscribe<T extends NativeEvent>(
  type: T['type'],
  listener: (event: T) => void,
  intervalMs = 50,
): SensorSubscription {
  let group = listeners.get(type);
  if (!group) listeners.set(type, group = new Set());
  group.add(listener as (event: NativeEvent) => void);
  void call('startObserving', { type, intervalMs }).catch(() => {
    group?.delete(listener as (event: NativeEvent) => void);
    updatePolling();
  });
  updatePolling();
  let removed = false;
  return {
    remove() {
      if (removed) return;
      removed = true;
      group?.delete(listener as (event: NativeEvent) => void);
      if (!group?.size) {
        listeners.delete(type);
        void call('stopObserving', { type }).catch(() => {});
      }
      updatePolling();
    },
  };
}

export function isAvailableAsync(type: SensorType | 'shake'): Promise<boolean> {
  return call<boolean>('isAvailable', { type }).catch(() => false);
}

export function addListener(
  type: SensorMeasurement['type'],
  listener: (measurement: SensorMeasurement) => void,
  options: { intervalMs?: number } = {},
): SensorSubscription {
  return subscribe(type, listener, options.intervalMs);
}

export function addRotationListener(
  listener: (measurement: RotationMeasurement) => void,
  options: { intervalMs?: number } = {},
): SensorSubscription {
  return subscribe('rotation', listener, options.intervalMs);
}

export function addShakeListener(listener: (event: ShakeEvent) => void): SensorSubscription {
  return subscribe('shake', listener, 16);
}

export default { isAvailableAsync, addListener, addRotationListener, addShakeListener };
