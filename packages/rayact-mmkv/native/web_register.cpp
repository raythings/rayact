// @rayact/mmkv — web registration.
//
// Same "mmkv" bus module every other platform registers (native/mmkv_plugin.cpp),
// same wire protocol (see that file's header comment), so packages/rayact-mmkv/src/
// index.ts needs zero changes to work here. Only the storage backend differs: no
// filesystem, so this backs onto the browser's localStorage via the generic
// rayactWebLocalStorage* bridge (native/web/web_local_storage.cpp) instead of
// mmkv_plugin.cpp's fopen'd <id>.kv file.
//
// This file is pure C++ — no EM_JS. EM_JS's JS body is extracted at link time by
// the step that emits a MAIN_MODULE's own glue file; a `-sSIDE_MODULE=1` build
// (what this compiles to) has no such step, so EM_JS declared here would produce
// an import nobody ever satisfies. rayactWebLocalStorage* lives in the HOST
// instead, where that mechanism does work, and this module reaches it as an
// ordinary resolved import — see that file's header for the full explanation.
//
// One localStorage entry per (instance id, key) pair, named
// "rayact_mmkv:<id>:<key>" — so a raw devtools dump shows key NAMES in the clear
// while the value under each is obfuscated. That obfuscation lives in the bridge,
// not here, so the built-in KV gets exactly the same treatment from the same
// code; see native/web/web_local_storage.cpp for what it does and does not
// protect against.

#include "rayact_module_abi.h"

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>

extern "C" {
int rayactWebLocalStorageGet(const char* key, uint8_t** outPtr);
void rayactWebLocalStorageSet(const char* key, const uint8_t* value, int valueLen);
void rayactWebLocalStorageRemove(const char* key);
int rayactWebLocalStorageKeysWithPrefix(const char* prefix, uint8_t** outPtr);
}

namespace {

uint32_t readU32LE(const uint8_t* p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) |
           ((uint32_t)p[3] << 24);
}

void appendU32LE(std::string& s, uint32_t v) {
    char b[4] = {(char)(v & 0xff), (char)((v >> 8) & 0xff), (char)((v >> 16) & 0xff),
                 (char)((v >> 24) & 0xff)};
    s.append(b, 4);
}

// Parses the idLen|id header every method carries, returning a pointer past it.
bool parseId(RayactBytes args, std::string& id, size_t& off) {
    if (args.len < 4) return false;
    uint32_t il = readU32LE(args.ptr);
    if (4 + il > args.len) return false;
    id.assign((const char*)args.ptr + 4, il);
    off = 4 + il;
    return true;
}

RayactBytes dup(const void* data, size_t len) {
    uint8_t* buf = (uint8_t*)malloc(len ? len : 1);
    if (len) memcpy(buf, data, len);
    return RayactBytes{buf, len};
}

std::string storageKey(const std::string& id, const std::string& key) {
    return "rayact_mmkv:" + id + ":" + key;
}

int mmkvInvoke(void*, const char* method, RayactBytes args, RayactBytes* out) {
    const char* m = method ? method : "";
    std::string id;
    size_t off = 0;
    if (!parseId(args, id, off)) return -2;

    if (strcmp(m, "set") == 0) {
        if (off + 4 > args.len) return -2;
        uint32_t kl = readU32LE(args.ptr + off);
        off += 4;
        if (off + kl > args.len) return -2;
        std::string key((const char*)args.ptr + off, kl);
        off += kl;
        const uint8_t* valPtr = args.ptr + off;
        size_t valLen = args.len - off;
        rayactWebLocalStorageSet(storageKey(id, key).c_str(), valPtr, (int)valLen);
        return 0;
    }
    if (strcmp(m, "get") == 0) {
        std::string key((const char*)args.ptr + off, args.len - off);
        uint8_t* stored = nullptr;
        int len = rayactWebLocalStorageGet(storageKey(id, key).c_str(), &stored);
        // Presence-prefixed, matching mmkv_plugin.cpp exactly: 0x00 = absent,
        // 0x01 + value = present.
        if (len < 0) {
            char absent = 0;
            *out = dup(&absent, 1);
        } else {
            std::string res(1, '\1');
            res.append((const char*)stored, (size_t)len);
            *out = dup(res.data(), res.size());
        }
        if (stored) free(stored);
        return 0;
    }
    if (strcmp(m, "has") == 0) {
        std::string key((const char*)args.ptr + off, args.len - off);
        uint8_t* stored = nullptr;
        int len = rayactWebLocalStorageGet(storageKey(id, key).c_str(), &stored);
        if (stored) free(stored);
        char has = len >= 0 ? 1 : 0;
        *out = dup(&has, 1);
        return 0;
    }
    if (strcmp(m, "delete") == 0) {
        std::string key((const char*)args.ptr + off, args.len - off);
        rayactWebLocalStorageRemove(storageKey(id, key).c_str());
        return 0;
    }
    if (strcmp(m, "keys") == 0) {
        uint8_t* buf = nullptr;
        std::string prefix = "rayact_mmkv:" + id + ":";
        int len = rayactWebLocalStorageKeysWithPrefix(prefix.c_str(), &buf);
        // The bridge already emits the exact (u32 len | key) shape this method
        // returns, so the buffer is handed straight through; mmkvRelease frees it.
        if (len > 0) {
            *out = RayactBytes{buf, (size_t)len};
        } else {
            *out = dup("", 0);
        }
        return 0;
    }
    if (strcmp(m, "clear") == 0) {
        std::string prefix = "rayact_mmkv:" + id + ":";
        uint8_t* buf = nullptr;
        int len = rayactWebLocalStorageKeysWithPrefix(prefix.c_str(), &buf);
        size_t i = 0;
        while (i + 4 <= (size_t)len) {
            uint32_t kl = readU32LE(buf + i);
            i += 4;
            if (i + kl > (size_t)len) break;
            std::string key((const char*)buf + i, kl);
            i += kl;
            rayactWebLocalStorageRemove((prefix + key).c_str());
        }
        if (buf) free(buf);
        return 0;
    }
    return -3; // unknown method
}

void mmkvRelease(void*, RayactBytes buf) { free((void*)buf.ptr); }

} // namespace

// The entry every dynamically loaded rayact module exports, on every platform;
// the web host's dlsym looks up exactly this name (native/web/web_plugin_loader.cpp).
extern "C" int rayact_module_register(const RayactHost* host) {
    if (!host || host->abi_version < 1u) return -1;
    RayactModule mod{};
    mod.abi_version = RAYACT_MODULE_ABI_VERSION;
    mod.self = nullptr;
    mod.invoke = mmkvInvoke;
    mod.release = mmkvRelease;
    return host->register_module("mmkv", &mod);
}
