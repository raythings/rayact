/* Backend interface shared by the secure-store dispatcher and the platform
 * implementations. Keep dependency-free. */
#ifndef RAYACT_SECURE_STORE_HPP
#define RAYACT_SECURE_STORE_HPP

#include "rayact_module_abi.h"
#include <string>

namespace rayact_secure_store {

// Set the backend's data dir (used by file-backed fallbacks). No-op on Keychain.
void backendInit(const RayactHost* host);

// Returns true on success.
bool backendSet(const std::string& key, const std::string& value);
// Returns 0 and fills out on hit, -1 when absent.
int backendGet(const std::string& key, std::string& out);
// Returns true on success (including when the key was absent).
bool backendDelete(const std::string& key);

} // namespace rayact_secure_store

#endif
