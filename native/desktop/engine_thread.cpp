#include "engine_thread.hpp"

#include "commit_queue.hpp"
#include "engine_internal.hpp"

#include <chrono>
#include <cstdlib>

namespace rayact {

static std::thread g_jsThread;
static std::atomic<bool> g_jsThreadRunning{false};
static std::atomic<bool> g_vsyncPending{false};
static std::mutex g_vsyncMutex;
static std::condition_variable g_vsyncCv;

bool engineThreadedModeEnabled() {
  static int cached = -1;
  if (cached < 0) {
    const char *env = std::getenv("RAYACT_THREADED");
    cached = (env && env[0] && env[0] != '0') ? 1 : 0;
  }
  return cached == 1;
}

static void jsThreadMain() {
  enginePrepareJSThread();
  while (g_jsThreadRunning.load(std::memory_order_relaxed)) {
    enginePumpJS();
    mutationBatchApplyPending();
    {
      std::unique_lock<std::mutex> lock(g_vsyncMutex);
      g_vsyncCv.wait_for(lock, std::chrono::milliseconds(16),
                         [] { return g_vsyncPending.load(std::memory_order_relaxed); });
      g_vsyncPending.store(false, std::memory_order_relaxed);
    }
  }
}

void engineStartJSThread() {
  if (!engineThreadedModeEnabled() || g_jsThreadRunning.load()) return;
  g_jsThreadRunning.store(true);
  g_jsThread = std::thread(jsThreadMain);
}

void engineStopJSThread() {
  if (!g_jsThreadRunning.load()) return;
  g_jsThreadRunning.store(false);
  g_vsyncCv.notify_all();
  if (g_jsThread.joinable()) g_jsThread.join();
}

void engineSignalVsync() {
  g_vsyncPending.store(true, std::memory_order_relaxed);
  g_vsyncCv.notify_one();
}

bool engineWaitForCommit(int timeoutMs) {
  raym3::MutationBatch batch;
  return engineCommitQueue().waitPop(batch, timeoutMs);
}

} // namespace rayact
