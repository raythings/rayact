#include "../desktop/devtools.hpp"

namespace rayact {

void devtoolsInit(JSContext *ctx) {
    (void)ctx;
}

void devtoolsShutdown() {
}

void devtoolsPump(JSContext *ctx) {
    (void)ctx;
}

void devtoolsConsole(JSContext *ctx, const char *level, const char *message) {
    (void)ctx;
    (void)level;
    (void)message;
}

} // namespace rayact
