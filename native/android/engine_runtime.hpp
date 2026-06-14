#pragma once

#include <memory>
#include <string>
#include <vector>

extern "C" {
#include "quickjs.h"
}

#include "../desktop/engine_internal.hpp"

struct Raym3RuntimeStorage;

namespace rayact {

struct EngineRuntimeJsStorage {
    bool running = false;
    std::vector<Shape> shapes;
    std::string devServerUrl;
    int devRevision = 0;
    JSValue frameUpdateFunction = JS_UNDEFINED;
    JSValue renderFrameFunction = JS_UNDEFINED;
    QueuedTouch queuedTouch;
    bool touchPressFired = false;
};

class EngineRuntime {
public:
    EngineRuntime() = default;
    ~EngineRuntime();

    EngineRuntime(const EngineRuntime&) = delete;
    EngineRuntime& operator=(const EngineRuntime&) = delete;

    bool create(const std::string& dataPath);
    void destroy();

    void activate();
    void deactivate();

    bool isCreated() const { return created_; }
    const std::string& dataPath() const { return dataPath_; }

    JSRuntime* rt() const { return rt_; }
    JSContext* ctx() const { return ctx_; }
    void setRtCtx(JSRuntime* rt, JSContext* ctx) {
        rt_ = rt;
        ctx_ = ctx;
    }

    EngineRuntimeJsStorage* jsStorage() { return jsStorage_.get(); }
    const EngineRuntimeJsStorage* jsStorage() const { return jsStorage_.get(); }

private:
    bool created_ = false;
    std::string dataPath_;
    JSRuntime* rt_ = nullptr;
    JSContext* ctx_ = nullptr;
    Raym3RuntimeStorage* raym3Storage_ = nullptr;
    std::unique_ptr<EngineRuntimeJsStorage> jsStorage_;
};

EngineRuntime* engineRuntimeActive();
void engineRuntimeSetActive(EngineRuntime* runtime);

} // namespace rayact
