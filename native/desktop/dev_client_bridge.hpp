#pragma once

#include <string>

extern "C" {
#include "quickjs.h"
}

namespace rayact {

void installDevClientBridge(JSContext* ctx, JSValue global);

#ifdef __ANDROID__
std::string androidDevCall(const char* method, const char* dataJson);
std::string androidDevFetch(const char* url);
#endif

#if defined(RAYACT_IOS)
std::string iosDevCall(const char* method, const char* dataJson);
std::string iosDevFetch(const char* url);
#endif

} // namespace rayact
