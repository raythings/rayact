#include "plugin_loader.hpp"

#include "data_dir.hpp"
#include "module_bus.hpp"
#include "rayact_module_abi.h"

#include <cstdarg>
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

#ifdef __ANDROID__
#include <android/log.h>
#endif

namespace rayact {

namespace {

// Plugin diagnostics have to go through the platform logger on Android: stderr
// is not wired to logcat there, so every message below — which plugin loaded,
// which one refused to register and why — was silently discarded on the one
// platform where you cannot just watch a terminal. Everywhere else stderr is
// exactly right.
void pluginLog(const char* fmt, ...) {
  va_list args;
  va_start(args, fmt);
#ifdef __ANDROID__
  __android_log_vprint(ANDROID_LOG_INFO, "RayactPlugin", fmt, args);
#else
  vfprintf(stderr, fmt, args);
#endif
  va_end(args);
}

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
  // A module may ship private runtime DLLs beside the plugin (CEF is the first
  // such module). The default LoadLibrary search starts at the host executable,
  // not at an absolute plugin path's directory, so delay-loading libcef.dll
  // would raise STATUS_DLL_NOT_FOUND even though it is adjacent to the plugin.
  HMODULE h = LoadLibraryExA(
      path.c_str(), nullptr,
      LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
  if (!h) {
    pluginLog("[plugin] LoadLibrary failed for %s (error %lu)\n",
              path.c_str(), (unsigned long)GetLastError());
    return;
  }
  auto fn = (RayactModuleRegisterFn)GetProcAddress(h, "rayact_module_register");
#else
  void* h = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
  if (!h) {
    pluginLog("[plugin] dlopen failed: %s\n", dlerror());
    return;
  }
  auto fn = (RayactModuleRegisterFn)dlsym(h, "rayact_module_register");
#endif
  if (!fn) {
    pluginLog("[plugin] %s: no rayact_module_register symbol\n", path.c_str());
    return;
  }
  int rc = fn(busHost());
  if (rc != 0) {
    // Overwhelmingly this is a plugin built against an older engine: it compares the
    // host's ABI version and refuses anything it does not recognise. Say so, because
    // the symptom otherwise is a module that is simply missing at runtime.
    pluginLog(
        "[plugin] %s: rayact_module_register returned %d - the plugin rejected "
        "this host (ABI %u). It was most likely built for a different engine "
        "version; reinstall the module or delete the stale copy.\n",
        path.c_str(), rc, (unsigned)RAYACT_MODULE_ABI_VERSION);
  } else {
    pluginLog("[plugin] loaded %s\n", path.c_str());
  }
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

  // Highest precedence first: `seen` is keyed by filename, so whichever directory
  // is scanned first wins for a given plugin.
  //
  // RAYACT_MODULE_PATH must beat the user data directory. It is how a project
  // points the host at its own staged modules (rayact-assets/modules), and the
  // data directory accumulates whatever any previous app installed — so with the
  // old order a months-stale librayact_mmkv.dylib sitting in ~/Library silently
  // shadowed the copy the project just built, and the only symptom was the
  // plugin refusing to register against a host it was never built for.
  std::set<std::string> seen; // by filename, so a plugin in two dirs loads once
  scanDir(extraDir, seen);
  bool hasExplicitModulePath = false;
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
      if (!part.empty()) {
        hasExplicitModulePath = true;
        scanDir(part, seen);
      }
      if (sep == std::string::npos) break;
      start = sep + 1;
    }
  }
  // An explicit project/package module path is authoritative. Mixing in the
  // per-user cache can load a differently named stale predecessor (for example
  // securestore vs secure_store) even though filename precedence protected the
  // current modules, producing noisy ABI failures and potentially duplicate
  // registrations.
  if (!hasExplicitModulePath) scanDir(rayactDataDir() + "/modules", seen);
}

} // namespace rayact
