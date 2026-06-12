#include "plugin_loader.hpp"

#include "data_dir.hpp"
#include "module_bus.hpp"
#include "rayact_module_abi.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <set>
#include <string>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#else
#include <dirent.h>
#include <dlfcn.h>
#endif

namespace rayact {

namespace {

#ifdef __APPLE__
const char* kPluginExt = ".dylib";
#elif defined(_WIN32)
const char* kPluginExt = ".dll";
#else
const char* kPluginExt = ".so";
#endif

bool isPluginName(const std::string& f) {
  // Accept both librayact_<name>.<ext> (desktop/Android) and rayact_<name>.dll.
  bool prefix = f.rfind("librayact_", 0) == 0 || f.rfind("rayact_", 0) == 0;
  size_t extLen = strlen(kPluginExt);
  bool ext = f.size() > extLen && f.compare(f.size() - extLen, extLen, kPluginExt) == 0;
  return prefix && ext;
}

void registerFromLib(const std::string& path) {
#ifdef _WIN32
  HMODULE h = LoadLibraryA(path.c_str());
  if (!h) return;
  auto fn = (RayactModuleRegisterFn)GetProcAddress(h, "rayact_module_register");
#else
  void* h = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
  if (!h) {
    fprintf(stderr, "[plugin] dlopen failed: %s\n", dlerror());
    return;
  }
  auto fn = (RayactModuleRegisterFn)dlsym(h, "rayact_module_register");
#endif
  if (!fn) {
    fprintf(stderr, "[plugin] %s: no rayact_module_register symbol\n", path.c_str());
    return;
  }
  int rc = fn(busHost());
  if (rc != 0)
    fprintf(stderr, "[plugin] %s: register returned %d\n", path.c_str(), rc);
  else
    fprintf(stderr, "[plugin] loaded %s\n", path.c_str());
  // Intentionally keep the handle open for process lifetime.
}

void scanDir(const std::string& dir, std::set<std::string>& seen) {
  if (dir.empty()) return;
#ifdef _WIN32
  std::string glob = dir + "\\*";
  WIN32_FIND_DATAA fd;
  HANDLE hf = FindFirstFileA(glob.c_str(), &fd);
  if (hf == INVALID_HANDLE_VALUE) return;
  do {
    std::string f = fd.cFileName;
    if (isPluginName(f) && seen.insert(f).second)
      registerFromLib(dir + "\\" + f);
  } while (FindNextFileA(hf, &fd));
  FindClose(hf);
#else
  DIR* d = opendir(dir.c_str());
  if (!d) return;
  struct dirent* e;
  while ((e = readdir(d)) != nullptr) {
    std::string f = e->d_name;
    if (isPluginName(f) && seen.insert(f).second)
      registerFromLib(dir + "/" + f);
  }
  closedir(d);
#endif
}

bool g_loaded = false;

} // namespace

void loadPlugins(const std::string& extraDir) {
  if (g_loaded) return;
  g_loaded = true;

  std::set<std::string> seen; // by filename, so a plugin in two dirs loads once
  scanDir(extraDir, seen);
  scanDir(rayactDataDir() + "/modules", seen);
  if (const char* mp = std::getenv("RAYACT_MODULE_PATH")) {
    std::string s(mp);
    size_t start = 0;
    while (start <= s.size()) {
      size_t sep = s.find(
#ifdef _WIN32
          ';',
#else
          ':',
#endif
          start);
      std::string part = s.substr(start, sep == std::string::npos ? std::string::npos
                                                                  : sep - start);
      if (!part.empty()) scanDir(part, seen);
      if (sep == std::string::npos) break;
      start = sep + 1;
    }
  }
}

} // namespace rayact
