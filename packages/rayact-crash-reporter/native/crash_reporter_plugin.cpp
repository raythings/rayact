#include "rayact_module_abi.h"

#include <cerrno>
#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#ifdef _WIN32
  #define WIN32_LEAN_AND_MEAN
  #define NOMINMAX
  #include <windows.h>
#else
  #include <fcntl.h>
  #include <unistd.h>
#endif

namespace {
struct CrashMarker {
  uint32_t magic;
  uint16_t version;
  uint16_t signalNumber;
  uint64_t reserved;
};
static_assert(sizeof(CrashMarker) == 16, "Crash marker must remain fixed-size");

#ifdef _WIN32
// Windows has no sigaction and no SIGBUS/SIGSEGV delivery for faults — hardware
// faults arrive as structured exceptions instead. The marker keeps its
// signal-number field so the JS side stays platform-agnostic; SEH exception
// codes are mapped onto the equivalent POSIX numbers.
HANDLE markerHandle = INVALID_HANDLE_VALUE;
bool markerOpen() { return markerHandle != INVALID_HANDLE_VALUE; }

void writeMarker(uint16_t signalNumber) {
  if (!markerOpen()) return;
  const CrashMarker marker{0x52415943u, 1u, signalNumber, 0u};
  SetFilePointer(markerHandle, 0, nullptr, FILE_END);
  DWORD written = 0;
  WriteFile(markerHandle, &marker, sizeof(marker), &written, nullptr);
  FlushFileBuffers(markerHandle);
}

uint16_t signalForExceptionCode(DWORD code) {
  switch (code) {
    case EXCEPTION_ACCESS_VIOLATION:
    case EXCEPTION_STACK_OVERFLOW:
    case EXCEPTION_IN_PAGE_ERROR:        return 11;  // SIGSEGV
    case EXCEPTION_ILLEGAL_INSTRUCTION:
    case EXCEPTION_PRIV_INSTRUCTION:     return 4;   // SIGILL
    case EXCEPTION_INT_DIVIDE_BY_ZERO:
    case EXCEPTION_INT_OVERFLOW:
    case EXCEPTION_FLT_DIVIDE_BY_ZERO:
    case EXCEPTION_FLT_OVERFLOW:
    case EXCEPTION_FLT_INVALID_OPERATION: return 8;  // SIGFPE
    case EXCEPTION_DATATYPE_MISALIGNMENT: return 10; // SIGBUS
    default:                              return 6;  // SIGABRT
  }
}

LONG WINAPI exceptionFilter(EXCEPTION_POINTERS* info) {
  writeMarker(info && info->ExceptionRecord
                  ? signalForExceptionCode(info->ExceptionRecord->ExceptionCode)
                  : 6);
  return EXCEPTION_EXECUTE_HANDLER;  // terminate; do not hand back to the debugger loop
}

void abortHandler(int signalNumber) {
  writeMarker(static_cast<uint16_t>(signalNumber));
  _exit(128 + signalNumber);
}

void installSignalHandlers() {
  SetUnhandledExceptionFilter(exceptionFilter);
  // abort() does not raise a structured exception, so it still needs a handler.
  std::signal(SIGABRT, abortHandler);
}
#else
int markerFd = -1;
bool markerOpen() { return markerFd >= 0; }

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
#endif

int invoke(void*, const char* method, RayactBytes, RayactBytes* out) {
  if (!method || std::strcmp(method, "consumeMarker") != 0 || !markerOpen()) return -3;
  CrashMarker marker{};
#ifdef _WIN32
  SetFilePointer(markerHandle, 0, nullptr, FILE_BEGIN);
  DWORD read_bytes = 0;
  ReadFile(markerHandle, &marker, sizeof(marker), &read_bytes, nullptr);
  const size_t count = read_bytes;
  SetFilePointer(markerHandle, 0, nullptr, FILE_BEGIN);
  SetEndOfFile(markerHandle);
#else
  (void)lseek(markerFd, 0, SEEK_SET);
  const ssize_t count = read(markerFd, &marker, sizeof(marker));
  (void)ftruncate(markerFd, 0);
#endif
  if (count != static_cast<decltype(count)>(sizeof(marker)) || marker.magic != 0x52415943u) {
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
  // Lowest ABI whose fields this module uses. Never compare for equality: a newer
  // host stays compatible, and this check is baked into shipped binaries.
  if (!host || host->abi_version < 1u) return -1;
  const char* dataDir = host->data_dir ? host->data_dir() : nullptr;
  const std::string path = std::string(dataDir ? dataDir : ".") + "/rayact-crash-marker.bin";
#ifdef _WIN32
  // Not inheritable (the O_CLOEXEC equivalent): the default NULL security
  // attributes leave bInheritHandle FALSE.
  markerHandle = CreateFileA(path.c_str(), GENERIC_READ | GENERIC_WRITE,
                             FILE_SHARE_READ, nullptr, OPEN_ALWAYS,
                             FILE_ATTRIBUTE_NORMAL, nullptr);
#else
  markerFd = open(path.c_str(), O_CREAT | O_RDWR | O_APPEND | O_CLOEXEC, 0600);
#endif
  if (markerOpen()) installSignalHandlers();
  RayactModule module{};
  module.abi_version = RAYACT_MODULE_ABI_VERSION;
  module.invoke = invoke;
  module.release = release;
  return host->register_module("crash-reporter", &module);
}

#if !defined(RAYACT_IOS) && !defined(RAYACT_WEB)
extern "C" RAYACT_MODULE_EXPORT int rayact_module_register(const RayactHost* host) {
  return rayact_crash_reporter_register(host);
}
#endif
