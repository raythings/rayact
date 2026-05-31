#pragma once
#include <mutex>
#include <condition_variable>
#include <queue>
#include <string>
#include <atomic>
#include <chrono>
#include <cstdint>

enum class WorkerMsgType { String, JSON, Primitive, CanvasReady };

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
