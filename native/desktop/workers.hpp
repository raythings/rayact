#pragma once
#include "worker_queue.hpp"

#include <thread>
#include <atomic>
#include <mutex>
#include <vector>
#include <cstdint>
#include <memory>
#include <string>

extern "C" {
#include "quickjs.h"
}

struct CanvasBuffer {
    std::mutex           mtx;
    std::vector<uint8_t> pixels;
    int width  = 0;
    int height = 0;
};

// Latest presented draw-command stream (see worker_draw.hpp for the format).
// The worker swaps a new frame in under the mutex; the render thread copies it
// out each frame and replays it. Retained: the same stream keeps drawing until
// the worker presents a new one.
struct DrawCommandBuffer {
    std::mutex           mtx;
    std::vector<uint8_t> front;
    uint64_t             version = 0;   // bumped per present
};

struct WorkerEntry {
    std::thread          thread;
    RayactMessageQueue   inbox;        // main → worker
    std::atomic<bool>    stop{false};
    CanvasBuffer         canvas;       // WASM pixel output
    DrawCommandBuffer    draw;         // draw-command output (JS + WASM)
    int                  workerId = 0;
    std::string          modulePath;   // .wasm file path, set for WASM workers only
    bool                 isWasm = false;

    // Non-copyable, non-movable due to mutex + atomic
    WorkerEntry() = default;
    WorkerEntry(const WorkerEntry&) = delete;
    WorkerEntry& operator=(const WorkerEntry&) = delete;
};

// Called from registerNativeFunctions() in main.cpp
void registerWorkerBindings(JSContext* ctx);

// Called from mainLoop() each frame to deliver worker messages to JS
void drainWorkerOutbox(JSContext* ctx);

// Called from mainLoop() after raym3 Render + HitTest — routes hover/move/mousedown
// to worker inboxes. mouseX/Y are screen-space cursor coordinates.
void processWorkerInputEvents(float mouseX, float mouseY,
                              bool mousePressed, bool mouseReleased, bool mouseDown);

// Called from main() cleanup before JS_FreeContext
void shutdownWorkers();

// Worker-thread helpers (used by worker_js / worker_wasm bindings):
// publish a new draw-command frame (swaps entry->draw and pushes a DrawReady
// wake message), and queue a raym3 node-command stream for the JS thread.
void workerPresentDrawCommands(const std::shared_ptr<WorkerEntry>& entry,
                               const uint8_t* data, size_t len);
// Wake the platform render owner after any worker publishes retained output.
// Desktop's loop is already live; mobile schedulers are explicitly on-demand.
void workerRequestRenderFrame();
void workerPostNodeCommands(int workerId, std::string bytes);

// Frame source for engineNeedsAnotherFrame(): true while worker output is
// waiting to be drained or a presented draw frame hasn't been replayed yet.
bool workersFramePending();

// Dev-tools Performance panel: file paths of currently-alive WASM workers
// (one entry per spawnWorker('*.wasm') call still running). JS-native module
// declarations (rayact.config.json) are a build-time developer choice already
// shown in the launcher; this is the runtime-loaded WASM surface instead.
std::vector<std::string> getLoadedWasmModulePaths();

// Replay retained worker command buffers directly from the native render loop.
// raym3 supplies viewport layout; no worker frame crosses the main JS bridge.
void renderWorkerViews();
