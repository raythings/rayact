#include "kv_store.hpp"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <map>
#include <mutex>
#include <thread>
#include <vector>

namespace rayact {

namespace {

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
    markDirty();
  }

  void remove(const std::string& key) override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      map_.erase(key);
    }
    markDirty();
  }

  std::vector<std::string> keys() override {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> out;
    out.reserve(map_.size());
    for (auto& [k, v] : map_) out.push_back(k);
    return out;
  }

  void clear() override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      map_.clear();
    }
    markDirty();
  }

  void init(const std::string& dataDir) {
    if (running_.exchange(true)) return; // once per process
    path_ = dataDir + "/kv.store";
    load();
    flushThread_ = std::thread([this] { flushLoop(); });
  }

  void flushAndStop() {
    if (!running_.exchange(false)) return;
    {
      std::lock_guard<std::mutex> lock(flushMutex_);
      flushCv_.notify_all();
    }
    if (flushThread_.joinable()) flushThread_.join();
    if (dirty_.load()) flushToDisk();
  }

private:
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

  void load() {
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
