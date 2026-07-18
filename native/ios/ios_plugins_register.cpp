#include "../core/rayact_module_abi.h"

extern "C" int rayact_mmkv_register(const RayactHost* host) __attribute__((weak));
extern "C" int rayact_secure_store_register(const RayactHost* host) __attribute__((weak));
extern "C" int rayact_crash_reporter_register(const RayactHost* host) __attribute__((weak));

extern "C" int rayact_module_register(const RayactHost* host) {
    if (rayact_mmkv_register) {
        const int rc = rayact_mmkv_register(host);
        if (rc != 0) return rc;
    }
    if (rayact_secure_store_register) {
        const int rc = rayact_secure_store_register(host);
        if (rc != 0) return rc;
    }
    return rayact_crash_reporter_register ? rayact_crash_reporter_register(host) : 0;
}
