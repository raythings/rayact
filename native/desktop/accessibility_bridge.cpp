#include "accessibility_bridge.hpp"

namespace rayact {

static AccessibilityBridge g_a11y;

AccessibilityBridge &accessibilityBridge() { return g_a11y; }

void AccessibilityBridge::rebuild(const raym3::v2::NodePtr &root) {
  nodes_.clear();
  walk(root);
}

void AccessibilityBridge::walk(const raym3::v2::NodePtr &node) {
  if (!node) return;
  const auto &info = node->accessibility;
  if (info.label.empty() && info.role.empty()) {
    for (const auto &child : node->children) walk(child);
    return;
  }
  A11yNode n;
  n.id = static_cast<uint32_t>(raym3::v2::IdOf(node));
  n.role = info.role;
  n.label = info.label;
  n.focusable = !info.stateDisabled;
  n.x = node->layout.x;
  n.y = node->layout.y;
  n.w = node->layout.width;
  n.h = node->layout.height;
  nodes_.push_back(n);
  for (const auto &child : node->children) walk(child);
}

} // namespace rayact
