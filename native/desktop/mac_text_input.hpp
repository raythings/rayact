#pragma once

#if defined(__APPLE__)
void rayactMacTextInputInstall();
void rayactMacTextInputShutdown();
#else
inline void rayactMacTextInputInstall() {}
inline void rayactMacTextInputShutdown() {}
#endif
