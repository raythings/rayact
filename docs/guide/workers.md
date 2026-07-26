# Workers & WASM components

Rayact runs app-supplied workers off the JS thread: **WASM workers** (any
language compiling to freestanding wasm32 — C, Rust, Zig), **native C++
workers** (compiled into your host), and worker **views** — nodes whose content
a worker drives directly, bypassing React reconciliation entirely. This is the
escape hatch for simulations, visualizations and per-frame workloads.

## Platform support

| Platform | WASM workers | Native workers |
| --- | --- | --- |
| Desktop (mac/linux) | ✅ (wasm3 interpreter, own thread) | ✅ |
| Android / iOS | ✅ | ✅ |
| Web | ✅ **pthreads host required** (see [web guide](/guide/web)) | ✅ (same requirement) |

## Spawning a WASM worker

The worker API is host globals (typed declarations ship in `rayact/worker`):

```ts
declare global {
  function spawnWorker(path: string, initialData?: unknown): number;
  function postToWorker(workerId: number, data: unknown): void;
  function terminateWorker(workerId: number): void;
  function createWorkerView(
    workerId: number, width: number, height: number, viewportNodeId?: number
  ): number;
}

const id = spawnWorker('./rayact-assets/sim.wasm', { mode: 1 });
postToWorker(id, { tick: true });
```

Reference the `.wasm` by project-relative path; builds stage it per platform
(APK assets, app bundle, `.rayactpack`, web `app-assets.json`) automatically.

## Worker views: workers that render

`createWorkerView(workerId, w, h, viewportNodeId?)` gives the worker a surface.
Two protocols, chosen by the worker:

- **Draw protocol** — immediate-mode command stream (clear/rect/line/circle/
  text…). `WorkerCanvas` in `rayact/worker` builds the byte stream if your
  worker is JS/TS; a wasm32 worker emits the same opcodes directly.
- **Node protocol** — the worker creates/updates retained raym3 nodes
  (`WorkerNodeTree`), so its output participates in layout and styling.

Anchor the view inside your React tree by passing the host node's id:

```tsx
const hostRef = useRef<ViewHandle>(null);
useEffect(() => {
  const id = spawnWorker('./rayact-assets/sim.wasm');
  createWorkerView(id, 320, 260, hostRef.current?.node?.id);
  return () => terminateWorker(id);
}, []);
<View ref={hostRef} style={{ height: 260 }} />
```

## Writing a wasm32 worker

Any freestanding wasm32 module works — no libc, no WASI. Export the entry
points the host calls (`init`, `frame`, `on_message`), import the host's
draw/node functions, and compile with your toolchain's freestanding target
(`clang --target=wasm32 -nostdlib`, Rust `wasm32-unknown-unknown`, Zig
`wasm32-freestanding`). Keep the module self-contained; the engine runs it in
the embedded wasm3 interpreter on its own thread.

## Native C++ workers

Drop `.cpp` files under `native/workers/<name>/` in your project and register
with `RAYACT_REGISTER_NATIVE_WORKER`. They compile into the host at prebuild
time and use the same message/view API at full native speed.

## Worklets

`@rayact/worklets` (`useWorklet`, `useAnimatedStyle`, `registerWorkletNode`)
is an early UI-thread-worklet surface aimed at gesture-driven styles; prefer
[`SharedValue`](/guide/animation#sharedvalue--imperative-render-thread-driven)
for production animation today.
