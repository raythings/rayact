#include "platform_wayland.hpp"

#include <cstdlib>

namespace rayact::platform {

bool useWayland() {
  const char *session = std::getenv("XDG_SESSION_TYPE");
  return session && session[0] == 'w' && session[1] == 'a';
}

bool initWayland() {
  return useWayland();
}

void shutdownWayland() {}

} // namespace rayact::platform
