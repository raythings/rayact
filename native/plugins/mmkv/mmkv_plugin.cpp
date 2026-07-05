/*
 * librayact_mmkv — a bundled native plugin exposing an MMKV-style key/value
 * store on the rayact module bus under the name "mmkv".
 *
 * Self-contained: it persists each named instance to a length-prefixed file
 * under <data_dir>/mmkv/<id>.kv. It does not vendor Tencent MMKV; the goal is a
 * fast, dependency-free store that the prebuilt dev app can ship and that user
 * JS (and WASM workers via sys_invoke) can reach without rebuilding the host.
 *
 * Wire protocol (raw bytes; all integers u32 little-endian):
 *   set    : idLen | id | keyLen | key | value           -> empty
 *   get    : idLen | id | key                             -> value (rc -1 absent)
 *   has    : idLen | id | key                             -> 1 byte (0|1)
 *   delete : idLen | id | key                             -> empty
 *   keys   : idLen | id                                   -> repeat(keyLen | key)
 *   clear  : idLen | id                                   -> empty
 */
#include "rayact_module_abi.h"

#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <mutex>
#include <string>
#include <sys/stat.h>

namespace {

const RayactHost* g_host = nullptr;

std::string dataRoot() {
  const char* d = g_host && g_host->data_dir ? g_host->data_dir() : nullptr;
  std::string base = d ? d : ".";
  return base + "/mmkv";
}

void ensureDir(const std::string& dir) {
#ifdef _WIN32
  _mkdir(dir.c_str());
#else
  mkdir(dir.c_str(), 0700);
#endif
}

std::string sanitize(const std::string& id) {
  std::string out;
  for (char c : id) {
    out += (std::isalnum((unsigned char)c) || c == '-' || c == '_' || c == '.') ? c : '_';
  }
  return out.empty() ? "default" : out;
}

uint32_t readU32LE(const uint8_t* p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) |
         ((uint32_t)p[3] << 24);
}

void appendU32LE(std::string& s, uint32_t v) {
  char b[4] = {(char)(v & 0xff), (char)((v >> 8) & 0xff), (char)((v >> 16) & 0xff),
               (char)((v >> 24) & 0xff)};
  s.append(b, 4);
}

// One on-disk store per MMKV instance id, cached in memory and rewritten on
// every mutation (atomic via temp + rename).
struct Store {
  std::map<std::string, std::string> map;
  bool loaded = false;
};

std::mutex g_mtx;
std::map<std::string, Store> g_stores;

std::string filePath(const std::string& id) {
  return dataRoot() + "/" + sanitize(id) + ".kv";
}

Store& store(const std::string& id) {
  Store& s = g_stores[id];
  if (s.loaded) return s;
  s.loaded = true;
  FILE* f = fopen(filePath(id).c_str(), "rb");
  if (!f) return s;
  fseek(f, 0, SEEK_END);
  long sz = ftell(f);
  fseek(f, 0, SEEK_SET);
  if (sz > 0) {
    std::string buf((size_t)sz, '\0');
    if (fread(&buf[0], 1, (size_t)sz, f) == (size_t)sz) {
      size_t i = 0;
      while (i + 4 <= buf.size()) {
        uint32_t kl = readU32LE((const uint8_t*)buf.data() + i);
        i += 4;
        if (i + kl > buf.size()) break;
        std::string k = buf.substr(i, kl);
        i += kl;
        if (i + 4 > buf.size()) break;
        uint32_t vl = readU32LE((const uint8_t*)buf.data() + i);
        i += 4;
        if (i + vl > buf.size()) break;
        s.map[k] = buf.substr(i, vl);
        i += vl;
      }
    }
  }
  fclose(f);
  return s;
}

void persist(const std::string& id, const Store& s) {
  ensureDir(dataRoot());
  std::string out;
  for (const auto& kv : s.map) {
    appendU32LE(out, (uint32_t)kv.first.size());
    out.append(kv.first);
    appendU32LE(out, (uint32_t)kv.second.size());
    out.append(kv.second);
  }
  std::string tmp = filePath(id) + ".tmp";
  FILE* f = fopen(tmp.c_str(), "wb");
  if (!f) return;
  if (!out.empty()) fwrite(out.data(), 1, out.size(), f);
  fclose(f);
  rename(tmp.c_str(), filePath(id).c_str());
}

RayactBytes dup(const std::string& s) {
  uint8_t* buf = (uint8_t*)malloc(s.size() ? s.size() : 1);
  if (s.size()) memcpy(buf, s.data(), s.size());
  return RayactBytes{buf, s.size()};
}

// Parse leading idLen|id, returning the id and advancing *off past it.
bool parseId(RayactBytes args, std::string& id, size_t& off) {
  if (args.len < 4) return false;
  uint32_t il = readU32LE(args.ptr);
  if (4 + il > args.len) return false;
  id.assign((const char*)args.ptr + 4, il);
  off = 4 + il;
  return true;
}

int mmkvInvoke(void*, const char* method, RayactBytes args, RayactBytes* out) {
  std::string m = method ? method : "";
  std::lock_guard<std::mutex> lk(g_mtx);
  std::string id;
  size_t off = 0;
  if (!parseId(args, id, off)) return -2;
  Store& s = store(id);

  if (m == "set") {
    if (off + 4 > args.len) return -2;
    uint32_t kl = readU32LE(args.ptr + off);
    off += 4;
    if (off + kl > args.len) return -2;
    std::string key((const char*)args.ptr + off, kl);
    off += kl;
    std::string val((const char*)args.ptr + off, args.len - off);
    s.map[key] = val;
    persist(id, s);
    return 0;
  }
  if (m == "get") {
    // Presence-prefixed: a leading 0x00 means absent, 0x01 means present (the
    // value follows). Returning rc != 0 would throw in JS, so absence is encoded
    // in the payload instead.
    std::string key((const char*)args.ptr + off, args.len - off);
    auto it = s.map.find(key);
    std::string res(1, it == s.map.end() ? '\0' : '\1');
    if (it != s.map.end()) res += it->second;
    *out = dup(res);
    return 0;
  }
  if (m == "has") {
    std::string key((const char*)args.ptr + off, args.len - off);
    *out = dup(std::string(1, s.map.count(key) ? '\1' : '\0'));
    return 0;
  }
  if (m == "delete") {
    std::string key((const char*)args.ptr + off, args.len - off);
    if (s.map.erase(key)) persist(id, s);
    return 0;
  }
  if (m == "keys") {
    std::string buf;
    for (const auto& kv : s.map) {
      appendU32LE(buf, (uint32_t)kv.first.size());
      buf.append(kv.first);
    }
    *out = dup(buf);
    return 0;
  }
  if (m == "clear") {
    if (!s.map.empty()) {
      s.map.clear();
      persist(id, s);
    }
    return 0;
  }
  return -3; // unknown method
}

void mmkvRelease(void*, RayactBytes buf) { free((void*)buf.ptr); }

} // namespace

extern "C" int rayact_mmkv_register(const RayactHost* host) {
  if (!host || host->abi_version != RAYACT_MODULE_ABI_VERSION) return -1;
  g_host = host;
  RayactModule mod{};
  mod.abi_version = RAYACT_MODULE_ABI_VERSION;
  mod.self = nullptr;
  mod.invoke = mmkvInvoke;
  mod.release = mmkvRelease;
  return host->register_module("mmkv", &mod);
}

// The generic dlopen entry collides when plugins are static-linked together,
// so it's omitted wherever linking is static (iOS, web) — those hosts call the
// unique rayact_mmkv_register directly.
#if !defined(RAYACT_IOS) && !defined(RAYACT_WEB)
extern "C" int rayact_module_register(const RayactHost* host) {
  return rayact_mmkv_register(host);
}
#endif
