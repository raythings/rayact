#include "async_storage.hpp"

#include "kv_store.hpp"
#include "module_bus.hpp"

#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

namespace rayact {

static JSValue resolvePromise(JSContext *ctx, JSValue value) {
  JSValue resolving_funcs[2];
  JSValue promise = JS_NewPromiseCapability(ctx, resolving_funcs);
  JS_Call(ctx, resolving_funcs[0], JS_UNDEFINED, 1, &value);
  JS_FreeValue(ctx, resolving_funcs[0]);
  JS_FreeValue(ctx, resolving_funcs[1]);
  return promise;
}

// ─── Sync Storage (globalThis.Storage) ─────────────────────────────────────────

static JSValue jsStorageGetString(JSContext *ctx, JSValue, int argc, JSValueConst *argv) {
  if (argc < 1) return JS_ThrowTypeError(ctx, "getString(key) expected");
  const char *key = JS_ToCString(ctx, argv[0]);
  if (!key) return JS_EXCEPTION;
  std::string value;
  bool found = defaultKvStore().getString(key, value);
  JS_FreeCString(ctx, key);
  return found ? JS_NewStringLen(ctx, value.data(), value.size()) : JS_NULL;
}

static JSValue jsStorageSet(JSContext *ctx, JSValue, int argc, JSValueConst *argv) {
  if (argc < 2) return JS_ThrowTypeError(ctx, "set(key, value) expected");
  const char *key = JS_ToCString(ctx, argv[0]);
  const char *val = JS_ToCString(ctx, argv[1]);
  if (!key || !val) {
    if (key) JS_FreeCString(ctx, key);
    if (val) JS_FreeCString(ctx, val);
    return JS_EXCEPTION;
  }
  defaultKvStore().set(key, val);
  JS_FreeCString(ctx, key);
  JS_FreeCString(ctx, val);
  return JS_UNDEFINED;
}

static JSValue jsStorageDelete(JSContext *ctx, JSValue, int argc, JSValueConst *argv) {
  if (argc < 1) return JS_ThrowTypeError(ctx, "delete(key) expected");
  const char *key = JS_ToCString(ctx, argv[0]);
  if (!key) return JS_EXCEPTION;
  defaultKvStore().remove(key);
  JS_FreeCString(ctx, key);
  return JS_UNDEFINED;
}

static JSValue jsStorageGetAllKeys(JSContext *ctx, JSValue, int, JSValueConst *) {
  auto keys = defaultKvStore().keys();
  JSValue arr = JS_NewArray(ctx);
  uint32_t i = 0;
  for (auto &k : keys)
    JS_SetPropertyUint32(ctx, arr, i++, JS_NewStringLen(ctx, k.data(), k.size()));
  return arr;
}

static JSValue jsStorageClear(JSContext *ctx, JSValue, int, JSValueConst *) {
  defaultKvStore().clear();
  return JS_UNDEFINED;
}

// ─── AsyncStorage facade (Promise-wrapped, RN-familiar) ────────────────────────

static JSValue jsAsyncSetItem(JSContext *ctx, JSValue, int argc, JSValueConst *argv) {
  if (argc < 2) return JS_ThrowTypeError(ctx, "setItem(key, value) expected");
  const char *key = JS_ToCString(ctx, argv[0]);
  const char *val = JS_ToCString(ctx, argv[1]);
  if (!key || !val) {
    if (key) JS_FreeCString(ctx, key);
    if (val) JS_FreeCString(ctx, val);
    return JS_EXCEPTION;
  }
  defaultKvStore().set(key, val);
  JS_FreeCString(ctx, key);
  JS_FreeCString(ctx, val);
  return resolvePromise(ctx, JS_UNDEFINED);
}

static JSValue jsAsyncGetItem(JSContext *ctx, JSValue, int argc, JSValueConst *argv) {
  if (argc < 1) return JS_ThrowTypeError(ctx, "getItem(key) expected");
  const char *key = JS_ToCString(ctx, argv[0]);
  if (!key) return JS_EXCEPTION;
  std::string value;
  bool found = defaultKvStore().getString(key, value);
  JS_FreeCString(ctx, key);
  JSValue result = found ? JS_NewStringLen(ctx, value.data(), value.size()) : JS_NULL;
  JSValue promise = resolvePromise(ctx, result);
  JS_FreeValue(ctx, result);
  return promise;
}

static JSValue jsAsyncRemoveItem(JSContext *ctx, JSValue, int argc, JSValueConst *argv) {
  if (argc < 1) return JS_ThrowTypeError(ctx, "removeItem(key) expected");
  const char *key = JS_ToCString(ctx, argv[0]);
  if (!key) return JS_EXCEPTION;
  defaultKvStore().remove(key);
  JS_FreeCString(ctx, key);
  return resolvePromise(ctx, JS_UNDEFINED);
}

static JSValue jsAsyncGetAllKeys(JSContext *ctx, JSValue, int, JSValueConst *) {
  auto keys = defaultKvStore().keys();
  JSValue arr = JS_NewArray(ctx);
  uint32_t i = 0;
  for (auto &k : keys)
    JS_SetPropertyUint32(ctx, arr, i++, JS_NewStringLen(ctx, k.data(), k.size()));
  JSValue promise = resolvePromise(ctx, arr);
  JS_FreeValue(ctx, arr);
  return promise;
}

static JSValue jsAsyncClear(JSContext *ctx, JSValue, int, JSValueConst *) {
  defaultKvStore().clear();
  return resolvePromise(ctx, JS_UNDEFINED);
}

void installAsyncStorage(JSContext *ctx, JSValue global) {
  JSValue storage = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, storage, "getString",
                    JS_NewCFunction(ctx, jsStorageGetString, "getString", 1));
  JS_SetPropertyStr(ctx, storage, "set",
                    JS_NewCFunction(ctx, jsStorageSet, "set", 2));
  JS_SetPropertyStr(ctx, storage, "delete",
                    JS_NewCFunction(ctx, jsStorageDelete, "delete", 1));
  JS_SetPropertyStr(ctx, storage, "getAllKeys",
                    JS_NewCFunction(ctx, jsStorageGetAllKeys, "getAllKeys", 0));
  JS_SetPropertyStr(ctx, storage, "clear",
                    JS_NewCFunction(ctx, jsStorageClear, "clear", 0));
  JS_SetPropertyStr(ctx, global, "Storage", storage);

  JSValue as = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, as, "setItem",
                    JS_NewCFunction(ctx, jsAsyncSetItem, "setItem", 2));
  JS_SetPropertyStr(ctx, as, "getItem",
                    JS_NewCFunction(ctx, jsAsyncGetItem, "getItem", 1));
  JS_SetPropertyStr(ctx, as, "removeItem",
                    JS_NewCFunction(ctx, jsAsyncRemoveItem, "removeItem", 1));
  JS_SetPropertyStr(ctx, as, "getAllKeys",
                    JS_NewCFunction(ctx, jsAsyncGetAllKeys, "getAllKeys", 0));
  JS_SetPropertyStr(ctx, as, "clear",
                    JS_NewCFunction(ctx, jsAsyncClear, "clear", 0));
  JS_SetPropertyStr(ctx, global, "AsyncStorage", as);
}

void shutdownAsyncStorage(JSContext *ctx) {
  (void)ctx; // persistence is owned by the KV store (kvStoreFlushAndStop).
}

// ─── Built-in KV exposed on the module bus as "kv" ─────────────────────────────
// Module-defined raw-byte encoding:
//   get(key)      -> value bytes      (rc -1 if absent)
//   set(keyLenU32 LE + key + value)   -> empty
//   delete(key)                        -> empty
//   has(key)      -> 1 byte (0|1)
//   keys()        -> repeated (u32 LE len + key)
//   clear()                            -> empty

static uint32_t readU32LE(const uint8_t *p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) |
         ((uint32_t)p[3] << 24);
}

static RayactBytes dup(const std::string &s) {
  uint8_t *buf = (uint8_t *)malloc(s.size() ? s.size() : 1);
  if (s.size()) memcpy(buf, s.data(), s.size());
  return RayactBytes{buf, s.size()};
}

static int kvInvoke(void *, const char *method, RayactBytes args, RayactBytes *out) {
  std::string m = method ? method : "";
  auto &kv = defaultKvStore();
  if (m == "get") {
    std::string key((const char *)args.ptr, args.len), v;
    if (!kv.getString(key, v)) return -1;
    *out = dup(v);
    return 0;
  }
  if (m == "set") {
    if (args.len < 4) return -2;
    uint32_t kl = readU32LE(args.ptr);
    if (4 + kl > args.len) return -2;
    std::string key((const char *)args.ptr + 4, kl);
    std::string val((const char *)args.ptr + 4 + kl, args.len - 4 - kl);
    kv.set(key, val);
    return 0;
  }
  if (m == "delete") {
    kv.remove(std::string((const char *)args.ptr, args.len));
    return 0;
  }
  if (m == "has") {
    std::string key((const char *)args.ptr, args.len), v;
    std::string r(1, kv.getString(key, v) ? '\1' : '\0');
    *out = dup(r);
    return 0;
  }
  if (m == "keys") {
    std::string buf;
    for (auto &k : kv.keys()) {
      uint32_t kl = (uint32_t)k.size();
      char hdr[4] = {(char)(kl & 0xff), (char)((kl >> 8) & 0xff),
                     (char)((kl >> 16) & 0xff), (char)((kl >> 24) & 0xff)};
      buf.append(hdr, 4);
      buf.append(k);
    }
    *out = dup(buf);
    return 0;
  }
  if (m == "clear") {
    kv.clear();
    return 0;
  }
  return kBusNoModule;
}

static void kvRelease(void *, RayactBytes buf) { free((void *)buf.ptr); }

void registerBuiltinKvModule() {
  RayactModule mod{};
  mod.abi_version = RAYACT_MODULE_ABI_VERSION;
  mod.self = nullptr;
  mod.invoke = kvInvoke;
  mod.release = kvRelease;
  busRegister("kv", &mod);
}

} // namespace rayact
