#pragma once

#include <string>
#include <vector>

namespace rayact {

// Thread-safe key/value backing store. The implementation is a process
// singleton (the binding is installed per JSContext, the data is shared).
struct IKvStore {
  virtual ~IKvStore() = default;
  virtual bool getString(const std::string& key, std::string& out) = 0; // false = absent
  virtual void set(const std::string& key, const std::string& value) = 0;
  virtual void remove(const std::string& key) = 0;
  virtual std::vector<std::string> keys() = 0;
  virtual void clear() = 0;
};

IKvStore& defaultKvStore();

// Load the persisted store from dataDir/kv.store and start the write-behind
// flush thread. Idempotent: only the first call per process takes effect.
void kvStoreInit(const std::string& dataDir);

// Final synchronous flush + join the flush thread. Safe to call without init.
void kvStoreFlushAndStop();

} // namespace rayact
