#pragma once

extern "C" {
#include "quickjs.h"
}

namespace rayact {

void installAsyncStorage(JSContext *ctx, JSValue global);
void shutdownAsyncStorage(JSContext *ctx);

} // namespace rayact
