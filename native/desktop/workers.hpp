#pragma once
#include "worker_queue.hpp"

#include <thread>
#include <atomic>
#include <mutex>
#include <vector>
#include <cstdint>

extern "C" {
#include "quickjs.h"
}

struct CanvasBuffer {
    std::mutex           mtx;
    std::vector<uint8_t> pixels;
    int width  = 0;
    int height = 0;
};

struct WorkerEntry {
    std::thread          thread;
    RayactMessageQueue   inbox;        // main → worker
    std::atomic<bool>    stop{false};
    CanvasBuffer         canvas;       // WASM pixel output
    int                  workerId = 0;

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
