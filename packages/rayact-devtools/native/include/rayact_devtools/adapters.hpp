#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <utility>
#include <vector>

namespace rayact::devtools {

struct HostNodeSnapshot {
  std::uint64_t backend_id = 0;
  std::uint64_t parent_backend_id = 0;
  std::string local_name;
  std::string text;
  std::vector<std::pair<std::string, std::string>> attributes;
  double x = 0, y = 0, width = 0, height = 0;
};

struct MetricSample {
  std::string name;
  double value = 0;
};

class RuntimeAdapter {
 public:
  virtual ~RuntimeAdapter() = default;
  virtual void dispatch(std::function<void()> work) = 0;
};

class RendererAdapter {
 public:
  virtual ~RendererAdapter() = default;
  virtual std::vector<HostNodeSnapshot> snapshot() = 0;
  virtual void highlight(std::uint64_t backend_id) = 0;
  virtual std::uint64_t node_at(double x, double y) = 0;
};

class NetworkObserver {
 public:
  virtual ~NetworkObserver() = default;
  virtual void emit(const std::string& method, const std::string& params_json) = 0;
};

class MetricsProvider {
 public:
  virtual ~MetricsProvider() = default;
  virtual std::vector<MetricSample> sample() = 0;
};

class ScriptRegistry {
 public:
  virtual ~ScriptRegistry() = default;
  virtual int register_script(std::string url, std::string source) = 0;
};

struct DevToolsHost {
  RuntimeAdapter* runtime = nullptr;
  RendererAdapter* renderer = nullptr;
  NetworkObserver* network = nullptr;
  MetricsProvider* metrics = nullptr;
  ScriptRegistry* scripts = nullptr;
};

}  // namespace rayact::devtools
