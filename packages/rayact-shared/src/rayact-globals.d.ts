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
  // Creates a raym3 node the given worker draws into (draw commands, pixel
  // canvas, or a worker-recorded raym3 subtree). viewportNodeId provides the
  // regular host element whose layout/clipping rect the canvas occupies.
  const createWorkerView: (
    workerId: number,
    width: number,
    height: number,
    viewportNodeId?: number
  ) => number;
  // Assignable global callback the engine invokes for each worker message.
  // eslint-disable-next-line no-var
  var onWorkerMessage: ((workerId: number, data: RayactWorkerMessage) => void) | undefined;

  /** Worker-side globals (inside spawnWorker scripts only). */
  // Publish a draw-command frame (see rayact/worker WorkerCanvas.present).
  const presentDrawCommands: ((buf: Uint8Array | ArrayBuffer) => void) | undefined;
  // Queue a raym3 node-command stream (see rayact/worker WorkerNodeTree.flush).
  const flushNodeCommands: ((buf: Uint8Array | ArrayBuffer) => void) | undefined;
  // Worker → main message (JSON-serialized).
  const postMessage: ((data: unknown) => void) | undefined;
  // Assignable main → worker message callback.
  // eslint-disable-next-line no-var
  var onMessage: ((data: unknown) => void) | undefined;

  /** Desktop-only window bring-up (no-op on Android). */
  const initRaylib: ((width: number, height: number, title: string) => void) | undefined;
  const registerFont: ((name: string, path: string) => void) | undefined;

  // ── Web-ish globals the engine provides (rayact is not a browser, so target
  //    "lib": ["ES2020"] without "DOM" and let these come from here). ──────────
}

export {};
