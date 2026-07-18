#pragma once

#include <cstdint>
#include <string>
#include <vector>

extern "C" {
#include "quickjs.h"
}

namespace rayact {

void installDevClientBridge(JSContext* ctx, JSValue global);

#ifdef __ANDROID__
std::string androidDevCall(const char* method, const char* dataJson);
std::string androidDevFetch(const char* url);
std::vector<uint8_t> androidDevFetchBytes(const char* url);
#endif

#if defined(RAYACT_IOS)
std::string iosDevCall(const char* method, const char* dataJson);
std::string iosDevFetch(const char* url);
std::vector<uint8_t> iosDevFetchBytes(const char* url);
#endif

#if defined(RAYACT_WEB)
// Synchronous browser XHR (web_stubs.cpp) — the web build has no libcurl.
std::string webDevFetch(const std::string& url);
std::vector<uint8_t> webDevFetchBytes(const std::string& url);
void webDevPrefetchValidate(int revision);
#endif

} // namespace rayact
