#include "worker_js.hpp"
#include "worker_queue.hpp"
#include "workers.hpp"
#ifndef RAYACT_PLATFORM_NET_BACKEND
#include "net.hpp"
#endif
#include "async_storage.hpp"
#include "module_bus.hpp"
#ifndef RAYACT_NO_TS
#include "utils/TypeStripper.h"
#endif
#include "raylib.h"

extern "C" {
#include "quickjs.h"
#include "quickjs-libc.h"
}

#include <cstdio>
#include <cstring>
#include <string>
#include <memory>
#include <thread>
#include <unordered_map>
#include <vector>
#include <chrono>

#if defined(__ANDROID__)
#include <android/log.h>
#define WORKER_LOG_E(...) __android_log_print(ANDROID_LOG_ERROR, "RayactWorker", __VA_ARGS__)
#else
#define WORKER_LOG_E(...) do { fprintf(stderr, __VA_ARGS__); fprintf(stderr, "\n"); } while (0)
#endif

// ── Per-worker GIF storage ────────────────────────────────────────────────────

struct GifData {
    Image img;
    int   frameCount;
    int   w, h;
};

// ── Context opaque ────────────────────────────────────────────────────────────

// One pending setTimeout/setInterval registration.
struct WorkerTimer {
    int     id;
    double  due;        // steady-clock ms
    double  interval;   // < 0 → one-shot
    JSValue fn;
};

struct JSWorkerCtx {
    int                          workerId;
    std::shared_ptr<WorkerEntry> entry;
    std::unordered_map<int, GifData> gifs;
    int                          nextGifId = 0;
    std::vector<WorkerTimer>     timers;
    int                          nextTimerId = 1;
};

static double workerNowMs() {
    using namespace std::chrono;
    return (double)duration_cast<microseconds>(
               steady_clock::now().time_since_epoch()).count() / 1000.0;
}

// Milliseconds until the earliest timer fires; -1 when none pending.
static int64_t workerNextTimerDelayMs(JSWorkerCtx* wctx) {
    if (wctx->timers.empty()) return -1;
    double now = workerNowMs();
    double best = -1;
    for (auto& t : wctx->timers) {
        double d = t.due - now;
        if (d < 0) d = 0;
        if (best < 0 || d < best) best = d;
    }
    return (int64_t)best;
}

static void workerFireDueTimers(JSContext* ctx, JSWorkerCtx* wctx) {
    // Snapshot due ids first — callbacks may add/clear timers.
    double now = workerNowMs();
    std::vector<int> due;
    for (auto& t : wctx->timers)
        if (t.due <= now) due.push_back(t.id);
    for (int id : due) {
        JSValue fn = JS_UNDEFINED;
        bool repeat = false;
        for (auto& t : wctx->timers) {
            if (t.id != id) continue;
            fn = JS_DupValue(ctx, t.fn);
            if (t.interval >= 0) { t.due = now + t.interval; repeat = true; }
            break;
        }
        if (JS_IsUndefined(fn)) continue;  // cleared by an earlier callback
        if (!repeat) {
            for (size_t i = 0; i < wctx->timers.size(); i++) {
                if (wctx->timers[i].id == id) {
                    JS_FreeValue(ctx, wctx->timers[i].fn);
                    wctx->timers.erase(wctx->timers.begin() + (long)i);
                    break;
                }
            }
        }
        JSValue r = JS_Call(ctx, fn, JS_UNDEFINED, 0, nullptr);
        if (JS_IsException(r)) {
            JSValue exc = JS_GetException(ctx);
            const char* s = JS_ToCString(ctx, exc);
            WORKER_LOG_E("[worker %d] timer error: %s", wctx->workerId, s ? s : "?");
            if (s) JS_FreeCString(ctx, s);
            JS_FreeValue(ctx, exc);
        }
        JS_FreeValue(ctx, r);
        JS_FreeValue(ctx, fn);
    }
}

static JSValue js_worker_setTimer(JSContext* ctx, int argc, JSValueConst* argv,
                                  bool repeating) {
    JSWorkerCtx* wctx = (JSWorkerCtx*)JS_GetContextOpaque(ctx);
    if (!wctx || argc < 1 || !JS_IsFunction(ctx, argv[0]))
        return JS_ThrowTypeError(ctx, "setTimeout/setInterval: expected (fn, ms?)");
    double ms = 0;
    if (argc >= 2) JS_ToFloat64(ctx, &ms, argv[1]);
    if (!(ms >= 0)) ms = 0;
    WorkerTimer t;
    t.id = wctx->nextTimerId++;
    t.due = workerNowMs() + ms;
    t.interval = repeating ? ms : -1.0;
    t.fn = JS_DupValue(ctx, argv[0]);
    wctx->timers.push_back(t);
    return JS_NewInt32(ctx, t.id);
}

static JSValue js_worker_setTimeout(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    return js_worker_setTimer(ctx, argc, argv, false);
}
static JSValue js_worker_setInterval(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    return js_worker_setTimer(ctx, argc, argv, true);
}
static JSValue js_worker_clearTimer(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    JSWorkerCtx* wctx = (JSWorkerCtx*)JS_GetContextOpaque(ctx);
    if (!wctx || argc < 1) return JS_UNDEFINED;
    int32_t id = 0;
    JS_ToInt32(ctx, &id, argv[0]);
    for (size_t i = 0; i < wctx->timers.size(); i++) {
        if (wctx->timers[i].id == id) {
            JS_FreeValue(ctx, wctx->timers[i].fn);
            wctx->timers.erase(wctx->timers.begin() + (long)i);
            break;
        }
    }
    return JS_UNDEFINED;
}

// Reads bytes out of an ArrayBuffer or TypedArray argument. Returns nullptr on
// unsupported input.
static uint8_t* workerReadBytes(JSContext* ctx, JSValueConst v, size_t* outLen) {
    size_t len = 0;
    uint8_t* data = JS_GetUint8Array(ctx, &len, v);
    if (data) { *outLen = len; return data; }
    // Clear the pending exception from the failed typed-array read
    JS_FreeValue(ctx, JS_GetException(ctx));
    data = JS_GetArrayBuffer(ctx, &len, v);
    if (data) { *outLen = len; return data; }
    JS_FreeValue(ctx, JS_GetException(ctx));
    return nullptr;
}

// presentDrawCommands(buffer) — publish a draw-command frame (worker_draw.hpp
// format). Retained: replayed every engine frame until the next present.
static JSValue js_worker_presentDrawCommands(JSContext* ctx, JSValue,
                                             int argc, JSValueConst* argv) {
    JSWorkerCtx* wctx = (JSWorkerCtx*)JS_GetContextOpaque(ctx);
    if (!wctx || argc < 1)
        return JS_ThrowTypeError(ctx, "presentDrawCommands: expected (buffer)");
    size_t len = 0;
    uint8_t* data = workerReadBytes(ctx, argv[0], &len);
    if (!data)
        return JS_ThrowTypeError(ctx, "presentDrawCommands: expected ArrayBuffer/TypedArray");
    workerPresentDrawCommands(wctx->entry, data, len);
    return JS_UNDEFINED;
}

// flushNodeCommands(buffer) — queue a raym3 node mutation stream (same binary
// protocol as the main thread's command buffer) for application on the JS
// pump. The tree roots under this worker's view node.
static JSValue js_worker_flushNodeCommands(JSContext* ctx, JSValue,
                                           int argc, JSValueConst* argv) {
    JSWorkerCtx* wctx = (JSWorkerCtx*)JS_GetContextOpaque(ctx);
    if (!wctx || argc < 1)
        return JS_ThrowTypeError(ctx, "flushNodeCommands: expected (buffer)");
    size_t len = 0;
    uint8_t* data = workerReadBytes(ctx, argv[0], &len);
    if (!data)
        return JS_ThrowTypeError(ctx, "flushNodeCommands: expected ArrayBuffer/TypedArray");
    workerPostNodeCommands(wctx->workerId,
                           std::string(reinterpret_cast<const char*>(data), len));
    return JS_UNDEFINED;
}

// ── Interrupt handler — lets main thread stop a JS worker mid-loop ────────────

static int workerInterruptHandler(JSRuntime*, void* opaque) {
    auto* entry = static_cast<WorkerEntry*>(opaque);
    return entry->stop.load() ? 1 : 0;
}

// ── postMessage(data) — worker → main ────────────────────────────────────────

static JSValue js_worker_postMessage(JSContext* ctx, JSValue,
                                     int argc, JSValueConst* argv) {
    JSWorkerCtx* wctx = (JSWorkerCtx*)JS_GetContextOpaque(ctx);
    if (!wctx || argc < 1) return JS_UNDEFINED;

    JSValue jsonVal = JS_JSONStringify(ctx, argv[0], JS_UNDEFINED, JS_UNDEFINED);
    if (JS_IsException(jsonVal)) {
        JS_FreeValue(ctx, jsonVal);
        return JS_UNDEFINED;
    }
    size_t len = 0;
    const char* str = JS_ToCStringLen(ctx, &len, jsonVal);
    if (str) {
        g_workerOutbox.push({wctx->workerId, WorkerMsgType::JSON,
                             std::string(str, len)});
        workerRequestRenderFrame();
        JS_FreeCString(ctx, str);
    }
    JS_FreeValue(ctx, jsonVal);
    return JS_UNDEFINED;
}

// ── loadGif(path) → handle ───────────────────────────────────────────────────

static JSValue js_worker_loadGif(JSContext* ctx, JSValue,
                                  int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsString(argv[0]))
        return JS_ThrowTypeError(ctx, "loadGif: expected path string");
    JSWorkerCtx* wctx = (JSWorkerCtx*)JS_GetContextOpaque(ctx);

    const char* path = JS_ToCString(ctx, argv[0]);
    int frameCount = 0;
    Image img = LoadImageAnim(path, &frameCount);
    JS_FreeCString(ctx, path);

    if (!img.data || frameCount == 0) {
        UnloadImage(img);
        return JS_ThrowTypeError(ctx, "loadGif: failed to load image");
    }

    // raylib stores img.width/height as per-frame dimensions;
    // all frames are concatenated in img.data (frameCount * w * h * 4 bytes total).
    GifData gd;
    gd.img        = img;
    gd.frameCount = frameCount;
    gd.w          = img.width;
    gd.h          = img.height;

    int id = wctx->nextGifId++;
    wctx->gifs[id] = std::move(gd);
    return JS_NewInt32(ctx, id);
}

// ── getGifInfo(handle) → {width, height, frameCount} ─────────────────────────

static JSValue js_worker_getGifInfo(JSContext* ctx, JSValue,
                                     int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    JSWorkerCtx* wctx = (JSWorkerCtx*)JS_GetContextOpaque(ctx);
    int32_t id = 0;
    JS_ToInt32(ctx, &id, argv[0]);
    auto it = wctx->gifs.find(id);
    if (it == wctx->gifs.end()) return JS_UNDEFINED;
    auto& gd = it->second;

    JSValue obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, obj, "width",      JS_NewInt32(ctx, gd.w));
    JS_SetPropertyStr(ctx, obj, "height",     JS_NewInt32(ctx, gd.h));
    JS_SetPropertyStr(ctx, obj, "frameCount", JS_NewInt32(ctx, gd.frameCount));
    return obj;
}

// ── presentGifFrame(handle, frameIndex) ──────────────────────────────────────
// Copies decoded pixels into entry->canvas and pushes CanvasReady.
// Raylib stores all GIF frames as one tall image (height = frameH * frameCount).

static JSValue js_worker_presentGifFrame(JSContext* ctx, JSValue,
                                          int argc, JSValueConst* argv) {
    if (argc < 2) return JS_UNDEFINED;
    JSWorkerCtx* wctx = (JSWorkerCtx*)JS_GetContextOpaque(ctx);
    int32_t id = 0, frameIdx = 0;
    JS_ToInt32(ctx, &id, argv[0]);
    JS_ToInt32(ctx, &frameIdx, argv[1]);

    auto it = wctx->gifs.find(id);
    if (it == wctx->gifs.end()) return JS_UNDEFINED;
    auto& gd = it->second;
    if (frameIdx < 0 || frameIdx >= gd.frameCount) return JS_UNDEFINED;

    int bpp = (gd.img.format == PIXELFORMAT_UNCOMPRESSED_R8G8B8) ? 3 : 4;
    int frameBytes = gd.w * gd.h * bpp;
    auto* src = static_cast<uint8_t*>(gd.img.data) + (size_t)frameIdx * frameBytes;

    {
        std::lock_guard<std::mutex> lk(wctx->entry->canvas.mtx);
        wctx->entry->canvas.width  = gd.w;
        wctx->entry->canvas.height = gd.h;
        wctx->entry->canvas.pixels.resize(gd.w * gd.h * 4);

        if (bpp == 4) {
            memcpy(wctx->entry->canvas.pixels.data(), src, frameBytes);
        } else {
            uint8_t* dst = wctx->entry->canvas.pixels.data();
            for (int i = 0; i < gd.w * gd.h; i++) {
                dst[i*4+0] = src[i*3+0];
                dst[i*4+1] = src[i*3+1];
                dst[i*4+2] = src[i*3+2];
                dst[i*4+3] = 255;
            }
        }
    }

    g_workerOutbox.push({wctx->workerId, WorkerMsgType::CanvasReady,
                         "", 0.0, gd.w, gd.h});
    workerRequestRenderFrame();
    return JS_UNDEFINED;
}

// ── workerSleep(ms) ───────────────────────────────────────────────────────────

static JSValue js_worker_sleep(JSContext* ctx, JSValue,
                                int argc, JSValueConst* argv) {
    double ms = 100.0;
    if (argc >= 1) JS_ToFloat64(ctx, &ms, argv[0]);
    if (ms > 0) {
        JSWorkerCtx* wctx = (JSWorkerCtx*)JS_GetContextOpaque(ctx);
        // Interruptible: wake_all() during shutdown unblocks this immediately
        wctx->entry->inbox.sleep((int64_t)ms, wctx->entry->stop);
    }
    // Drain network + module-bus events and resolve any pending Promises
#ifndef RAYACT_PLATFORM_NET_BACKEND
    drainNetEvents(ctx);
#endif
    rayact::drainModuleEvents(ctx);
    JSContext* pctx = nullptr;
    while (JS_ExecutePendingJob(JS_GetRuntime(ctx), &pctx) > 0) {}
    return JS_UNDEFINED;
}

// ── Worker thread ─────────────────────────────────────────────────────────────

static void runJSWorkerThread(int workerId,
                               std::string filePath,
                               std::string initialDataJSON,
                               std::shared_ptr<WorkerEntry> entry) {
    JSRuntime* rt = JS_NewRuntime();
    if (!rt) {
        WORKER_LOG_E("[worker %d] failed to create JSRuntime", workerId);
        return;
    }
    js_std_init_handlers(rt);

    // Allow main thread to interrupt infinite JS loops (e.g. GIF animation)
    JS_SetInterruptHandler(rt, workerInterruptHandler, entry.get());

    JSContext* ctx = JS_NewContext(rt);
    if (!ctx) {
        WORKER_LOG_E("[worker %d] failed to create JSContext", workerId);
        js_std_free_handlers(rt);
        JS_FreeRuntime(rt);
        return;
    }

    JSWorkerCtx wctx{workerId, entry, {}, 0};
    JS_SetContextOpaque(ctx, &wctx);

    // Network bindings (fetch, EventSource, WebSocket) — same API as main thread
#ifndef RAYACT_PLATFORM_NET_BACKEND
    registerNetBindings(ctx);
#endif

    // Inject all worker globals in one pass
    JSValue global = JS_GetGlobalObject(ctx);

    // Storage + module bus — same singleton store the main thread sees
    rayact::installAsyncStorage(ctx, global);
    rayact::installModuleBindings(ctx, global);
    JS_SetPropertyStr(ctx, global, "postMessage",
        JS_NewCFunction(ctx, js_worker_postMessage,    "postMessage",    1));
    JS_SetPropertyStr(ctx, global, "loadGif",
        JS_NewCFunction(ctx, js_worker_loadGif,        "loadGif",        1));
    JS_SetPropertyStr(ctx, global, "getGifInfo",
        JS_NewCFunction(ctx, js_worker_getGifInfo,     "getGifInfo",     1));
    JS_SetPropertyStr(ctx, global, "presentGifFrame",
        JS_NewCFunction(ctx, js_worker_presentGifFrame,"presentGifFrame",2));
    JS_SetPropertyStr(ctx, global, "workerSleep",
        JS_NewCFunction(ctx, js_worker_sleep,          "workerSleep",    1));
    JS_SetPropertyStr(ctx, global, "presentDrawCommands",
        JS_NewCFunction(ctx, js_worker_presentDrawCommands, "presentDrawCommands", 1));
    JS_SetPropertyStr(ctx, global, "flushNodeCommands",
        JS_NewCFunction(ctx, js_worker_flushNodeCommands,   "flushNodeCommands",   1));
    JS_SetPropertyStr(ctx, global, "setTimeout",
        JS_NewCFunction(ctx, js_worker_setTimeout,     "setTimeout",     2));
    JS_SetPropertyStr(ctx, global, "setInterval",
        JS_NewCFunction(ctx, js_worker_setInterval,    "setInterval",    2));
    JS_SetPropertyStr(ctx, global, "clearTimeout",
        JS_NewCFunction(ctx, js_worker_clearTimer,     "clearTimeout",   1));
    JS_SetPropertyStr(ctx, global, "clearInterval",
        JS_NewCFunction(ctx, js_worker_clearTimer,     "clearInterval",  1));
    {
        // Browser-shaped worker globals must exist before the bundled worker is
        // evaluated. An imported JS shim is too late for dependencies whose
        // module initializers read navigator/window while the bundle boots
        // (xterm-headless does this).
        static const char* workerEnvironment =
            "globalThis.self = globalThis;"
            "globalThis.window = globalThis;"
            "globalThis.navigator = globalThis.navigator || { userAgent: 'rayact-worker', platform: 'Android' };"
            "globalThis.performance = globalThis.performance || { now: function(){ return Date.now(); } };"
            "globalThis.queueMicrotask = function(fn) { Promise.resolve().then(fn); };";
        JSValue r = JS_Eval(ctx, workerEnvironment, strlen(workerEnvironment),
                            "worker-environment.js", JS_EVAL_TYPE_GLOBAL);
        if (JS_IsException(r)) JS_FreeValue(ctx, JS_GetException(ctx));
        JS_FreeValue(ctx, r);
    }

    // Inject initialData
    if (!initialDataJSON.empty() && initialDataJSON != "null") {
        JSValue initData = JS_ParseJSON(ctx, initialDataJSON.c_str(),
                                        initialDataJSON.size(), "<initialData>");
        if (!JS_IsException(initData))
            JS_SetPropertyStr(ctx, global, "initialData", initData);
        else {
            JS_FreeValue(ctx, initData);
            JS_SetPropertyStr(ctx, global, "initialData",
                JS_NewString(ctx, initialDataJSON.c_str()));
        }
    } else {
        JS_SetPropertyStr(ctx, global, "initialData", JS_NULL);
    }
    JS_FreeValue(ctx, global);

    // Load source file
    FILE* f = fopen(filePath.c_str(), "r");
    if (!f) {
        WORKER_LOG_E("[worker %d] cannot open %s", workerId, filePath.c_str());
        JS_FreeContext(ctx);
        js_std_free_handlers(rt);
        JS_FreeRuntime(rt);
        return;
    }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::string src(sz, '\0');
    fread(&src[0], 1, sz, f);
    fclose(f);

    // Strip TypeScript syntax if needed
#ifndef RAYACT_NO_TS
    {
        auto dot = filePath.rfind('.');
        if (dot != std::string::npos) {
            std::string ext = filePath.substr(dot);
            if (ext == ".ts" || ext == ".tsx")
                src = Fovea::TypeStripper::Strip(src);
        }
    }
#endif

    // Evaluate script — may block indefinitely for animation loops
    JSValue result = JS_Eval(ctx, src.c_str(), src.size(),
                             filePath.c_str(), JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(ctx);
        const char* s = JS_ToCString(ctx, exc);
        // "InternalError: interrupted" is expected when stop flag fires — don't log it as an error
        bool interrupted = s && strstr(s, "interrupted");
        if (!interrupted)
            WORKER_LOG_E("[worker %d] error in %s: %s",
                         workerId, filePath.c_str(), s ? s : "?");
        if (s) JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, exc);
    }
    JS_FreeValue(ctx, result);

    // Drain pending microtasks
    JSContext* pctx = nullptr;
    while (JS_ExecutePendingJob(rt, &pctx) > 0) {}

    // Message loop — sleeps until main sends work, a timer comes due, or
    // terminate. Timers let worker code use setTimeout/setInterval (xterm.js,
    // animation loops) without spinning.
    while (!entry->stop.load()) {
        WorkerMessage incoming;
        // Cap the wait so net/module events keep flowing even with no timers.
        int64_t waitMs = workerNextTimerDelayMs(&wctx);
        if (waitMs < 0 || waitMs > 250) waitMs = 250;
        bool got = entry->inbox.wait_pop_for(incoming, entry->stop, waitMs);
        if (entry->stop.load()) break;

        if (got) {
            JSValue gobj = JS_GetGlobalObject(ctx);
            JSValue cb   = JS_GetPropertyStr(ctx, gobj, "onMessage");
            JS_FreeValue(ctx, gobj);
            if (JS_IsFunction(ctx, cb)) {
                JSValue data = JS_ParseJSON(ctx, incoming.payload.c_str(),
                                            incoming.payload.size(), "<main>");
                if (JS_IsException(data)) {
                    JS_FreeValue(ctx, data);
                    data = JS_NewString(ctx, incoming.payload.c_str());
                }
                JSValue r = JS_Call(ctx, cb, JS_UNDEFINED, 1, &data);
                if (JS_IsException(r)) {
                    JSValue exc = JS_GetException(ctx);
                    const char* s = JS_ToCString(ctx, exc);
                    WORKER_LOG_E("[worker %d] onMessage error: %s",
                                 workerId, s ? s : "?");
                    if (s) JS_FreeCString(ctx, s);
                    JS_FreeValue(ctx, exc);
                }
                JS_FreeValue(ctx, r);
                JS_FreeValue(ctx, data);
            }
            JS_FreeValue(ctx, cb);
        }

        workerFireDueTimers(ctx, &wctx);
#ifndef RAYACT_PLATFORM_NET_BACKEND
        drainNetEvents(ctx);
#endif
        rayact::drainModuleEvents(ctx);
        while (JS_ExecutePendingJob(rt, &pctx) > 0) {}
    }

    // Cleanup GIF data (CPU memory — safe from any thread)
    for (auto& [id, gd] : wctx.gifs) UnloadImage(gd.img);
    wctx.gifs.clear();
    for (auto& t : wctx.timers) JS_FreeValue(ctx, t.fn);
    wctx.timers.clear();

#ifndef RAYACT_PLATFORM_NET_BACKEND
    shutdownNetCtx(ctx); // stop any fetch/SSE/WS threads, free JS values
#endif
    rayact::shutdownModuleBus(ctx);

    JS_SetContextOpaque(ctx, nullptr);
    JS_FreeContext(ctx);
    js_std_free_handlers(rt);
    JS_FreeRuntime(rt);
    WORKER_LOG_E("[worker %d] thread exiting", workerId);
}

void spawnJSWorker(int workerId,
                   std::string filePath,
                   std::string initialDataJSON,
                   std::shared_ptr<WorkerEntry> entry) {
    entry->thread = std::thread(runJSWorkerThread,
                                workerId,
                                std::move(filePath),
                                std::move(initialDataJSON),
                                entry);
}
