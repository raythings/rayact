export type ImpactFeedbackStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';
export type NotificationFeedbackType = 'success' | 'warning' | 'error';

type PlatformHost = typeof globalThis & {
  platformCall?: (
    module: string,
    method: string,
    payload: unknown,
    callback: (result: { ok: boolean; error?: string }) => void,
  ) => void;
  navigator?: { vibrate?: (pattern: number | number[]) => boolean };
};

function call(method: string, payload: unknown = {}): Promise<void> {
  const host = globalThis as PlatformHost;
  if (!host.platformCall) {
    if (host.navigator?.vibrate) {
      host.navigator.vibrate(method === 'notification' ? [10, 30, 10] : 10);
      return Promise.resolve();
    }
    return Promise.reject(new Error('Haptic feedback is unavailable on this platform'));
  }
  let result: { ok: boolean; error?: string } | undefined;
  host.platformCall('haptics', method, payload, value => { result = value; });
  if (!result) return Promise.reject(new Error('Haptic feedback did not complete'));
  return result.ok
    ? Promise.resolve()
    : Promise.reject(new Error(result.error || 'Haptic feedback failed'));
}

export function selectionAsync(): Promise<void> {
  return call('selection');
}

export function impactAsync(style: ImpactFeedbackStyle = 'medium'): Promise<void> {
  return call('impact', { style });
}

export function notificationAsync(type: NotificationFeedbackType = 'success'): Promise<void> {
  return call('notification', { type });
}

export default { selectionAsync, impactAsync, notificationAsync };
