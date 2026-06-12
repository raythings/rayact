#pragma once

#include <string>

extern "C" {
#include "quickjs.h"
}
#include "rayact_module_abi.h"

namespace rayact {

// Registry (process singleton, thread-safe).
bool busRegister(const char* name, const RayactModule* mod);
bool busHas(const char* name);

// Synchronous invoke. Returns true on success and fills `out` with a copy of the
// module's result (the module's release() is called internally). On failure
// returns false and, if errcode != nullptr, sets it (<0 module error,
// kBusNoModule, kBusNoRelease are negative sentinels).
bool busInvoke(const std::string& name, const std::string& method,
               const std::string& args, std::string& out, int* errcode = nullptr);

enum { kBusNoModule = -1000 };

// Host struct handed to plugins at load time.
const RayactHost* busHost();

// Set the JavaVM pointer exposed to plugins via host->get_java_vm (Android).
void busSetJavaVM(void* vm);

// Per-context JS bindings: __rayact_invoke / __rayact_invoke_async.
void installModuleBindings(JSContext* ctx, JSValue global);

// Resolve completed async invocations on this context (call each frame, beside
// drainNetEvents).
void drainModuleEvents(JSContext* ctx);

// Free per-context async state on context teardown.
void shutdownModuleBus(JSContext* ctx);

// Raw byte invoke for WASM host imports. Returns result length (>=0) or negative
// on error; copies up to outCap bytes into out. If the result is larger than
// outCap, returns the required length (caller retries with a bigger buffer) and
// writes nothing.
int busInvokeRaw(const char* name, size_t nameLen, const char* method,
                 size_t methodLen, const uint8_t* args, size_t argsLen,
                 uint8_t* out, size_t outCap);

} // namespace rayact
