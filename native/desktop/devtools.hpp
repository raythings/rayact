#pragma once

extern "C" {
#include "quickjs.h"
}

namespace rayact {

void devtoolsInit(JSContext *ctx);
void devtoolsShutdown();
void devtoolsPump(JSContext *ctx);

} // namespace rayact
