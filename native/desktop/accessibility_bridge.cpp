#include "accessibility_bridge.hpp"
#include "../core/engine.hpp"

#include <cstdio>

namespace rayact {

static AccessibilityBridge g_a11y;

AccessibilityBridge &accessibilityBridge() { return g_a11y; }

void AccessibilityBridge::rebuild(const raym3::v2::NodePtr &root) {
  std::lock_guard<std::mutex> lock(mutex_);
  nodes_.clear();
  walk(root);
}

std::vector<A11yNode> AccessibilityBridge::nodes() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return nodes_;
}

static void appendJsonString(std::string &output, const std::string &value) {
  output.push_back('"');
  char escaped[7] = {};
  for (const unsigned char character : value) {
    switch (character) {
      case '"': output += "\\\""; break;
      case '\\': output += "\\\\"; break;
      case '\b': output += "\\b"; break;
      case '\f': output += "\\f"; break;
      case '\n': output += "\\n"; break;
      case '\r': output += "\\r"; break;
      case '\t': output += "\\t"; break;
      default:
        if (character < 0x20) {
          std::snprintf(escaped, sizeof(escaped), "\\u%04x", character);
          output += escaped;
        } else {
          output.push_back(static_cast<char>(character));
        }
    }
  }
  output.push_back('"');
}

std::string AccessibilityBridge::snapshotJson() const {
  const auto snapshot = nodes();
  std::string output = "[";
  bool first = true;
  for (const auto &node : snapshot) {
    if (!first) output.push_back(',');
    first = false;
    output += "{\"id\":" + std::to_string(node.id) + ",\"role\":";
    appendJsonString(output, node.role);
    output += ",\"label\":";
    appendJsonString(output, node.label);
    output += ",\"focusable\":" + std::string(node.focusable ? "true" : "false");
    output += ",\"disabled\":" + std::string(node.disabled ? "true" : "false");
    output += ",\"hasState\":" + std::string(node.hasState ? "true" : "false");
    output += ",\"checked\":" + std::string(node.checked ? "true" : "false");
    output += ",\"selected\":" + std::string(node.selected ? "true" : "false");
    output += ",\"expanded\":" + std::string(node.expanded ? "true" : "false");
    output += ",\"x\":" + std::to_string(node.x);
    output += ",\"y\":" + std::to_string(node.y);
    output += ",\"w\":" + std::to_string(node.w);
    output += ",\"h\":" + std::to_string(node.h) + "}";
  }
  output.push_back(']');
  return output;
}

bool AccessibilityBridge::activate(uint32_t id) const {
  A11yNode match;
  bool found = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    for (const auto &node : nodes_) {
      if (node.id == id && !node.disabled) {
        match = node;
        found = true;
        break;
      }
    }
  }
  if (!found) return false;
  const float x = match.x + match.w * 0.5f;
  const float y = match.y + match.h * 0.5f;
  engineQueueTouch(0, -1000, x, y);
  engineQueueTouch(1, -1000, x, y);
  return true;
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
  n.disabled = info.stateDisabled;
  n.focusable = !n.disabled;
  n.hasState = info.hasState;
  n.checked = info.stateChecked;
  n.selected = info.stateSelected;
  n.expanded = info.stateExpanded;
  n.x = node->layout.x;
  n.y = node->layout.y;
  n.w = node->layout.width;
  n.h = node->layout.height;
  nodes_.push_back(n);
  for (const auto &child : node->children) walk(child);
}

} // namespace rayact
