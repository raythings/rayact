#include "platform.hpp"
#include <cstring>
#include <iostream>
#if defined(_WIN32)
  #define WIN32_LEAN_AND_MEAN
  #define NOMINMAX
  #include <windows.h>
#else
  #include <sys/utsname.h>
#endif

#if defined(__EMSCRIPTEN__)
bool PlatformBridge::isDesktop() { return false; }
#else
bool PlatformBridge::isDesktop() { return true; }
#endif
bool PlatformBridge::isAndroid() { return false; }
bool PlatformBridge::isIOS()     { return false; }
#if defined(__EMSCRIPTEN__)
bool PlatformBridge::isWeb()     { return true; }
#else
bool PlatformBridge::isWeb()     { return false; }
#endif

const char* PlatformBridge::getPlatformName() {
    // This string is the authoritative Platform.OS: detectPlatform() in
    // @rayact/shared reads globalThis.__rayactPlatform.os first and only falls
    // back to the user agent. Emscripten defines none of the host macros
    // below, so without an explicit branch the web build returned "unknown"
    // and a web app running on a Mac reported Platform.MACOS.
#if defined(__EMSCRIPTEN__)
    return "web";
#elif defined(_WIN32)
    return "windows";
#elif defined(__APPLE__)
    return "macos";
#elif defined(__linux__)
    return "linux";
#else
    return "unknown";
#endif
}

std::string PlatformBridge::getPlatformVersion() {
#if defined(_WIN32)
    // GetVersionEx is deprecated and lies without a compatibility manifest;
    // read the real build from the kernel's own version resource instead.
    if (HMODULE ntdll = GetModuleHandleW(L"ntdll.dll")) {
        using RtlGetVersionFn = LONG(WINAPI*)(PRTL_OSVERSIONINFOW);
        if (auto rtlGetVersion = (RtlGetVersionFn)GetProcAddress(ntdll, "RtlGetVersion")) {
            RTL_OSVERSIONINFOW info{};
            info.dwOSVersionInfoSize = sizeof(info);
            if (rtlGetVersion(&info) == 0) {
                return std::to_string(info.dwMajorVersion) + "." +
                       std::to_string(info.dwMinorVersion) + "." +
                       std::to_string(info.dwBuildNumber);
            }
        }
    }
    return "unknown";
#else
    struct utsname info;
    if (uname(&info) == 0) return info.release;
    return "unknown";
#endif
}

void PlatformBridge::printPlatformInfo() {
    std::cout << "Platform: " << getPlatformName()
              << " " << getPlatformVersion() << std::endl;
}
