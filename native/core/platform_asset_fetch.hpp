#pragma once

#include <cstdint>
#include <vector>

namespace rayact {

#if defined(__ANDROID__)
std::vector<uint8_t> androidFetchBytes(const char* url);
#endif

#if defined(RAYACT_IOS)
std::vector<uint8_t> iosFetchBytes(const char* url);
#endif

} // namespace rayact
