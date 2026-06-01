#include "worker_native.hpp"
#include "worker_queue.hpp"

#include <mutex>
#include <thread>
#include <unordered_map>

static std::mutex s_nativeWorkerMutex;
static std::unordered_map<std::string, RayactNativeWorkerMain> s_nativeWorkers;

bool RayactNativeWorkerContext::shouldStop() const {
    return !entry || entry->stop.load();
}

void RayactNativeWorkerContext::postMessage(std::string json) const {
    g_workerOutbox.push({workerId, WorkerMsgType::JSON, std::move(json)});
}

bool RayactNativeWorkerContext::waitMessage(std::string& json) const {
    if (!entry) return false;
    WorkerMessage msg;
    if (!entry->inbox.wait_pop(msg, entry->stop)) return false;
    json = std::move(msg.payload);
    return true;
}

void registerNativeWorker(const char* name, RayactNativeWorkerMain main) {
    if (!name || !main) return;
    std::lock_guard<std::mutex> lk(s_nativeWorkerMutex);
    s_nativeWorkers[name] = main;
}

bool hasNativeWorker(const std::string& name) {
    std::lock_guard<std::mutex> lk(s_nativeWorkerMutex);
    return s_nativeWorkers.find(name) != s_nativeWorkers.end();
}

static void runNativeWorkerThread(int workerId,
                                  std::string name,
                                  std::string initialDataJSON,
                                  std::shared_ptr<WorkerEntry> entry) {
    RayactNativeWorkerMain main = nullptr;
    {
        std::lock_guard<std::mutex> lk(s_nativeWorkerMutex);
        auto it = s_nativeWorkers.find(name);
        if (it != s_nativeWorkers.end()) main = it->second;
    }
    if (!main) {
        g_workerOutbox.push({workerId, WorkerMsgType::JSON,
                             "{\"type\":\"error\",\"message\":\"unknown native worker\"}"});
        return;
    }

    RayactNativeWorkerContext ctx{workerId, entry, std::move(initialDataJSON)};
    main(&ctx);
}

void spawnNativeWorker(int workerId,
                       std::string name,
                       std::string initialDataJSON,
                       std::shared_ptr<WorkerEntry> entry) {
    entry->thread = std::thread(runNativeWorkerThread,
                                workerId,
                                std::move(name),
                                std::move(initialDataJSON),
                                entry);
}
