#pragma once

extern "C" {
#include "quickjs.h"
}

namespace rayact {

class CDPHandler {
public:
    struct Impl;
    explicit CDPHandler(int port = 9229);
    ~CDPHandler();

    bool start(JSContext* ctx);
    void stop();
    void pump(JSContext* ctx);
    bool isRunning() const;

    void onConsoleMessage(const char* level, const char* message);
    void registerScript(const char* url, const char* source, int scriptId);

    static CDPHandler* instance();

private:
    Impl* impl_;
};

} // namespace rayact
