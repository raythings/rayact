#pragma once

#include <string>

namespace rayact {

// dlopen every librayact_* plugin found in the search dirs and call its
// rayact_module_register(host) entry point. Idempotent per process.
//   - extraDir: an explicit directory to scan (e.g. Android nativeLibraryDir);
//     may be empty.
//   - the data-dir "modules/" subfolder and RAYACT_MODULE_PATH are also scanned
//     on desktop.
void loadPlugins(const std::string& extraDir);

} // namespace rayact
