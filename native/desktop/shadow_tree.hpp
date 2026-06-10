#pragma once

#include "raym3/Mutations.h"
#include "raym3/v2/Style.h"

#include <cstdint>
#include <unordered_map>
#include <vector>

struct YGNode;
struct YGConfig;

namespace rayact {

struct ShadowNode {
  uint32_t id = 0;
  YGNode *yoga = nullptr;
  raym3::v2::Style style{};
  float layoutX = 0.0f;
  float layoutY = 0.0f;
  float layoutW = 0.0f;
  float layoutH = 0.0f;
  uint32_t parentId = 0;
  std::vector<uint32_t> children;
};

class ShadowTree {
public:
  ShadowTree();
  ~ShadowTree();

  ShadowNode *createNode(uint32_t id, const raym3::v2::Style &style);
  void disposeNode(uint32_t id);
  void appendChild(uint32_t parentId, uint32_t childId);
  void removeChild(uint32_t parentId, uint32_t childId);
  void setStyle(uint32_t id, const raym3::v2::Style &style);
  void calculateLayout(float width, float height);
  void emitLayoutMutations(raym3::MutationBatch &batch) const;

  ShadowNode *find(uint32_t id);
  const ShadowNode *find(uint32_t id) const;

private:
  YGConfig *config_ = nullptr;
  std::unordered_map<uint32_t, ShadowNode> nodes_;
  uint32_t rootId_ = 0;

  void applyStyleToYoga(ShadowNode &node);
};

ShadowTree &shadowTree();

} // namespace rayact
