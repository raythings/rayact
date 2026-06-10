#include "shadow_tree.hpp"

#include "commit_queue.hpp"

#include <algorithm>
#include <yoga/Yoga.h>

namespace rayact {

ShadowTree::ShadowTree() {
  config_ = YGConfigNew();
  YGConfigSetUseWebDefaults(config_, true);
}

ShadowTree::~ShadowTree() {
  for (auto &[id, node] : nodes_) {
    (void)id;
    if (node.yoga) YGNodeFree(node.yoga);
  }
  if (config_) YGConfigFree(config_);
}

ShadowNode *ShadowTree::find(uint32_t id) {
  auto it = nodes_.find(id);
  return it == nodes_.end() ? nullptr : &it->second;
}

const ShadowNode *ShadowTree::find(uint32_t id) const {
  auto it = nodes_.find(id);
  return it == nodes_.end() ? nullptr : &it->second;
}

ShadowNode *ShadowTree::createNode(uint32_t id, const raym3::v2::Style &style) {
  ShadowNode node;
  node.id = id;
  node.style = style;
  node.yoga = YGNodeNewWithConfig(config_);
  applyStyleToYoga(node);
  nodes_[id] = std::move(node);
  if (rootId_ == 0) rootId_ = id;
  return &nodes_[id];
}

void ShadowTree::disposeNode(uint32_t id) {
  if (auto *node = find(id)) {
    if (node->yoga) YGNodeFree(node->yoga);
  }
  nodes_.erase(id);
}

void ShadowTree::appendChild(uint32_t parentId, uint32_t childId) {
  ShadowNode *parent = find(parentId);
  ShadowNode *child = find(childId);
  if (!parent || !child || !parent->yoga || !child->yoga) return;
  parent->children.push_back(childId);
  child->parentId = parentId;
  YGNodeInsertChild(parent->yoga, child->yoga, YGNodeGetChildCount(parent->yoga));
}

void ShadowTree::removeChild(uint32_t parentId, uint32_t childId) {
  ShadowNode *parent = find(parentId);
  ShadowNode *child = find(childId);
  if (!parent || !child || !parent->yoga || !child->yoga) return;
  auto &children = parent->children;
  children.erase(std::remove(children.begin(), children.end(), childId), children.end());
  child->parentId = 0;
  for (uint32_t i = 0; i < YGNodeGetChildCount(parent->yoga); ++i) {
    if (YGNodeGetChild(parent->yoga, i) == child->yoga) {
      YGNodeRemoveChild(parent->yoga, child->yoga);
      break;
    }
  }
}

void ShadowTree::setStyle(uint32_t id, const raym3::v2::Style &style) {
  if (ShadowNode *node = find(id)) {
    node->style = style;
    applyStyleToYoga(*node);
  }
}

void ShadowTree::applyStyleToYoga(ShadowNode &node) {
  if (!node.yoga) return;
  const auto &s = node.style;
  if (s.width.has_value()) YGNodeStyleSetWidth(node.yoga, *s.width);
  if (s.height.has_value()) YGNodeStyleSetHeight(node.yoga, *s.height);
  if (s.flexGrow.has_value()) YGNodeStyleSetFlexGrow(node.yoga, *s.flexGrow);
  if (s.flexShrink.has_value()) YGNodeStyleSetFlexShrink(node.yoga, *s.flexShrink);
  if (s.flexBasis.has_value()) YGNodeStyleSetFlexBasis(node.yoga, *s.flexBasis);
}

void ShadowTree::calculateLayout(float width, float height) {
  ShadowNode *root = find(rootId_);
  if (!root || !root->yoga) return;
  YGNodeCalculateLayout(root->yoga, width, height, YGDirectionLTR);
  for (auto &[id, node] : nodes_) {
    (void)id;
    if (!node.yoga) continue;
    node.layoutX = YGNodeLayoutGetLeft(node.yoga);
    node.layoutY = YGNodeLayoutGetTop(node.yoga);
    node.layoutW = YGNodeLayoutGetWidth(node.yoga);
    node.layoutH = YGNodeLayoutGetHeight(node.yoga);
  }
}

void ShadowTree::emitLayoutMutations(raym3::MutationBatch &batch) const {
  for (const auto &[id, node] : nodes_) {
    raym3::Mutation m;
    m.op = raym3::MutationOp::SetLayout;
    m.id = id;
    m.layoutX = node.layoutX;
    m.layoutY = node.layoutY;
    m.layoutW = node.layoutW;
    m.layoutH = node.layoutH;
    batch.ops.push_back(m);
  }
}

ShadowTree &shadowTree() {
  static ShadowTree tree;
  return tree;
}

} // namespace rayact
