#pragma once

extern "C" {
#include "quickjs.h"
}

namespace rayact {

void devtoolsInit(JSContext *ctx);
void devtoolsShutdown();
void devtoolsPump(JSContext *ctx);
void devtoolsConsole(JSContext *ctx, const char *level, const char *message);

} // namespace rayact
