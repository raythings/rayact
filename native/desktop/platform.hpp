#pragma once

#include <string>

/**
 * Platform detection and management bridge
 */
class PlatformBridge {
public:
    static bool isDesktop();
    static bool isAndroid();
    static bool isIOS();
    static bool isWeb();
    static const char* getPlatformName();
    static std::string getPlatformVersion();
    static void printPlatformInfo();
};