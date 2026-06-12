#include "data_dir.hpp"

#include <cstdlib>
#include <sys/stat.h>
#include <sys/types.h>

#ifdef _WIN32
#include <direct.h>
#define MKDIR(p) _mkdir(p)
#else
#include <unistd.h>
#define MKDIR(p) mkdir((p), 0700)
#endif

namespace rayact {

static void ensureDir(const std::string& path) {
  // Create each path component in turn; ignore EEXIST.
  for (size_t i = 1; i <= path.size(); ++i) {
    if (i == path.size() || path[i] == '/'
#ifdef _WIN32
        || path[i] == '\\'
#endif
    ) {
      std::string sub = path.substr(0, i);
      if (!sub.empty()) MKDIR(sub.c_str());
    }
  }
}

std::string rayactDataDir() {
  std::string base;

  if (const char* override = std::getenv("RAYACT_DATA_DIR"); override && *override) {
    base = override;
  }
#ifdef _WIN32
  else if (const char* appdata = std::getenv("APPDATA"); appdata && *appdata) {
    base = std::string(appdata) + "\\rayact";
  } else {
    base = ".rayact";
  }
#elif defined(__APPLE__)
  else if (const char* home = std::getenv("HOME"); home && *home) {
    base = std::string(home) + "/Library/Application Support/rayact";
  } else {
    base = ".rayact";
  }
#else
  else if (const char* xdg = std::getenv("XDG_DATA_HOME"); xdg && *xdg) {
    base = std::string(xdg) + "/rayact";
  } else if (const char* home = std::getenv("HOME"); home && *home) {
    base = std::string(home) + "/.local/share/rayact";
  } else {
    base = ".rayact";
  }
#endif

  ensureDir(base);
  return base;
}

} // namespace rayact
