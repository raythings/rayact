#include "devtools.hpp"

#if !defined(RAYACT_ENABLE_DEVTOOLS) || RAYACT_ENABLE_DEVTOOLS == 0
namespace rayact {
void devtoolsInit(JSContext*) {}
void devtoolsEnableForContext(JSContext*, int, const char*) {}
void devtoolsEnableForContext(JSContext*, const char*, DevtoolsOutboundCallback, void*) {}
void devtoolsInboundForContext(JSContext*, const char*) {}
void devtoolsDetachContext(JSContext*) {}
void devtoolsShutdown() {}
void devtoolsPump(JSContext*) {}
void devtoolsConsole(JSContext*, const char*, const char*) {}
void devtoolsConsoleArgs(JSContext*, const char*, int, JSValueConst*) {}
bool devtoolsActiveForContext(JSContext*) { return false; }
void devtoolsEmitNetwork(JSContext*, const char*, const char*) {}
void devtoolsStoreNetworkBody(JSContext*, const char*, const char*, size_t, bool) {}
bool devtoolsHasPendingWork() { return false; }
}  // namespace rayact
#endif
