/*
 * rayact module ABI — stable C interface for optional native plugins.
 *
 * A plugin is a shared library (librayact_<name>.{dylib,so,dll}) dropped into the
 * app's module directory by its npm package. At engine boot the plugin loader
 * dlopen's it and calls the C entry point:
 *
 *     int rayact_module_register(const RayactHost* host);
 *
 * The plugin uses host->register_module(...) to publish one or more named modules
 * into the process-wide bus. Every runtime context (main QuickJS, JS workers, WASM
 * workers) can then invoke a module's methods by name. The engine transports raw
 * bytes only; each module defines its own arg/result encoding.
 *
 * All calls are in-process C function calls (no IPC, no Java marshaling between
 * libraries). Keep this header dependency-free and C-compatible.
 */
#ifndef RAYACT_MODULE_ABI_H
#define RAYACT_MODULE_ABI_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define RAYACT_MODULE_ABI_VERSION 1u

typedef struct {
  const uint8_t* ptr;
  size_t len;
} RayactBytes;

/*
 * Invoke a method on a module. Returns 0 on success, negative on error.
 * On success *out points to a buffer owned by the module until release() is
 * called with the same buffer. args.ptr may be NULL when args.len == 0.
 */
typedef int (*RayactInvokeFn)(void* self, const char* method,
                              RayactBytes args, RayactBytes* out);

typedef void (*RayactReleaseFn)(void* self, RayactBytes buf);

typedef struct {
  uint32_t abi_version;     /* set to RAYACT_MODULE_ABI_VERSION */
  void* self;               /* module instance, passed back to invoke/release */
  RayactInvokeFn invoke;
  RayactReleaseFn release;  /* may be NULL if invoke never allocates *out */
} RayactModule;

/*
 * Engine capabilities handed to a plugin at registration time. A plugin may call
 * back into the bus (e.g. to use the built-in "kv" module as its substrate) and
 * reach platform handles it needs.
 */
typedef struct RayactHost {
  uint32_t abi_version;
  const char* (*data_dir)(void);
  int (*register_module)(const char* name, const RayactModule* mod);
  int (*invoke)(const char* name, const char* method, RayactBytes args,
                RayactBytes* out, RayactReleaseFn* out_release, void** out_self);
  void (*random_bytes)(uint8_t* out, size_t n);
  void (*log)(int level, const char* msg);
  void* (*get_java_vm)(void); /* JavaVM* on Android, NULL elsewhere */
} RayactHost;

/* Plugin entry point. Implemented by every plugin. */
typedef int (*RayactModuleRegisterFn)(const RayactHost* host);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* RAYACT_MODULE_ABI_H */
