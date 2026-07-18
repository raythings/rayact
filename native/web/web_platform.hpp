#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace rayact {

// Fetch bytes for an app-requested remote asset. Unlike the development loader,
// this has no manifest, revision, or HMR cache behavior.
std::vector<uint8_t> webFetchBytes(const std::string& url);

} // namespace rayact
