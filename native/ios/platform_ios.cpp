#include "../desktop/platform.hpp"
#include <string>

bool PlatformBridge::isDesktop() { return false; }
bool PlatformBridge::isAndroid() { return false; }
bool PlatformBridge::isIOS()     { return true; }
bool PlatformBridge::isWeb()     { return false; }

const char* PlatformBridge::getPlatformName() { return "ios"; }

std::string PlatformBridge::getPlatformVersion() {
    return std::string("unknown");
}

void PlatformBridge::printPlatformInfo() {}
