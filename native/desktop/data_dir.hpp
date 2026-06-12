#pragma once

#include <string>

namespace rayact {

// Per-user writable data directory, created if missing.
// Override with RAYACT_DATA_DIR. Otherwise the OS app-data location:
//   macOS   ~/Library/Application Support/rayact
//   Linux   $XDG_DATA_HOME/rayact (fallback ~/.local/share/rayact)
//   Windows %APPDATA%/rayact
// On Android the engine passes g_dataPath explicitly and does not call this.
std::string rayactDataDir();

} // namespace rayact
