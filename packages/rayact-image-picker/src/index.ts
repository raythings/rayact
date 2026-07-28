export type MediaType = 'images';

export interface ImagePickerOptions {
  mediaTypes?: MediaType | MediaType[];
  quality?: number;
  base64?: boolean;
}

export interface ImagePickerAsset {
  uri: string;
  mimeType?: string;
  width: number;
  height: number;
  fileName?: string | null;
  base64?: string | null;
}

export type ImagePickerResult =
  | { canceled: true; assets: null }
  | { canceled: false; assets: ImagePickerAsset[] };

export interface PermissionResponse {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'undetermined';
}

type PickerHost = typeof globalThis & {
  __rayactImagePickerRequestPermission?: () => Promise<PermissionResponse>;
  __rayactImagePickerLaunch?: (options: ImagePickerOptions) => Promise<ImagePickerResult>;
  document?: Document;
  FileReader?: typeof FileReader;
  Image?: typeof Image;
  platformCall?: (
    module: string,
    method: string,
    data: unknown,
    callback: (result: { ok: boolean; value?: unknown; error?: string }) => void
  ) => void;
};

const host = globalThis as PickerHost;

export async function requestMediaLibraryPermissionsAsync(): Promise<PermissionResponse> {
  if (host.__rayactImagePickerRequestPermission) {
    return host.__rayactImagePickerRequestPermission();
  }
  if (host.document) return { granted: true, canAskAgain: true, status: 'granted' };
  return platformCall<PermissionResponse>('requestPermission');
}

function platformCall<T>(method: string, data: unknown = {}): Promise<T> {
  if (!host.platformCall) {
    return Promise.reject(new Error('Image picker native bridge is unavailable'));
  }
  let result: { ok: boolean; value?: unknown; error?: string } | undefined;
  host.platformCall('image-picker', method, data, value => { result = value; });
  if (!result) return Promise.reject(new Error(`Image picker operation did not complete: ${method}`));
  return result.ok
    ? Promise.resolve(result.value as T)
    : Promise.reject(new Error(result.error || `Image picker operation failed: ${method}`));
}

async function launchNative(options: ImagePickerOptions): Promise<ImagePickerResult> {
  await platformCall('startPicker', options);
  for (;;) {
    const raw = await platformCall<unknown>('pollPicker');
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (state.status === 'success') return { canceled: false, assets: state.assets };
    if (state.status === 'canceled') return { canceled: true, assets: null };
    if (state.status === 'error') throw new Error(state.error || 'Native image picker failed');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function readDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read selected image'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function dimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Unable to decode selected image'));
    image.src = uri;
  });
}

async function launchWeb(options: ImagePickerOptions): Promise<ImagePickerResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ canceled: true, assets: null });
        return;
      }
      try {
        const dataUrl = await readDataURL(file);
        const size = await dimensions(dataUrl);
        resolve({
          canceled: false,
          assets: [{
            uri: URL.createObjectURL(file),
            mimeType: file.type || undefined,
            width: size.width,
            height: size.height,
            fileName: file.name,
            base64: options.base64 ? dataUrl.slice(dataUrl.indexOf(',') + 1) : undefined,
          }],
        });
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}

export async function launchImageLibraryAsync(
  options: ImagePickerOptions = {},
): Promise<ImagePickerResult> {
  if (host.__rayactImagePickerLaunch) return host.__rayactImagePickerLaunch(options);
  if (host.document) return launchWeb(options);
  return launchNative(options);
}

export default { requestMediaLibraryPermissionsAsync, launchImageLibraryAsync };
