type ClipboardHost = typeof globalThis & {
  platformCall?: (
    module: string,
    method: string,
    payload: unknown,
    callback: (result: { ok: boolean; value?: unknown; error?: string }) => void,
  ) => void;
  __rayactClipboardRead?: () => string;
  __rayactClipboardWrite?: (text: string) => void;
  __rayactClipboardHasString?: () => boolean;
  navigator?: {
    clipboard?: {
      readText?: () => Promise<string>;
      writeText?: (text: string) => Promise<void>;
    };
  };
};

function unavailable(): Error {
  const error = new Error('Clipboard is unavailable on this platform');
  error.name = 'RayactClipboardUnavailableError';
  return error;
}

function platformCall<T>(method: string, payload: unknown = {}): Promise<T> {
  const host = globalThis as ClipboardHost;
  if (!host.platformCall) return Promise.reject(unavailable());
  let result: { ok: boolean; value?: unknown; error?: string } | undefined;
  host.platformCall('clipboard', method, payload, value => { result = value; });
  if (!result) return Promise.reject(new Error(`Clipboard operation did not complete: ${method}`));
  return result.ok
    ? Promise.resolve(result.value as T)
    : Promise.reject(new Error(result.error || `Clipboard operation failed: ${method}`));
}

export async function getStringAsync(): Promise<string> {
  const host = globalThis as ClipboardHost;
  if (host.platformCall) return platformCall<string>('getString');
  if (host.__rayactClipboardRead) return host.__rayactClipboardRead();
  if (host.navigator?.clipboard?.readText) return host.navigator.clipboard.readText();
  throw unavailable();
}

export async function setStringAsync(text: string): Promise<void> {
  const host = globalThis as ClipboardHost;
  if (host.platformCall) return platformCall<void>('setString', { text: String(text) });
  if (host.__rayactClipboardWrite) {
    host.__rayactClipboardWrite(String(text));
    return;
  }
  if (host.navigator?.clipboard?.writeText) {
    await host.navigator.clipboard.writeText(String(text));
    return;
  }
  throw unavailable();
}

export async function hasStringAsync(): Promise<boolean> {
  const host = globalThis as ClipboardHost;
  if (host.platformCall) return platformCall<boolean>('hasString');
  if (host.__rayactClipboardHasString) return host.__rayactClipboardHasString();
  return (await getStringAsync()).length > 0;
}

const host = globalThis as ClipboardHost;
const navigatorObject = host.navigator ?? ({} as NonNullable<ClipboardHost['navigator']>);
if (!host.navigator) {
  Object.defineProperty(host, 'navigator', { value: navigatorObject, configurable: true });
}
if (!navigatorObject.clipboard) {
  Object.defineProperty(navigatorObject, 'clipboard', {
    value: { readText: getStringAsync, writeText: setStringAsync },
    configurable: true,
  });
}

export default { getStringAsync, setStringAsync, hasStringAsync };
