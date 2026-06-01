#include "worker_native.hpp"

static void qaEchoWorker(RayactNativeWorkerContext* ctx) {
    const std::string initial = ctx && !ctx->initialDataJSON.empty()
        ? ctx->initialDataJSON
        : "null";
    ctx->postMessage("{\"type\":\"ready\",\"text\":\"ready with initial data\",\"received\":" + initial + "}");

    std::string message;
    while (!ctx->shouldStop() && ctx->waitMessage(message)) {
        ctx->postMessage("{\"type\":\"echo\",\"text\":\"echo from native worker\",\"payload\":" + message + "}");
    }
}

RAYACT_REGISTER_NATIVE_WORKER("qa.echo", qaEchoWorker)
