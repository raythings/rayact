#include "commit_queue.hpp"

#include "raym3_bridge.hpp"

#include <raym3/v2/RenderContext.h>

#include <cstdlib>

namespace rayact {

static EngineCommitQueue g_commitQueue;
static std::atomic<uint64_t> g_layoutEpoch{0};
static MutationRecorder g_recorder;

EngineCommitQueue &engineCommitQueue() { return g_commitQueue; }
std::atomic<uint64_t> &layoutEpoch() { return g_layoutEpoch; }

void MutationRecorder::beginFrame(uint64_t epoch) {
  pending_.epoch = epoch;
}

void MutationRecorder::record(raym3::Mutation m) {
  if (!enabled_) return;
  pending_.ops.push_back(std::move(m));
}

raym3::MutationBatch MutationRecorder::flush() {
  raym3::MutationBatch out = std::move(pending_);
  pending_ = {};
  pending_.epoch = g_layoutEpoch.load(std::memory_order_relaxed);
  return out;
}

MutationRecorder &mutationRecorder() { return g_recorder; }

bool mutationBatchUsesDeferredApply() {
  static int cached = -1;
  if (cached < 0) {
    const char *env = std::getenv("RAYACT_MUTATION_DEFER");
    cached = (env && env[0] && env[0] != '0') ? 1 : 0;
  }
  return cached == 1;
}

void mutationBatchApplyPending() {
  raym3::MutationBatch batch = g_recorder.flush();
  if (batch.ops.empty()) return;

  if (mutationBatchUsesDeferredApply()) {
    engineCommitQueue().tryPush(std::move(batch));
    return;
  }

  // raym3_bridge already applies tree mutations directly; re-applying the
  // recorded batch would duplicate children and corrupt Yoga layout.
}

void mutationBatchPushToRenderQueue() {
  while (auto batch = engineCommitQueue().tryPop()) {
    raym3::ApplyMutations(raym3::v2::Ctx(), *batch, g_nodes, g_root);
  }
}

} // namespace rayact
