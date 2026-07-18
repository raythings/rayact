#include "../desktop/devtools.hpp"

#if !RAYACT_ENABLE_DEVTOOLS
namespace rayact {

void devtoolsInit(JSContext *ctx) {
    (void)ctx;
}

void devtoolsEnableForContext(JSContext*, int, const char*) {}
void devtoolsEnableForContext(JSContext*, const char*, DevtoolsOutboundCallback, void*) {}
void devtoolsInboundForContext(JSContext*, const char*) {}
void devtoolsDetachContext(JSContext*) {}

void devtoolsShutdown() {
}

void devtoolsPump(JSContext *ctx) {
    (void)ctx;
}

bool devtoolsHasPendingWork() {
    return false;
}

void devtoolsConsole(JSContext *ctx, const char *level, const char *message) {
    (void)ctx;
    (void)level;
    (void)message;
}

void devtoolsConsoleArgs(JSContext *ctx, const char *level, int argc, JSValueConst *argv) {
    (void)ctx;
    (void)level;
    (void)argc;
    (void)argv;
}

bool devtoolsActiveForContext(JSContext*) {
    return false;
}

void devtoolsEmitNetwork(JSContext*, const char*, const char*) {}
void devtoolsStoreNetworkBody(JSContext*, const char*, const char*, size_t, bool) {}

} // namespace rayact
#endif
