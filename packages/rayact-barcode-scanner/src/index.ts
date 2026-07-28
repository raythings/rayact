export type BarcodeFormat =
  | 'qr'
  | 'aztec'
  | 'codabar'
  | 'code128'
  | 'code39'
  | 'code93'
  | 'dataMatrix'
  | 'ean13'
  | 'ean8'
  | 'itf'
  | 'pdf417'
  | 'upcA'
  | 'upcE';

export interface BarcodeResult {
  data: string;
  format: BarcodeFormat | 'unknown';
}

export interface ScanOptions {
  formats?: BarcodeFormat[];
}

type ScannerHost = typeof globalThis & {
  __rayactBarcodeScannerIsAvailable?: () => boolean | Promise<boolean>;
  __rayactBarcodeScannerScan?: (options: ScanOptions) => Promise<BarcodeResult>;
  BarcodeDetector?: new (options?: { formats?: string[] }) => {
    detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string; format: string }>>;
  };
  navigator?: Navigator;
  document?: Document;
  platformCall?: (
    module: string,
    method: string,
    data: unknown,
    callback: (result: { ok: boolean; value?: unknown; error?: string }) => void
  ) => void;
};

const host = globalThis as ScannerHost;

export async function isAvailableAsync(): Promise<boolean> {
  if (host.__rayactBarcodeScannerIsAvailable) {
    return host.__rayactBarcodeScannerIsAvailable();
  }
  if (host.document) {
    return !!host.BarcodeDetector && !!host.navigator?.mediaDevices?.getUserMedia;
  }
  return platformCall<boolean>('isAvailable').catch(() => false);
}

function platformCall<T>(method: string, data: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!host.platformCall) {
      reject(new Error('Barcode scanner native bridge is unavailable'));
      return;
    }
    host.platformCall('barcode-scanner', method, data, result => {
      if (result?.ok) resolve(result.value as T);
      else reject(new Error(result?.error || `Barcode scanner operation failed: ${method}`));
    });
  });
}

async function scanNative(options: ScanOptions): Promise<BarcodeResult> {
  await platformCall('startScan', options);
  for (;;) {
    const raw = await platformCall<unknown>('pollScan');
    const state = typeof raw === 'string' ? JSON.parse(raw) as {
      status: string;
      data?: string;
      format?: BarcodeFormat;
      error?: string;
    } : raw as { status: string; data?: string; format?: BarcodeFormat; error?: string };
    if (state.status === 'success' && state.data) {
      return { data: state.data, format: state.format ?? 'unknown' };
    }
    if (state.status === 'canceled') {
      const error = new Error('Barcode scan was canceled');
      error.name = 'RayactBarcodeCanceledError';
      throw error;
    }
    if (state.status === 'error') {
      const error = new Error(state.error || 'Native barcode scan failed');
      error.name = 'RayactBarcodeNativeError';
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function scanWeb(options: ScanOptions): Promise<BarcodeResult> {
  if (!host.BarcodeDetector || !host.navigator?.mediaDevices?.getUserMedia || !host.document) {
    const error = new Error('Barcode scanner is unavailable on this platform');
    error.name = 'RayactBarcodeUnavailableError';
    throw error;
  }
  const stream = await host.navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
  });
  const video = host.document.createElement('video');
  video.srcObject = stream;
  video.playsInline = true;
  await video.play();
  const detector = new host.BarcodeDetector({
    formats: options.formats?.map(value => value === 'qr' ? 'qr_code' : value),
  });
  try {
    return await new Promise<BarcodeResult>((resolve, reject) => {
      const started = Date.now();
      const tick = async () => {
        try {
          const [result] = await detector.detect(video);
          if (result?.rawValue) {
            resolve({
              data: result.rawValue,
              format: result.format === 'qr_code' ? 'qr' : result.format as BarcodeFormat,
            });
            return;
          }
          if (Date.now() - started > 60_000) {
            const error = new Error('Barcode scan canceled or timed out');
            error.name = 'RayactBarcodeCanceledError';
            reject(error);
            return;
          }
          requestAnimationFrame(tick);
        } catch (error) {
          reject(error);
        }
      };
      void tick();
    });
  } finally {
    stream.getTracks().forEach(track => track.stop());
    video.remove();
  }
}

export async function scanAsync(options: ScanOptions = {}): Promise<BarcodeResult> {
  if (host.__rayactBarcodeScannerScan) return host.__rayactBarcodeScannerScan(options);
  if (host.document) return scanWeb(options);
  return scanNative(options);
}

export default { scanAsync, isAvailableAsync };
