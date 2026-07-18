#include "rayact_module_abi.h"

#include <cerrno>
#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <string>
#include <unistd.h>

namespace {
struct CrashMarker {
  uint32_t magic;
  uint16_t version;
  uint16_t signalNumber;
  uint64_t reserved;
};
static_assert(sizeof(CrashMarker) == 16, "Crash marker must remain fixed-size");

int markerFd = -1;

void signalHandler(int signalNumber) {
  if (markerFd >= 0) {
    const CrashMarker marker{0x52415943u, 1u, static_cast<uint16_t>(signalNumber), 0u};
    (void)write(markerFd, &marker, sizeof(marker));
  }
  _exit(128 + signalNumber);
}

void installSignalHandlers() {
  const int signals[] = {SIGABRT, SIGBUS, SIGFPE, SIGILL, SIGSEGV};
  struct sigaction action{};
  sigemptyset(&action.sa_mask);
  action.sa_handler = signalHandler;
  action.sa_flags = SA_RESETHAND;
  for (int signalNumber : signals) sigaction(signalNumber, &action, nullptr);
}

int invoke(void*, const char* method, RayactBytes, RayactBytes* out) {
  if (!method || std::strcmp(method, "consumeMarker") != 0 || markerFd < 0) return -3;
  CrashMarker marker{};
  (void)lseek(markerFd, 0, SEEK_SET);
  const ssize_t count = read(markerFd, &marker, sizeof(marker));
  (void)ftruncate(markerFd, 0);
  if (count != static_cast<ssize_t>(sizeof(marker)) || marker.magic != 0x52415943u) {
    out->ptr = nullptr;
    out->len = 0;
    return 0;
  }
  auto* bytes = static_cast<uint8_t*>(std::malloc(sizeof(marker)));
  if (!bytes) return -4;
  std::memcpy(bytes, &marker, sizeof(marker));
  out->ptr = bytes;
  out->len = sizeof(marker);
  return 0;
}

void release(void*, RayactBytes bytes) { std::free(const_cast<uint8_t*>(bytes.ptr)); }
} // namespace

extern "C" int rayact_crash_reporter_register(const RayactHost* host) {
  if (!host || host->abi_version != RAYACT_MODULE_ABI_VERSION) return -1;
  const char* dataDir = host->data_dir ? host->data_dir() : nullptr;
  const std::string path = std::string(dataDir ? dataDir : ".") + "/rayact-crash-marker.bin";
  markerFd = open(path.c_str(), O_CREAT | O_RDWR | O_APPEND | O_CLOEXEC, 0600);
  if (markerFd >= 0) installSignalHandlers();
  RayactModule module{};
  module.abi_version = RAYACT_MODULE_ABI_VERSION;
  module.invoke = invoke;
  module.release = release;
  return host->register_module("crash-reporter", &module);
}

#if !defined(RAYACT_IOS) && !defined(RAYACT_WEB)
extern "C" int rayact_module_register(const RayactHost* host) {
  return rayact_crash_reporter_register(host);
}
#endif
