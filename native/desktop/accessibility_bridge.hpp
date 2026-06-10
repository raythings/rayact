#pragma once

#include <raym3/v2/Input.h>
#include <raym3/v2/View.h>

#include <string>
#include <vector>

namespace rayact {

struct A11yNode {
  uint32_t id = 0;
  std::string role;
  std::string label;
  bool focusable = false;
  float x = 0, y = 0, w = 0, h = 0;
};

class AccessibilityBridge {
public:
  void rebuild(const raym3::v2::NodePtr &root);
  const std::vector<A11yNode> &nodes() const { return nodes_; }

private:
  void walk(const raym3::v2::NodePtr &node);
  std::vector<A11yNode> nodes_;
};

AccessibilityBridge &accessibilityBridge();

} // namespace rayact
