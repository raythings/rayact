#pragma once

#include <string>

extern "C" {
#include "quickjs.h"
}

namespace rayact {

void installDevClientBridge(JSContext* ctx, JSValue global);

#ifdef __ANDROID__
std::string androidDevCall(const char* method, const char* dataJson);
#endif

} // namespace rayact
