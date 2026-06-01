#pragma once

#include "workers.hpp"

#include <memory>
#include <string>

struct RayactNativeWorkerContext {
    int workerId;
    std::shared_ptr<WorkerEntry> entry;
    std::string initialDataJSON;

    bool shouldStop() const;
    void postMessage(std::string json) const;
    bool waitMessage(std::string& json) const;
};

using RayactNativeWorkerMain = void (*)(RayactNativeWorkerContext*);

void registerNativeWorker(const char* name, RayactNativeWorkerMain main);
bool hasNativeWorker(const std::string& name);
void spawnNativeWorker(int workerId,
                       std::string name,
                       std::string initialDataJSON,
                       std::shared_ptr<WorkerEntry> entry);

#define RAYACT_REGISTER_NATIVE_WORKER(name, fn)                                \
    namespace {                                                                \
    struct RayactNativeWorkerRegistrar_##fn {                                  \
        RayactNativeWorkerRegistrar_##fn() { registerNativeWorker(name, fn); } \
    };                                                                         \
    static RayactNativeWorkerRegistrar_##fn rayactNativeWorkerRegistrar_##fn;   \
    }
