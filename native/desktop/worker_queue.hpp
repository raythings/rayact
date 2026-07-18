#pragma once
#include <mutex>
#include <condition_variable>
#include <queue>
#include <string>
#include <atomic>
#include <chrono>
#include <cstdint>

enum class WorkerMsgType {
    String,
    JSON,
    Primitive,
    CanvasReady,   // pixel buffer presented (entry->canvas)
    DrawReady,     // draw-command buffer presented (entry->draw) — frame source only
    NodeCommands,  // binary raym3 mutation stream in payload (applied on JS thread)
};

struct WorkerMessage {
    int workerId         = 0;
    WorkerMsgType type   = WorkerMsgType::JSON;
    std::string payload;        // JSON or raw string
    double numericValue  = 0.0; // Primitive type
    int canvasWidth      = 0;
    int canvasHeight     = 0;
};

class RayactMessageQueue {
    std::mutex              mtx;
    std::condition_variable cv;
    std::queue<WorkerMessage> q;

public:
    void push(WorkerMessage msg) {
        {
            std::lock_guard<std::mutex> lk(mtx);
            q.push(std::move(msg));
        }
        cv.notify_one();
    }

    bool empty() {
        std::lock_guard<std::mutex> lk(mtx);
        return q.empty();
    }

    // Non-blocking — main thread drain each frame
    bool pop(WorkerMessage& out) {
        std::lock_guard<std::mutex> lk(mtx);
        if (q.empty()) return false;
        out = std::move(q.front());
        q.pop();
        return true;
    }

    // Blocking — worker threads sleep here between messages
    bool wait_pop(WorkerMessage& out, std::atomic<bool>& stop) {
        std::unique_lock<std::mutex> lk(mtx);
        cv.wait(lk, [&] { return !q.empty() || stop.load(); });
        if (q.empty()) return false;
        out = std::move(q.front());
        q.pop();
        return true;
    }

    // Blocking with deadline — for workers that also service timers. Returns
    // false on timeout or stop with no message queued.
    bool wait_pop_for(WorkerMessage& out, std::atomic<bool>& stop, int64_t ms) {
        std::unique_lock<std::mutex> lk(mtx);
        auto ready = [&] { return !q.empty() || stop.load(); };
        if (ms < 0) cv.wait(lk, ready);
        else cv.wait_for(lk, std::chrono::milliseconds(ms), ready);
        if (q.empty()) return false;
        out = std::move(q.front());
        q.pop();
        return true;
    }

    void wake_all() { cv.notify_all(); }

    // Interruptible sleep — returns early when wake_all() is called (shutdown).
    // Uses the same CV as the message queue; does not block push().
    void sleep(int64_t ms, std::atomic<bool>& stop) {
        std::unique_lock<std::mutex> lk(mtx);
        cv.wait_for(lk, std::chrono::milliseconds(ms),
                    [&] { return stop.load(); });
    }
};

// Worker → main: all workers share one outbound queue (defined in workers.cpp)
extern RayactMessageQueue g_workerOutbox;
