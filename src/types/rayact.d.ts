/**
 * Ambient declarations for host globals injected by
 * the native engine into every JS context (main + workers).
 *
 * Loaded automatically by the public rayact declaration entrypoints.
 */

declare global {
  /** Asset descriptor produced by the bundler's createAsset(). */
  interface RayactAsset {
    id: string;
    name: string;
    type?: string;
    outputName?: string;
    url(): string;
    bytes(): Uint8Array | ArrayBuffer | number[];
  }

  /** Synchronous built-in key-value store (module bus "kv" backend). */
  interface RayactStorage {
    getString(key: string): string | null;
    set(key: string, value: string): void;
    delete(key: string): void;
    getAllKeys(): string[];
    clear(): void;
  }

  /** AsyncStorage facade (React-Native-familiar) over the same store. */
  interface RayactAsyncStorage {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    getAllKeys(): Promise<string[]>;
    clear(): Promise<void>;
  }

  /** Message delivered from a worker to the main thread. */
  type RayactWorkerMessage = unknown;

  const Storage: RayactStorage;
  const AsyncStorage: RayactAsyncStorage;

  /**
   * Module bus — invoke a named native module's method with raw bytes.
   * Reachable from main, JS workers, and (as sys_invoke) WASM workers.
   */
  const __rayact_invoke: (name: string, method: string, args?: ArrayBufferLike) => ArrayBuffer;
  const __rayact_invoke_async: (
    name: string,
    method: string,
    args?: ArrayBufferLike
  ) => Promise<ArrayBuffer>;

  /** Workers. */
  const spawnWorker: (
    worker: string | RayactAsset | Record<string, unknown>,
    initialData?: unknown
  ) => number;
  const postToWorker: (workerId: number, data: unknown) => void;
  const terminateWorker: (workerId: number) => void;
  // Assignable global callback the engine invokes for each worker message.
  // eslint-disable-next-line no-var
  var onWorkerMessage: ((workerId: number, data: RayactWorkerMessage) => void) | undefined;

  /** Desktop-only window bring-up (no-op on Android). */
  const initRaylib: ((width: number, height: number, title: string) => void) | undefined;
  const registerFont: ((name: string, path: string) => void) | undefined;

  // ── Web-ish globals the engine provides (rayact is not a browser, so target
  //    "lib": ["ES2020"] without "DOM" and let these come from here). ──────────
}

export {};
