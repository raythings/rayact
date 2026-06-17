#include "../core/rayact_module_abi.h"

extern "C" int rayact_mmkv_register(const RayactHost* host);
extern "C" int rayact_secure_store_register(const RayactHost* host);

extern "C" int rayact_module_register(const RayactHost* host) {
    int rc = rayact_mmkv_register(host);
    if (rc != 0) return rc;
    return rayact_secure_store_register(host);
}
