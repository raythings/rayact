// Android implementation of PlatformBridge (replaces native/desktop/platform.cpp
// in the Android build). Drives JS Platform.OS === 'android'.
#include "../desktop/platform.hpp"
#include <android/api-level.h>
#include <string>

bool PlatformBridge::isDesktop() { return false; }
bool PlatformBridge::isAndroid() { return true; }
bool PlatformBridge::isIOS()     { return false; }
bool PlatformBridge::isWeb()     { return false; }

const char* PlatformBridge::getPlatformName() { return "android"; }

std::string PlatformBridge::getPlatformVersion() {
    int api = android_get_device_api_level();
    return api > 0 ? std::to_string(api) : std::string("unknown");
}

void PlatformBridge::printPlatformInfo() {
    // Logged via raylib's __android_log on this platform; no stdout.
}
