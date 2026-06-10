#include "devtools.hpp"

#include <atomic>
#include <cstdio>

namespace rayact {

static std::atomic<bool> g_devtoolsEnabled{false};

void devtoolsInit(JSContext *ctx) {
  (void)ctx;
  const char *env = std::getenv("RAYACT_DEVTOOLS");
  g_devtoolsEnabled.store(env && env[0] && env[0] != '0');
  if (g_devtoolsEnabled.load())
    fprintf(stderr, "[devtools] CDP-lite stub listening (RAYACT_DEVTOOLS=1)\n");
}

void devtoolsShutdown() {
  g_devtoolsEnabled.store(false);
}

void devtoolsPump(JSContext *ctx) {
  (void)ctx;
  if (!g_devtoolsEnabled.load()) return;
}

} // namespace rayact
