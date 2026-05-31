#include "platform.hpp"
#include <cstring>
#include <iostream>
#include <sys/utsname.h>

bool PlatformBridge::isDesktop() { return true; }
bool PlatformBridge::isAndroid() { return false; }
bool PlatformBridge::isIOS()     { return false; }
bool PlatformBridge::isWeb()     { return false; }

const char* PlatformBridge::getPlatformName() {
#if defined(_WIN32)
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
    struct utsname info;
    if (uname(&info) == 0) return info.release;
    return "unknown";
}

void PlatformBridge::printPlatformInfo() {
    std::cout << "Platform: " << getPlatformName()
              << " " << getPlatformVersion() << std::endl;
}
