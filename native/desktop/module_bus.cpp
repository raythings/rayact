#include "module_bus.hpp"

#include "data_dir.hpp"
#include "gpu_api.hpp"
#include "module_nodes.hpp"
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
  // Accept any ABI this host still understands, not just the current one: a module
  // built against an older header is compiled into a binary we may not be able to
  // rebuild. RayactModule's layout is frozen, so an older struct is readable as-is.
  if (mod->abi_version < 1u || mod->abi_version > RAYACT_MODULE_ABI_VERSION) return false;
  std::lock_guard<std::mutex> lk(g_regMtx);
  g_modules[name] = *mod;
  return true;
}

bool busHas(const char* name) {
  if (!name) return false;
  std::lock_guard<std::mutex> lk(g_regMtx);
  return g_modules.count(name) != 0;
}

bool busInvokeBytes(const std::string& name, const std::string& method,
                    const uint8_t* args, size_t argsLen, std::string& out,
                    int* errcode) {
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
  RayactBytes in{argsLen ? args : nullptr, argsLen};
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

bool busInvoke(const std::string& name, const std::string& method,
               const std::string& args, std::string& out, int* errcode) {
  return busInvokeBytes(name, method, (const uint8_t*)args.data(), args.size(),
                        out, errcode);
}

int busInvokeRaw(const char* name, size_t nameLen, const char* method,
                 size_t methodLen, const uint8_t* args, size_t argsLen,
                 uint8_t* out, size_t outCap) {
  std::string n(name, nameLen), m(method, methodLen);
  std::string res;
  int err = 0;
  if (!busInvokeBytes(n, m, args, argsLen, res, &err)) return err < 0 ? err : -1;
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

// ─── ABI 2: node kinds ─────────────────────────────────────────────────────────

int hostRegisterNodeKind(const char* kind, const RayactNodeVTable* vtable) {
  if (!kind || !*kind || !vtable || !vtable->draw) return -1;
  // struct_size lets a module built against a later header register safely: we only
  // read the prefix both sides agree on.
  if (vtable->struct_size < sizeof(RayactNodeVTable)) {
    // Older/smaller vtable: nothing to do today (v2 is the first), but reject a
    // zero size outright since it means the caller never initialized the struct.
    if (vtable->struct_size == 0) return -1;
  }
  return moduleNodesRegisterKind(kind, vtable) ? 0 : -1;
}

const RayactGpuApi* hostGpu() { return rayactGpuApi(); }

void hostRequestFrame() { engineRequestFrame(); }

// ─── ABI 2: shared buffers ─────────────────────────────────────────────────────

// Slabs a module publishes to JS as ArrayBuffers. Freeing one while JS still holds
// a view would hand the app a dangling pointer, so drop only marks it: the memory
// goes away once every context that was handed a view has detached it.
struct SharedSlab {
  std::vector<uint8_t> bytes;
  bool dropped = false;
  int views = 0; // contexts currently holding an ArrayBuffer over this slab
};

std::mutex g_bufMtx;
std::map<int32_t, SharedSlab> g_buffers;
int32_t g_nextBufferId = 1;

// Caller must hold g_bufMtx.
void reapSlabLocked(std::map<int32_t, SharedSlab>::iterator it) {
  if (it->second.dropped && it->second.views == 0) g_buffers.erase(it);
}

int32_t hostSharedBufferCreate(size_t size, void** out_ptr) {
  if (size == 0) return -1;
  std::lock_guard<std::mutex> lk(g_bufMtx);
  const int32_t id = g_nextBufferId++;
  SharedSlab& slab = g_buffers[id];
  slab.bytes.assign(size, 0);
  if (out_ptr) *out_ptr = slab.bytes.data();
  return id;
}

void* hostSharedBufferPtr(int32_t id, size_t* out_size) {
  std::lock_guard<std::mutex> lk(g_bufMtx);
  auto it = g_buffers.find(id);
  if (it == g_buffers.end() || it->second.dropped) return nullptr;
  if (out_size) *out_size = it->second.bytes.size();
  return it->second.bytes.data();
}

int hostSharedBufferDrop(int32_t id) {
  std::lock_guard<std::mutex> lk(g_bufMtx);
  auto it = g_buffers.find(id);
  if (it == g_buffers.end()) return -1;
  it->second.dropped = true;
  reapSlabLocked(it);
  return 0;
}

// ─── ABI 2: WASM host imports ──────────────────────────────────────────────────

std::mutex g_wasmMtx;
std::vector<BusWasmImport> g_wasmImports;

int hostRegisterWasmImports(const char* ns, const RayactWasmImport* imports,
                            size_t count) {
  if (!ns || !*ns || (!imports && count > 0)) return -1;
  std::lock_guard<std::mutex> lk(g_wasmMtx);
  for (size_t i = 0; i < count; ++i) {
    const RayactWasmImport& in = imports[i];
    if (!in.name || !in.signature || !in.fn) return -1;
    // Copy the strings: a plugin may hand us pointers into a temporary table.
    g_wasmImports.push_back(BusWasmImport{ns, in.name, in.signature, in.fn, in.self});
  }
  return 0;
}

RayactHost g_host = {
    RAYACT_MODULE_ABI_VERSION, hostDataDir, hostRegister, hostInvoke,
    hostRandom, hostLog, hostJavaVM,
    // ABI 2
    hostRegisterNodeKind, hostGpu,
    hostSharedBufferCreate, hostSharedBufferPtr, hostSharedBufferDrop,
    hostRequestFrame, hostRegisterWasmImports,
};
} // namespace

const RayactHost* busHost() { return &g_host; }

void busSetJavaVM(void* vm) { g_javaVm = vm; }

std::vector<BusWasmImport> busWasmImports() {
  std::lock_guard<std::mutex> lk(g_wasmMtx);
  return g_wasmImports;
}

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
  // Shared-buffer views handed to this context, so they can be detached when the
  // owning module drops the slab or the context goes away.
  std::map<int32_t, JSValue> buffers;
  // Per-context sync-invoke slab (__rayact_invoke_shared): JS writes args into
  // it, native writes the result back into it — no arg copy, no result
  // ArrayBuffer allocation. Per-context because workers invoke from their own
  // threads. Lazily created; JS obtains the view via __rayact_module_buffer.
  int32_t invokeSlabId = 0;
  // Result that didn't fit the slab, fetched by __rayact_invoke_take.
  std::string overflow;
};

constexpr size_t kInvokeSlabBytes = 256 * 1024;

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

// __rayact_module_buffer(id) → ArrayBuffer over a module's shared slab.
//
// The view is non-owning and cached per context, so repeated calls hand back the
// same ArrayBuffer rather than aliasing the slab N times. Writers and readers race
// by design; the contract (see rayact_module_abi.h) is plain scalars plus a
// generation counter.
JSValue jsModuleBuffer(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
  if (argc < 1) return JS_ThrowTypeError(ctx, "__rayact_module_buffer(id)");
  int32_t id = 0;
  if (JS_ToInt32(ctx, &id, argv[0]) != 0) return JS_EXCEPTION;

  BusCtx* bc = getBusCtx(ctx);
  if (!bc) return JS_ThrowInternalError(ctx, "module bus not installed on context");

  auto cached = bc->buffers.find(id);
  if (cached != bc->buffers.end()) return JS_DupValue(ctx, cached->second);

  uint8_t* ptr = nullptr;
  size_t size = 0;
  {
    std::lock_guard<std::mutex> lk(g_bufMtx);
    auto it = g_buffers.find(id);
    if (it == g_buffers.end() || it->second.dropped)
      return JS_ThrowReferenceError(ctx, "shared buffer %d not available", (int)id);
    ptr = it->second.bytes.data();
    size = it->second.bytes.size();
    it->second.views++;
  }

  JSValue buf = JS_NewArrayBuffer(ctx, ptr, size, nullptr, nullptr, false);
  bc->buffers[id] = JS_DupValue(ctx, buf);
  return buf;
}

// __rayact_invoke_slab() → id of this context's sync-invoke slab (created on
// first use). JS maps it once via __rayact_module_buffer(id) and reuses the
// view for every __rayact_invoke_shared call.
JSValue jsInvokeSlab(JSContext* ctx, JSValue, int, JSValueConst*) {
  BusCtx* bc = getBusCtx(ctx);
  if (!bc) return JS_ThrowInternalError(ctx, "module bus not installed on context");
  if (bc->invokeSlabId == 0) {
    void* ptr = nullptr;
    bc->invokeSlabId = hostSharedBufferCreate(kInvokeSlabBytes, &ptr);
    if (bc->invokeSlabId < 0) {
      bc->invokeSlabId = 0;
      return JS_ThrowInternalError(ctx, "invoke slab allocation failed");
    }
  }
  return JS_NewInt32(ctx, bc->invokeSlabId);
}

// __rayact_invoke_shared(name, method, argByteLen) → resultByteLen.
// Args are read in place from the invoke slab and the result is written back
// into it — the only per-call copy left is the module writing its own out
// buffer. A result larger than the slab is stashed on the context and
// signalled as a negative length; JS fetches it via __rayact_invoke_take().
JSValue jsInvokeShared(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
  if (argc < 3)
    return JS_ThrowTypeError(ctx, "__rayact_invoke_shared(name, method, argByteLen)");
  BusCtx* bc = getBusCtx(ctx);
  if (!bc || bc->invokeSlabId == 0)
    return JS_ThrowInternalError(ctx, "invoke slab not initialized");
  const char* n = JS_ToCString(ctx, argv[0]);
  const char* m = JS_ToCString(ctx, argv[1]);
  if (!n || !m) {
    if (n) JS_FreeCString(ctx, n);
    if (m) JS_FreeCString(ctx, m);
    return JS_EXCEPTION;
  }
  std::string name = n, method = m;
  JS_FreeCString(ctx, n);
  JS_FreeCString(ctx, m);
  int64_t argLen = 0;
  JS_ToInt64(ctx, &argLen, argv[2]);
  size_t slabSize = 0;
  uint8_t* slab = (uint8_t*)hostSharedBufferPtr(bc->invokeSlabId, &slabSize);
  if (!slab || argLen < 0 || (size_t)argLen > slabSize)
    return JS_ThrowRangeError(ctx, "invoke slab args out of range");

  std::string out;
  int err = 0;
  if (!busInvokeBytes(name, method, slab, (size_t)argLen, out, &err)) {
    if (err == kBusNoModule)
      return JS_ThrowReferenceError(
          ctx, "rayact module '%s' not available — install the plugin", name.c_str());
    return JS_ThrowInternalError(ctx, "module '%s'.%s failed (%d)", name.c_str(),
                                 method.c_str(), err);
  }
  if (out.size() <= slabSize) {
    if (!out.empty()) memcpy(slab, out.data(), out.size());
    return JS_NewInt64(ctx, (int64_t)out.size());
  }
  bc->overflow = std::move(out);
  return JS_NewInt64(ctx, -(int64_t)bc->overflow.size());
}

// __rayact_invoke_take() → ArrayBuffer copy of the stashed overflow result.
JSValue jsInvokeTake(JSContext* ctx, JSValue, int, JSValueConst*) {
  BusCtx* bc = getBusCtx(ctx);
  if (!bc) return JS_ThrowInternalError(ctx, "module bus not installed on context");
  JSValue ab = makeArrayBuffer(ctx, bc->overflow);
  bc->overflow.clear();
  bc->overflow.shrink_to_fit();
  return ab;
}

// Detach any view whose slab the owning module has dropped, then let the slab go.
void reapDroppedBuffers(JSContext* ctx, BusCtx* bc) {
  if (bc->buffers.empty()) return;
  for (auto it = bc->buffers.begin(); it != bc->buffers.end();) {
    bool dropped = false;
    {
      std::lock_guard<std::mutex> lk(g_bufMtx);
      auto slab = g_buffers.find(it->first);
      dropped = (slab == g_buffers.end()) || slab->second.dropped;
    }
    if (!dropped) {
      ++it;
      continue;
    }
    JS_DetachArrayBuffer(ctx, it->second);
    JS_FreeValue(ctx, it->second);
    {
      std::lock_guard<std::mutex> lk(g_bufMtx);
      auto slab = g_buffers.find(it->first);
      if (slab != g_buffers.end()) {
        if (slab->second.views > 0) slab->second.views--;
        reapSlabLocked(slab);
      }
    }
    it = bc->buffers.erase(it);
  }
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
  JS_SetPropertyStr(ctx, global, "__rayact_module_buffer",
                    JS_NewCFunction(ctx, jsModuleBuffer, "__rayact_module_buffer", 1));
  JS_SetPropertyStr(ctx, global, "__rayact_invoke_slab",
                    JS_NewCFunction(ctx, jsInvokeSlab, "__rayact_invoke_slab", 0));
  JS_SetPropertyStr(ctx, global, "__rayact_invoke_shared",
                    JS_NewCFunction(ctx, jsInvokeShared, "__rayact_invoke_shared", 3));
  JS_SetPropertyStr(ctx, global, "__rayact_invoke_take",
                    JS_NewCFunction(ctx, jsInvokeTake, "__rayact_invoke_take", 0));
}

void drainModuleEvents(JSContext* ctx) {
  BusCtx* bc = getBusCtx(ctx);
  if (!bc) return;
  reapDroppedBuffers(ctx, bc);
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
  // Release this context's shared-buffer views; the slabs outlive the context
  // unless their module already dropped them, in which case the last release frees.
  for (auto& [id, buf] : bc->buffers) {
    JS_DetachArrayBuffer(ctx, buf);
    JS_FreeValue(ctx, buf);
    std::lock_guard<std::mutex> lk(g_bufMtx);
    auto slab = g_buffers.find(id);
    if (slab != g_buffers.end()) {
      if (slab->second.views > 0) slab->second.views--;
      reapSlabLocked(slab);
    }
  }
  // The invoke slab is context-owned — drop it (frees once the view detach
  // above released the last reference).
  if (bc->invokeSlabId != 0) hostSharedBufferDrop(bc->invokeSlabId);
  delete bc;
}

} // namespace rayact
