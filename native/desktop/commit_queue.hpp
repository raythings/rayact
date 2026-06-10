#pragma once

#include "raym3/Mutations.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <optional>

namespace rayact {

template <size_t Capacity>
class CommitQueue {
public:
  bool tryPush(raym3::MutationBatch batch) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (count_ >= Capacity) return false;
    slots_[write_] = std::move(batch);
    write_ = (write_ + 1) % Capacity;
    ++count_;
    cv_.notify_one();
    return true;
  }

  std::optional<raym3::MutationBatch> tryPop() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (count_ == 0) return std::nullopt;
    raym3::MutationBatch out = std::move(slots_[read_]);
    read_ = (read_ + 1) % Capacity;
    --count_;
    return out;
  }

  bool waitPop(raym3::MutationBatch &out, int timeoutMs) {
    std::unique_lock<std::mutex> lock(mutex_);
    if (!cv_.wait_for(lock, std::chrono::milliseconds(timeoutMs),
                      [&] { return count_ > 0; }))
      return false;
    out = std::move(slots_[read_]);
    read_ = (read_ + 1) % Capacity;
    --count_;
    return true;
  }

  bool empty() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return count_ == 0;
  }

  void notify() { cv_.notify_all(); }

private:
  mutable std::mutex mutex_;
  std::condition_variable cv_;
  raym3::MutationBatch slots_[Capacity]{};
  size_t read_ = 0;
  size_t write_ = 0;
  size_t count_ = 0;
};

constexpr size_t kCommitQueueCapacity = 8;
using EngineCommitQueue = CommitQueue<kCommitQueueCapacity>;

EngineCommitQueue &engineCommitQueue();
std::atomic<uint64_t> &layoutEpoch();

class MutationRecorder {
public:
  void beginFrame(uint64_t epoch);
  void record(raym3::Mutation m);
  raym3::MutationBatch flush();
  bool enabled() const { return enabled_; }
  void setEnabled(bool on) { enabled_ = on; }

private:
  bool enabled_ = true;
  raym3::MutationBatch pending_{};
};

MutationRecorder &mutationRecorder();

void mutationBatchApplyPending();
void mutationBatchPushToRenderQueue();
bool mutationBatchUsesDeferredApply();

} // namespace rayact
