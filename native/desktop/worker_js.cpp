#include "worker_js.hpp"
#include "worker_queue.hpp"
#ifndef RAYACT_NO_NET
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

// ── Per-worker GIF storage ────────────────────────────────────────────────────

struct GifData {
    Image img;
    int   frameCount;
    int   w, h;
};

// ── Context opaque ────────────────────────────────────────────────────────────

struct JSWorkerCtx {
    int                          workerId;
    std::shared_ptr<WorkerEntry> entry;
    std::unordered_map<int, GifData> gifs;
    int                          nextGifId = 0;
};

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
#ifndef RAYACT_NO_NET
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
        fprintf(stderr, "[worker %d] failed to create JSRuntime\n", workerId);
        return;
    }
    js_std_init_handlers(rt);

    // Allow main thread to interrupt infinite JS loops (e.g. GIF animation)
    JS_SetInterruptHandler(rt, workerInterruptHandler, entry.get());

    JSContext* ctx = JS_NewContext(rt);
    if (!ctx) {
        fprintf(stderr, "[worker %d] failed to create JSContext\n", workerId);
        js_std_free_handlers(rt);
        JS_FreeRuntime(rt);
        return;
    }

    JSWorkerCtx wctx{workerId, entry, {}, 0};
    JS_SetContextOpaque(ctx, &wctx);

    // Network bindings (fetch, EventSource, WebSocket) — same API as main thread
#ifndef RAYACT_NO_NET
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
        fprintf(stderr, "[worker %d] cannot open %s\n", workerId, filePath.c_str());
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
            fprintf(stderr, "[worker %d] error in %s: %s\n",
                    workerId, filePath.c_str(), s ? s : "?");
        if (s) JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, exc);
    }
    JS_FreeValue(ctx, result);

    // Drain pending microtasks
    JSContext* pctx = nullptr;
    while (JS_ExecutePendingJob(rt, &pctx) > 0) {}

    // Message loop — blocks until main sends work or terminates
    WorkerMessage incoming;
    while (!entry->stop.load() &&
           entry->inbox.wait_pop(incoming, entry->stop)) {
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
                fprintf(stderr, "[worker %d] onMessage error: %s\n",
                        workerId, s ? s : "?");
                if (s) JS_FreeCString(ctx, s);
                JS_FreeValue(ctx, exc);
            }
            JS_FreeValue(ctx, r);
            JS_FreeValue(ctx, data);

#ifndef RAYACT_NO_NET
            drainNetEvents(ctx);
#endif
            rayact::drainModuleEvents(ctx);
            while (JS_ExecutePendingJob(rt, &pctx) > 0) {}
        }
        JS_FreeValue(ctx, cb);
    }

    // Cleanup GIF data (CPU memory — safe from any thread)
    for (auto& [id, gd] : wctx.gifs) UnloadImage(gd.img);
    wctx.gifs.clear();

#ifndef RAYACT_NO_NET
    shutdownNetCtx(ctx); // stop any fetch/SSE/WS threads, free JS values
#endif
    rayact::shutdownModuleBus(ctx);

    JS_SetContextOpaque(ctx, nullptr);
    JS_FreeContext(ctx);
    js_std_free_handlers(rt);
    JS_FreeRuntime(rt);
    fprintf(stderr, "[worker %d] thread exiting\n", workerId);
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
