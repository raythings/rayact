type ClipboardHost = typeof globalThis & {
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

export async function getStringAsync(): Promise<string> {
  const host = globalThis as ClipboardHost;
  if (host.__rayactClipboardRead) return host.__rayactClipboardRead();
  if (host.navigator?.clipboard?.readText) return host.navigator.clipboard.readText();
  throw unavailable();
}

export async function setStringAsync(text: string): Promise<void> {
  const host = globalThis as ClipboardHost;
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
