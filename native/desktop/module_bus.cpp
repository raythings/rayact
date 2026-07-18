#include "module_bus.hpp"

#include "data_dir.hpp"
#include "../core/engine.hpp"

#include <cstring>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace rayact {

// ─── Registry (process singleton) ──────────────────────────────────────────────

namespace {
std::mutex g_regMtx;
std::map<std::string, RayactModule> g_modules;
} // namespace

bool busRegister(const char* name, const RayactModule* mod) {
  if (!name || !mod || !mod->invoke) return false;
  if (mod->abi_version != RAYACT_MODULE_ABI_VERSION) return false;
  std::lock_guard<std::mutex> lk(g_regMtx);
  g_modules[name] = *mod;
  return true;
}

bool busHas(const char* name) {
  if (!name) return false;
  std::lock_guard<std::mutex> lk(g_regMtx);
  return g_modules.count(name) != 0;
}

bool busInvoke(const std::string& name, const std::string& method,
               const std::string& args, std::string& out, int* errcode) {
  RayactModule mod;
  {
    std::lock_guard<std::mutex> lk(g_regMtx);
    auto it = g_modules.find(name);
    if (it == g_modules.end()) {
      if (errcode) *errcode = kBusNoModule;
      return false;
    }
    mod = it->second;
  }
  RayactBytes in{args.empty() ? nullptr : (const uint8_t*)args.data(), args.size()};
  RayactBytes res{nullptr, 0};
  int rc = mod.invoke(mod.self, method.c_str(), in, &res);
  if (rc != 0) {
    if (errcode) *errcode = rc;
    if (res.ptr && mod.release) mod.release(mod.self, res);
    return false;
  }
  out.assign(res.ptr ? (const char*)res.ptr : "", res.len);
  if (res.ptr && mod.release) mod.release(mod.self, res);
  if (errcode) *errcode = 0;
  return true;
}

int busInvokeRaw(const char* name, size_t nameLen, const char* method,
                 size_t methodLen, const uint8_t* args, size_t argsLen,
                 uint8_t* out, size_t outCap) {
  std::string n(name, nameLen), m(method, methodLen);
  std::string a((const char*)(args ? args : (const uint8_t*)""), argsLen);
  std::string res;
  int err = 0;
  if (!busInvoke(n, m, a, res, &err)) return err < 0 ? err : -1;
  if (res.size() > outCap) return (int)res.size(); // caller retries with bigger buffer
  if (!res.empty()) memcpy(out, res.data(), res.size());
  return (int)res.size();
}

// ─── Host struct for plugins ───────────────────────────────────────────────────

namespace {
const char* hostDataDir() {
  static std::string dir = rayactDataDir();
  return dir.c_str();
}
int hostRegister(const char* name, const RayactModule* mod) {
  return busRegister(name, mod) ? 0 : -1;
}
int hostInvoke(const char* name, const char* method, RayactBytes args,
               RayactBytes* out, RayactReleaseFn* out_release, void** out_self) {
  RayactModule mod;
  {
    std::lock_guard<std::mutex> lk(g_regMtx);
    auto it = g_modules.find(name ? name : "");
    if (it == g_modules.end()) return kBusNoModule;
    mod = it->second;
  }
  if (out_release) *out_release = mod.release;
  if (out_self) *out_self = mod.self;
  return mod.invoke(mod.self, method, args, out);
}
void hostRandom(uint8_t* out, size_t n) {
  static std::mutex m;
  std::lock_guard<std::mutex> lk(m);
  for (size_t i = 0; i < n; ++i) out[i] = (uint8_t)(rand() & 0xff);
}
void hostLog(int level, const char* msg) {
  (void)level;
  fprintf(stderr, "[module] %s\n", msg ? msg : "");
}
void* g_javaVm = nullptr;
void* hostJavaVM() { return g_javaVm; }

RayactHost g_host = {
    RAYACT_MODULE_ABI_VERSION, hostDataDir, hostRegister, hostInvoke,
    hostRandom, hostLog, hostJavaVM,
};
} // namespace

const RayactHost* busHost() { return &g_host; }

void busSetJavaVM(void* vm) { g_javaVm = vm; }

// ─── Async dispatch + per-context bindings ─────────────────────────────────────

namespace {

struct AsyncResult {
  int id;
  bool ok;
  std::string data;   // result on ok, error message on failure
};

struct BusQueue {
  std::mutex mtx;
  std::vector<AsyncResult> items;
  void push(AsyncResult r) {
    std::lock_guard<std::mutex> lk(mtx);
    items.push_back(std::move(r));
  }
  std::vector<AsyncResult> drain() {
    std::lock_guard<std::mutex> lk(mtx);
    std::vector<AsyncResult> out;
    out.swap(items);
    return out;
  }
};

struct BusCtx {
  std::shared_ptr<BusQueue> queue = std::make_shared<BusQueue>();
  std::map<int, std::pair<JSValue, JSValue>> pending; // id → {resolve, reject}
  int nextId = 1;
};

std::mutex g_ctxMtx;
std::unordered_map<JSContext*, BusCtx*> g_ctxMap;

BusCtx* getBusCtx(JSContext* ctx) {
  std::lock_guard<std::mutex> lk(g_ctxMtx);
  auto it = g_ctxMap.find(ctx);
  return it != g_ctxMap.end() ? it->second : nullptr;
}

// Read (name, method, ArrayBuffer|undefined) from argv.
bool readInvokeArgs(JSContext* ctx, int argc, JSValueConst* argv, std::string& name,
                    std::string& method, std::string& args) {
  if (argc < 2) return false;
  const char* n = JS_ToCString(ctx, argv[0]);
  const char* m = JS_ToCString(ctx, argv[1]);
  if (!n || !m) {
    if (n) JS_FreeCString(ctx, n);
    if (m) JS_FreeCString(ctx, m);
    return false;
  }
  name = n;
  method = m;
  JS_FreeCString(ctx, n);
  JS_FreeCString(ctx, m);
  args.clear();
  if (argc >= 3 && !JS_IsUndefined(argv[2]) && !JS_IsNull(argv[2])) {
    size_t len = 0;
    uint8_t* buf = JS_GetArrayBuffer(ctx, &len, argv[2]);
    if (buf) {
      args.assign((const char*)buf, len);
    } else {
      const char* s = JS_ToCString(ctx, argv[2]);
      if (s) {
        args = s;
        JS_FreeCString(ctx, s);
      }
    }
  }
  return true;
}

JSValue makeArrayBuffer(JSContext* ctx, const std::string& data) {
  return JS_NewArrayBufferCopy(ctx, (const uint8_t*)data.data(), data.size());
}

JSValue jsInvoke(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
  std::string name, method, args;
  if (!readInvokeArgs(ctx, argc, argv, name, method, args))
    return JS_ThrowTypeError(ctx, "__rayact_invoke(name, method, argsBuffer?)");
  std::string out;
  int err = 0;
  if (!busInvoke(name, method, args, out, &err)) {
    if (err == kBusNoModule)
      return JS_ThrowReferenceError(
          ctx, "rayact module '%s' not available — install the plugin", name.c_str());
    return JS_ThrowInternalError(ctx, "module '%s'.%s failed (%d)", name.c_str(),
                                 method.c_str(), err);
  }
  return makeArrayBuffer(ctx, out);
}

JSValue jsInvokeAsync(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
  std::string name, method, args;
  if (!readInvokeArgs(ctx, argc, argv, name, method, args))
    return JS_ThrowTypeError(ctx, "__rayact_invoke_async(name, method, argsBuffer?)");
  BusCtx* bc = getBusCtx(ctx);
  if (!bc) return JS_ThrowInternalError(ctx, "module bus not installed on context");

  JSValue funcs[2];
  JSValue promise = JS_NewPromiseCapability(ctx, funcs);
  int id = bc->nextId++;
  bc->pending[id] = {JS_DupValue(ctx, funcs[0]), JS_DupValue(ctx, funcs[1])};
  JS_FreeValue(ctx, funcs[0]);
  JS_FreeValue(ctx, funcs[1]);

  auto queue = bc->queue;
  std::thread([queue, id, name, method, args]() mutable {
    std::string out;
    int err = 0;
    bool ok = busInvoke(name, method, args, out, &err);
    AsyncResult r{id, ok, ok ? std::move(out) : std::string()};
    if (!ok) {
      r.data = (err == kBusNoModule)
                   ? ("rayact module '" + name + "' not available")
                   : ("module '" + name + "'." + method + " failed (" +
                      std::to_string(err) + ")");
    }
    queue->push(std::move(r));
    engineRequestFrame();
  }).detach();

  return promise;
}

} // namespace

void installModuleBindings(JSContext* ctx, JSValue global) {
  {
    std::lock_guard<std::mutex> lk(g_ctxMtx);
    if (!g_ctxMap.count(ctx)) g_ctxMap[ctx] = new BusCtx();
  }
  JS_SetPropertyStr(ctx, global, "__rayact_invoke",
                    JS_NewCFunction(ctx, jsInvoke, "__rayact_invoke", 3));
  JS_SetPropertyStr(ctx, global, "__rayact_invoke_async",
                    JS_NewCFunction(ctx, jsInvokeAsync, "__rayact_invoke_async", 3));
}

void drainModuleEvents(JSContext* ctx) {
  BusCtx* bc = getBusCtx(ctx);
  if (!bc) return;
  auto items = bc->queue->drain();
  for (auto& r : items) {
    auto it = bc->pending.find(r.id);
    if (it == bc->pending.end()) continue;
    auto [resolve, reject] = it->second;
    bc->pending.erase(it);
    if (r.ok) {
      JSValue ab = makeArrayBuffer(ctx, r.data);
      JSValue ret = JS_Call(ctx, resolve, JS_UNDEFINED, 1, &ab);
      JS_FreeValue(ctx, ret);
      JS_FreeValue(ctx, ab);
    } else {
      JSValue err = JS_NewError(ctx);
      JS_SetPropertyStr(ctx, err, "message", JS_NewString(ctx, r.data.c_str()));
      JSValue ret = JS_Call(ctx, reject, JS_UNDEFINED, 1, &err);
      JS_FreeValue(ctx, ret);
      JS_FreeValue(ctx, err);
    }
    JS_FreeValue(ctx, resolve);
    JS_FreeValue(ctx, reject);
  }
}

void shutdownModuleBus(JSContext* ctx) {
  BusCtx* bc = nullptr;
  {
    std::lock_guard<std::mutex> lk(g_ctxMtx);
    auto it = g_ctxMap.find(ctx);
    if (it == g_ctxMap.end()) return;
    bc = it->second;
    g_ctxMap.erase(it);
  }
  for (auto& [id, pr] : bc->pending) {
    JS_FreeValue(ctx, pr.first);
    JS_FreeValue(ctx, pr.second);
  }
  delete bc;
}

} // namespace rayact
