#pragma once

#include <string>

namespace rayact {

// Warm manifest-referenced startup files on a utility thread. Cached files are
// only exposed after the loader validates the server's current revision.
void desktopPrefetchDevServer(const std::string& baseUrl);
void desktopPrefetchValidate(const std::string& baseUrl, int revision);
bool desktopTakePrefetchedResource(const std::string& url, std::string& body);

} // namespace rayact
