#include "kv_store.hpp"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <mutex>
#include <thread>
#include <vector>

#ifdef RAYACT_WEB
// Browser-backed persistence (native/web/web_local_storage.cpp). Values are
// obfuscated in there, so nothing about that is visible here.
extern "C" {
int rayactWebLocalStorageGet(const char* key, uint8_t** outPtr);
void rayactWebLocalStorageSet(const char* key, const uint8_t* value, int valueLen);
void rayactWebLocalStorageRemove(const char* key);
int rayactWebLocalStorageKeysWithPrefix(const char* prefix, uint8_t** outPtr);
}
#endif

namespace rayact {

namespace {

#ifdef RAYACT_WEB
// One localStorage entry per key. A single blob would mean re-encrypting and
// rewriting every value on each set; per-key also keeps the key names legible in
// DevTools, matching how @rayact/mmkv lays its instances out.
constexpr const char* kWebKeyPrefix = "rayact_kv:";
#endif

// Single file <dataDir>/kv.store, length-prefixed records:
//   u32 keyLen, key bytes, u32 valLen, val bytes (little-endian, binary-safe).
class MapKvStore final : public IKvStore {
public:
  bool getString(const std::string& key, std::string& out) override {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = map_.find(key);
    if (it == map_.end()) return false;
    out = it->second;
    return true;
  }

  void set(const std::string& key, const std::string& value) override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      map_[key] = value;
    }
#ifdef RAYACT_WEB
    // Write through immediately. There is no flush thread on web (see init), and
    // a tab can be closed without any teardown hook running, so deferring a write
    // is deferring it forever.
    std::string storageKey = std::string(kWebKeyPrefix) + key;
    rayactWebLocalStorageSet(storageKey.c_str(), (const uint8_t*)value.data(),
                             (int)value.size());
#else
    markDirty();
#endif
  }

  void remove(const std::string& key) override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      map_.erase(key);
    }
#ifdef RAYACT_WEB
    std::string storageKey = std::string(kWebKeyPrefix) + key;
    rayactWebLocalStorageRemove(storageKey.c_str());
#else
    markDirty();
#endif
  }

  std::vector<std::string> keys() override {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> out;
    out.reserve(map_.size());
    for (auto& [k, v] : map_) out.push_back(k);
    return out;
  }

  void clear() override {
    std::vector<std::string> removed;
    {
      std::lock_guard<std::mutex> lock(mutex_);
#ifdef RAYACT_WEB
      removed.reserve(map_.size());
      for (auto& [k, v] : map_) removed.push_back(k);
#endif
      map_.clear();
    }
#ifdef RAYACT_WEB
    for (const std::string& k : removed) {
      rayactWebLocalStorageRemove((std::string(kWebKeyPrefix) + k).c_str());
    }
#else
    markDirty();
#endif
  }

  void init(const std::string& dataDir) {
    if (running_.exchange(true)) return; // once per process
    path_ = dataDir + "/kv.store";
    load();
#ifndef RAYACT_WEB
    // No background flush thread on web: pthreads are off (std::thread would throw
    // system_error → abort), and there is nothing to flush — the web build writes
    // through to localStorage on every mutation instead (see set/remove/clear).
    flushThread_ = std::thread([this] { flushLoop(); });
#endif
  }

  void flushAndStop() {
    if (!running_.exchange(false)) return;
#ifndef RAYACT_WEB
    {
      std::lock_guard<std::mutex> lock(flushMutex_);
      flushCv_.notify_all();
    }
    if (flushThread_.joinable()) flushThread_.join();
    if (dirty_.load()) flushToDisk();
#endif
  }

private:
#ifndef RAYACT_WEB
  void markDirty() {
    dirty_.store(true);
    if (running_.load()) {
      std::lock_guard<std::mutex> lock(flushMutex_);
      flushCv_.notify_all();
    }
  }

  void flushLoop() {
    while (running_.load()) {
      std::unique_lock<std::mutex> lock(flushMutex_);
      flushCv_.wait(lock, [this] { return dirty_.load() || !running_.load(); });
      if (!running_.load()) break;
      // Debounce: coalesce bursts of writes before touching disk.
      flushCv_.wait_for(lock, std::chrono::milliseconds(250),
                        [this] { return !running_.load(); });
      lock.unlock();
      if (dirty_.exchange(false)) flushToDisk();
    }
  }

  static void writeU32(std::vector<uint8_t>& buf, uint32_t v) {
    buf.push_back((uint8_t)(v & 0xff));
    buf.push_back((uint8_t)((v >> 8) & 0xff));
    buf.push_back((uint8_t)((v >> 16) & 0xff));
    buf.push_back((uint8_t)((v >> 24) & 0xff));
  }

  void flushToDisk() {
    if (path_.empty()) return;
    std::vector<uint8_t> buf;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      for (auto& [k, v] : map_) {
        writeU32(buf, (uint32_t)k.size());
        buf.insert(buf.end(), k.begin(), k.end());
        writeU32(buf, (uint32_t)v.size());
        buf.insert(buf.end(), v.begin(), v.end());
      }
    }
    std::string tmp = path_ + ".tmp";
    FILE* f = fopen(tmp.c_str(), "wb");
    if (!f) return;
    if (!buf.empty()) fwrite(buf.data(), 1, buf.size(), f);
    fflush(f);
    fclose(f);
    rename(tmp.c_str(), path_.c_str());
  }
#endif // !RAYACT_WEB

  void load() {
#ifdef RAYACT_WEB
    // Repopulate the in-memory map from localStorage. Every read below is
    // synchronous, so the store behaves exactly as it does elsewhere once init()
    // returns — callers never see an async warm-up.
    uint8_t* keyBlock = nullptr;
    int blockLen = rayactWebLocalStorageKeysWithPrefix(kWebKeyPrefix, &keyBlock);
    std::lock_guard<std::mutex> webLock(mutex_);
    size_t pos = 0;
    while (blockLen > 0 && pos + 4 <= (size_t)blockLen) {
      uint32_t klen = (uint32_t)keyBlock[pos] | ((uint32_t)keyBlock[pos + 1] << 8) |
                      ((uint32_t)keyBlock[pos + 2] << 16) |
                      ((uint32_t)keyBlock[pos + 3] << 24);
      pos += 4;
      if (pos + klen > (size_t)blockLen) break;
      std::string key((const char*)keyBlock + pos, klen);
      pos += klen;
      uint8_t* value = nullptr;
      int vlen = rayactWebLocalStorageGet((std::string(kWebKeyPrefix) + key).c_str(), &value);
      if (vlen >= 0) map_[key] = std::string((const char*)value, (size_t)vlen);
      if (value) free(value);
    }
    if (keyBlock) free(keyBlock);
    return;
#else
    FILE* f = fopen(path_.c_str(), "rb");
    if (!f) return;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz <= 0) { fclose(f); return; }
    std::vector<uint8_t> buf((size_t)sz);
    size_t got = fread(buf.data(), 1, (size_t)sz, f);
    fclose(f);
    buf.resize(got);

    size_t i = 0;
    auto readU32 = [&](uint32_t& out) -> bool {
      if (i + 4 > buf.size()) return false;
      out = (uint32_t)buf[i] | ((uint32_t)buf[i + 1] << 8) |
            ((uint32_t)buf[i + 2] << 16) | ((uint32_t)buf[i + 3] << 24);
      i += 4;
      return true;
    };
    std::lock_guard<std::mutex> lock(mutex_);
    while (i < buf.size()) {
      uint32_t kl, vl;
      if (!readU32(kl) || i + kl > buf.size()) break;
      std::string k((const char*)&buf[i], kl); i += kl;
      if (!readU32(vl) || i + vl > buf.size()) break;
      std::string v((const char*)&buf[i], vl); i += vl;
      map_[std::move(k)] = std::move(v);
    }
#endif
  }

  std::mutex mutex_;
  std::map<std::string, std::string> map_;

  std::string path_;
  std::atomic<bool> running_{false};
  std::atomic<bool> dirty_{false};
  std::mutex flushMutex_;
  std::condition_variable flushCv_;
  std::thread flushThread_;
};

MapKvStore g_store;

} // namespace

IKvStore& defaultKvStore() { return g_store; }

void kvStoreInit(const std::string& dataDir) { g_store.init(dataDir); }

void kvStoreFlushAndStop() { g_store.flushAndStop(); }

} // namespace rayact
