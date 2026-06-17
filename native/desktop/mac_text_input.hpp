#pragma once

#if defined(__APPLE__)
#include <TargetConditionals.h>
#endif

#if defined(__APPLE__) && TARGET_OS_OSX
void rayactMacTextInputInstall();
void rayactMacTextInputShutdown();
#else
inline void rayactMacTextInputInstall() {}
inline void rayactMacTextInputShutdown() {}
#endif
