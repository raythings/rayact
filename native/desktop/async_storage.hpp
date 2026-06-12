#pragma once

extern "C" {
#include "quickjs.h"
}

namespace rayact {

void installAsyncStorage(JSContext *ctx, JSValue global);
void shutdownAsyncStorage(JSContext *ctx);

// Register the built-in KV store on the module bus as "kv" (once at boot).
void registerBuiltinKvModule();

} // namespace rayact
