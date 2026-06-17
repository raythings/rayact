/*
 * librayact_secure_store — bundled native plugin exposing a secure key/value
 * store on the rayact module bus under the name "secure-store".
 *
 * Backends:
 *   - macOS: Security.framework Keychain (secure_store_mac.mm).
 *   - Other (Linux/Android): app-private file store under
 *     <data_dir>/secure-store, 0600, lightly obfuscated (see file backend
 *     below). On Android the data dir is already per-app sandboxed storage.
 *     TODO(hardening): back this with EncryptedSharedPreferences (Android
 *     Keystore) and libsecret on Linux.
 *
 * Wire protocol (raw bytes; u32 little-endian):
 *   setItem    : keyLen | key | value   -> empty
 *   getItem    : key                    -> value (rc -1 absent)
 *   deleteItem : key                    -> empty
 */
#include "secure_store.hpp"

#include <cstdlib>
#include <cstring>
#include <mutex>
#include <string>

namespace {

const RayactHost* g_host = nullptr;

uint32_t readU32LE(const uint8_t* p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) |
         ((uint32_t)p[3] << 24);
}

RayactBytes dup(const std::string& s) {
  uint8_t* buf = (uint8_t*)malloc(s.size() ? s.size() : 1);
  if (s.size()) memcpy(buf, s.data(), s.size());
  return RayactBytes{buf, s.size()};
}

int ssInvoke(void*, const char* method, RayactBytes args, RayactBytes* out) {
  using namespace rayact_secure_store;
  std::string m = method ? method : "";

  if (m == "setItem") {
    if (args.len < 4) return -2;
    uint32_t kl = readU32LE(args.ptr);
    if (4 + kl > args.len) return -2;
    std::string key((const char*)args.ptr + 4, kl);
    std::string val((const char*)args.ptr + 4 + kl, args.len - 4 - kl);
    return backendSet(key, val) ? 0 : -4;
  }
  if (m == "getItem") {
    // Presence-prefixed payload (0x00 absent, 0x01 present + value); a non-zero
    // rc would throw in JS, so absence is encoded in the bytes.
    std::string key((const char*)args.ptr, args.len);
    std::string v;
    int rc = backendGet(key, v);
    std::string res(1, rc == 0 ? '\1' : '\0');
    if (rc == 0) res += v;
    *out = dup(res);
    return 0;
  }
  if (m == "deleteItem") {
    std::string key((const char*)args.ptr, args.len);
    return backendDelete(key) ? 0 : -4;
  }
  return -3; // unknown method
}

void ssRelease(void*, RayactBytes buf) { free((void*)buf.ptr); }

} // namespace

extern "C" int rayact_secure_store_register(const RayactHost* host) {
  if (!host || host->abi_version != RAYACT_MODULE_ABI_VERSION) return -1;
  g_host = host;
  rayact_secure_store::backendInit(host);
  RayactModule mod{};
  mod.abi_version = RAYACT_MODULE_ABI_VERSION;
  mod.self = nullptr;
  mod.invoke = ssInvoke;
  mod.release = ssRelease;
  return host->register_module("secure-store", &mod);
}

#if !defined(RAYACT_IOS)
extern "C" int rayact_module_register(const RayactHost* host) {
  return rayact_secure_store_register(host);
}
#endif

// ─── File-backed fallback (non-Apple) ──────────────────────────────────────────
#ifndef __APPLE__
#include <cctype>
#include <cstdio>
#include <sys/stat.h>

namespace rayact_secure_store {

namespace {
const RayactHost* fb_host = nullptr;
std::mutex fb_mtx;

std::string root() {
  const char* d = fb_host && fb_host->data_dir ? fb_host->data_dir() : nullptr;
  return (d ? std::string(d) : std::string(".")) + "/secure-store";
}

void ensureDir(const std::string& dir) {
#ifdef _WIN32
  _mkdir(dir.c_str());
#else
  mkdir(dir.c_str(), 0700);
#endif
}

std::string sanitize(const std::string& key) {
  std::string out;
  for (char c : key)
    out += (std::isalnum((unsigned char)c) || c == '-' || c == '_' || c == '.') ? c : '_';
  return out.empty() ? "_" : out;
}

std::string pathFor(const std::string& key) { return root() + "/" + sanitize(key); }

// Light obfuscation only — defends against casual inspection, not a determined
// attacker. Real hardening tracked in the TODO above.
void obfuscate(std::string& s) {
  static const uint8_t k[8] = {0x9e, 0x37, 0x79, 0xb1, 0x4d, 0xc2, 0x6a, 0x05};
  for (size_t i = 0; i < s.size(); ++i) s[i] ^= k[i & 7];
}
} // namespace

void backendInit(const RayactHost* host) { fb_host = host; }

bool backendSet(const std::string& key, const std::string& value) {
  std::lock_guard<std::mutex> lk(fb_mtx);
  ensureDir(root());
  std::string data = value;
  obfuscate(data);
  std::string tmp = pathFor(key) + ".tmp";
  FILE* f = fopen(tmp.c_str(), "wb");
  if (!f) return false;
  if (!data.empty()) fwrite(data.data(), 1, data.size(), f);
  fclose(f);
#ifndef _WIN32
  chmod(tmp.c_str(), 0600);
#endif
  return rename(tmp.c_str(), pathFor(key).c_str()) == 0;
}

int backendGet(const std::string& key, std::string& out) {
  std::lock_guard<std::mutex> lk(fb_mtx);
  FILE* f = fopen(pathFor(key).c_str(), "rb");
  if (!f) return -1;
  fseek(f, 0, SEEK_END);
  long sz = ftell(f);
  fseek(f, 0, SEEK_SET);
  std::string data(sz > 0 ? (size_t)sz : 0, '\0');
  if (sz > 0) {
    size_t n = fread(&data[0], 1, (size_t)sz, f);
    data.resize(n);
  }
  fclose(f);
  obfuscate(data);
  out = data;
  return 0;
}

bool backendDelete(const std::string& key) {
  std::lock_guard<std::mutex> lk(fb_mtx);
  remove(pathFor(key).c_str());
  return true;
}

} // namespace rayact_secure_store
#endif // !__APPLE__
