#include "async_storage.hpp"

#include <map>
#include <mutex>
#include <string>

namespace rayact {

static std::mutex g_storeMutex;
static std::map<std::string, std::string> g_store;

static JSValue resolvePromise(JSContext *ctx, JSValue value) {
  JSValue resolving_funcs[2];
  JSValue promise = JS_NewPromiseCapability(ctx, resolving_funcs);
  JS_Call(ctx, resolving_funcs[0], JS_UNDEFINED, 1, &value);
  JS_FreeValue(ctx, resolving_funcs[0]);
  JS_FreeValue(ctx, resolving_funcs[1]);
  return promise;
}

static JSValue jsAsyncSetItem(JSContext *ctx, JSValue, int argc, JSValueConst *argv) {
  if (argc < 2) return JS_ThrowTypeError(ctx, "setItem(key, value) expected");
  const char *key = JS_ToCString(ctx, argv[0]);
  const char *val = JS_ToCString(ctx, argv[1]);
  if (!key || !val) {
    if (key) JS_FreeCString(ctx, key);
    if (val) JS_FreeCString(ctx, val);
    return JS_EXCEPTION;
  }
  {
    std::lock_guard<std::mutex> lock(g_storeMutex);
    g_store[key] = val;
  }
  JS_FreeCString(ctx, key);
  JS_FreeCString(ctx, val);
  return resolvePromise(ctx, JS_UNDEFINED);
}

static JSValue jsAsyncGetItem(JSContext *ctx, JSValue, int argc, JSValueConst *argv) {
  if (argc < 1) return JS_ThrowTypeError(ctx, "getItem(key) expected");
  const char *key = JS_ToCString(ctx, argv[0]);
  if (!key) return JS_EXCEPTION;
  std::string value;
  {
    std::lock_guard<std::mutex> lock(g_storeMutex);
    auto it = g_store.find(key);
    if (it != g_store.end()) value = it->second;
  }
  JS_FreeCString(ctx, key);
  JSValue result = value.empty() ? JS_NULL : JS_NewString(ctx, value.c_str());
  JSValue promise = resolvePromise(ctx, result);
  JS_FreeValue(ctx, result);
  return promise;
}

void installAsyncStorage(JSContext *ctx, JSValue global) {
  JSValue storage = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, storage, "setItem",
                    JS_NewCFunction(ctx, jsAsyncSetItem, "setItem", 2));
  JS_SetPropertyStr(ctx, storage, "getItem",
                    JS_NewCFunction(ctx, jsAsyncGetItem, "getItem", 1));
  JS_SetPropertyStr(ctx, global, "AsyncStorage", storage);
}

void shutdownAsyncStorage(JSContext *ctx) {
  (void)ctx;
  std::lock_guard<std::mutex> lock(g_storeMutex);
  g_store.clear();
}

} // namespace rayact
