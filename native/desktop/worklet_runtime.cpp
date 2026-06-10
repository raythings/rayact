#include "worklet_runtime.hpp"

#include "raym3_bridge.hpp"

#include <raym3/v2/RenderContext.h>

#include <cmath>
#include <map>
#include <mutex>
#include <string>

extern "C" {
#include "quickjs-libc.h"
}

namespace rayact {

struct AnimatedProp {
  float current = 0.0f;
  float target = 0.0f;
  float velocity = 0.0f;
  float stiffness = 180.0f;
  float damping = 20.0f;
};

struct WorkletRuntime {
  JSRuntime *rt = nullptr;
  JSContext *ctx = nullptr;
  std::mutex mutex;
  std::map<int, std::map<std::string, AnimatedProp>> nodeProps;
};

static WorkletRuntime g_worklet;

WorkletRuntime *workletRuntime() { return &g_worklet; }

bool workletRuntimeInit() {
  if (g_worklet.ctx) return true;
  g_worklet.rt = JS_NewRuntime();
  if (!g_worklet.rt) return false;
  g_worklet.ctx = JS_NewContext(g_worklet.rt);
  if (!g_worklet.ctx) return false;
  js_std_add_helpers(g_worklet.ctx, 0, nullptr);
  return true;
}

void workletRuntimeShutdown() {
  if (g_worklet.ctx) {
    JS_FreeContext(g_worklet.ctx);
    g_worklet.ctx = nullptr;
  }
  if (g_worklet.rt) {
    JS_FreeRuntime(g_worklet.rt);
    g_worklet.rt = nullptr;
  }
  g_worklet.nodeProps.clear();
}

bool workletRegisterAnimatedNode(int nodeId) {
  std::lock_guard<std::mutex> lock(g_worklet.mutex);
  g_worklet.nodeProps[nodeId];
  return true;
}

void workletSetDirectProp(int nodeId, const char *propName, float value) {
  std::lock_guard<std::mutex> lock(g_worklet.mutex);
  g_worklet.nodeProps[nodeId][propName].target = value;
}

static void applySpring(AnimatedProp &p, float dt) {
  float force = -p.stiffness * (p.current - p.target) - p.damping * p.velocity;
  p.velocity += force * dt;
  p.current += p.velocity * dt;
  if (std::fabs(p.current - p.target) < 0.01f && std::fabs(p.velocity) < 0.01f) {
    p.current = p.target;
    p.velocity = 0.0f;
  }
}

void workletRuntimeTick(float dtSeconds) {
  std::lock_guard<std::mutex> lock(g_worklet.mutex);
  for (auto &[nodeId, props] : g_worklet.nodeProps) {
    auto it = g_nodes.find(nodeId);
    if (it == g_nodes.end() || !it->second) continue;
    for (auto &[name, prop] : props) {
      applySpring(prop, dtSeconds);
      if (name == "opacity") {
        it->second->style.opacity = prop.current;
      } else if (name == "translateX") {
        it->second->style.translateX = prop.current;
      } else if (name == "translateY") {
        it->second->style.translateY = prop.current;
      } else if (name == "scrollOffsetY") {
        it->second->scrollOffsetY = prop.current;
      }
    }
  }
}

JSContext *workletContext() { return g_worklet.ctx; }

} // namespace rayact
