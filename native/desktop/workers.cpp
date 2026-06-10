#include "workers.hpp"
#include "worker_js.hpp"
#include "worker_wasm.hpp"
#include "worker_native.hpp"
#include "worker_queue.hpp"
#include "raym3_bridge.hpp"

extern "C" {
#include "quickjs.h"
}

#include <raym3/v2/View.h>
#include <raym3/v2/Renderer.h>
#include "raylib.h"

#include <cstdio>
#include <cstring>
#include <cmath>
#include <string>
#include <memory>
#include <mutex>
#include <atomic>
#include <unordered_map>
#include <map>

// ── Global outbox (worker → main) ───────────────────────────────────────────
RayactMessageQueue g_workerOutbox;

// ── Worker registry ─────────────────────────────────────────────────────────
static std::atomic<int> g_nextWorkerId{1};
static std::mutex g_workerMtx;
static std::unordered_map<int, std::shared_ptr<WorkerEntry>> g_workers;

// ── Worker canvas nodes ──────────────────────────────────────────────────────
// One entry per workerId that has called createWorkerView().
struct WorkerCanvasEntry {
    int        workerId;
    int        nodeId;
    Texture2D  texture;                        // GPU texture — updated on main thread
    std::shared_ptr<Rectangle> layoutRect;     // written by render lambda, read by input
};

// workerId → canvas entry
static std::unordered_map<int, WorkerCanvasEntry> g_workerCanvases;
// raw Node* → workerId (reverse lookup for hover hit-testing)
static std::map<raym3::v2::Node*, int> g_canvasNodeToWorker;

// Input state
static int   s_lastHoveredWorker = -1;
static float s_lastMouseX = -9999.f;
static float s_lastMouseY = -9999.f;

// ── Helper: file extension ───────────────────────────────────────────────────
static std::string fileExtension(const std::string& path) {
    auto dot = path.rfind('.');
    if (dot == std::string::npos) return "";
    return path.substr(dot);
}

// ── Helper: next raym3 node ID ───────────────────────────────────────────────
// g_nodes is std::map<int,NodePtr> — largest existing key + 1 is a safe new slot.
static int nextRaym3NodeId() {
    return g_nodes.empty() ? 1 : g_nodes.rbegin()->first + 1;
}

// ── Helper: push JSON event to worker inbox ──────────────────────────────────
static void pushInputEvent(int workerId, const char* json) {
    std::shared_ptr<WorkerEntry> entry;
    {
        std::lock_guard<std::mutex> lk(g_workerMtx);
        auto it = g_workers.find(workerId);
        if (it != g_workers.end()) entry = it->second;
    }
    if (entry) entry->inbox.push({workerId, WorkerMsgType::JSON, std::string(json)});
}

// ── JS bindings ──────────────────────────────────────────────────────────────

static std::string jsStringProp(JSContext* ctx, JSValue obj, const char* key) {
    JSValue value = JS_GetPropertyStr(ctx, obj, key);
    std::string result;
    if (!JS_IsUndefined(value) && !JS_IsNull(value)) {
        const char* str = JS_ToCString(ctx, value);
        if (str) { result = str; JS_FreeCString(ctx, str); }
    }
    JS_FreeValue(ctx, value);
    return result;
}

// spawnWorker(filePath | { type, path, name }, initialData) → workerId
static JSValue JS_spawnWorker(JSContext* ctx, JSValue,
                               int argc, JSValueConst* argv) {
    if (argc < 1)
        return JS_ThrowTypeError(ctx, "spawnWorker: expected worker path or descriptor");

    std::string filePath;
    std::string workerType;
    std::string nativeName;
    if (JS_IsString(argv[0])) {
        const char* fp = JS_ToCString(ctx, argv[0]);
        if (!fp) return JS_UNDEFINED;
        filePath = fp;
        JS_FreeCString(ctx, fp);
    } else if (JS_IsObject(argv[0])) {
        workerType = jsStringProp(ctx, argv[0], "type");
        filePath = jsStringProp(ctx, argv[0], "path");
        nativeName = jsStringProp(ctx, argv[0], "name");
    } else {
        return JS_ThrowTypeError(ctx, "spawnWorker: first arg must be a file path string or descriptor");
    }

    std::string initJSON = "null";
    if (argc >= 2 && !JS_IsUndefined(argv[1]) && !JS_IsNull(argv[1])) {
        JSValue j = JS_JSONStringify(ctx, argv[1], JS_UNDEFINED, JS_UNDEFINED);
        if (!JS_IsException(j)) {
            size_t len = 0;
            const char* s = JS_ToCStringLen(ctx, &len, j);
            if (s) { initJSON = std::string(s, len); JS_FreeCString(ctx, s); }
            JS_FreeValue(ctx, j);
        } else { JS_FreeValue(ctx, j); }
    }

    if (workerType == "native") {
        if (nativeName.empty()) nativeName = filePath;
        if (nativeName.empty())
            return JS_ThrowTypeError(ctx, "spawnWorker: native workers require a name");
        if (!hasNativeWorker(nativeName))
            return JS_ThrowTypeError(ctx, "spawnWorker: unknown native worker '%s'", nativeName.c_str());

        int id = g_nextWorkerId.fetch_add(1);
        auto entry = std::make_shared<WorkerEntry>();
        entry->workerId = id;
        {
            std::lock_guard<std::mutex> lk(g_workerMtx);
            g_workers[id] = entry;
        }
        spawnNativeWorker(id, std::move(nativeName), std::move(initJSON), entry);
        return JS_NewInt32(ctx, id);
    }

    std::string ext = fileExtension(filePath);
    bool isWasm = (ext == ".wasm");
    bool isJS   = (ext == ".js" || ext == ".ts" || ext == ".jsx" ||
                   ext == ".tsx" || ext == ".jsc");

    if (!isWasm && !isJS)
        return JS_ThrowTypeError(ctx,
            "spawnWorker: unsupported file type (.js/.ts/.jsx/.tsx/.wasm)");

    int id = g_nextWorkerId.fetch_add(1);
    auto entry = std::make_shared<WorkerEntry>();
    entry->workerId = id;
    {
        std::lock_guard<std::mutex> lk(g_workerMtx);
        g_workers[id] = entry;
    }

    if (isWasm)
        spawnWASMWorker(id, std::move(filePath), std::move(initJSON), entry);
    else
        spawnJSWorker(id, std::move(filePath), std::move(initJSON), entry);

    return JS_NewInt32(ctx, id);
}

// postToWorker(workerId, data)
static JSValue JS_postToWorker(JSContext* ctx, JSValue,
                                int argc, JSValueConst* argv) {
    if (argc < 2) return JS_UNDEFINED;
    int32_t id = 0;
    JS_ToInt32(ctx, &id, argv[0]);

    std::shared_ptr<WorkerEntry> entry;
    {
        std::lock_guard<std::mutex> lk(g_workerMtx);
        auto it = g_workers.find(id);
        if (it == g_workers.end())
            return JS_ThrowRangeError(ctx, "postToWorker: unknown workerId %d", id);
        entry = it->second;
    }

    std::string payload = "null";
    JSValue j = JS_JSONStringify(ctx, argv[1], JS_UNDEFINED, JS_UNDEFINED);
    if (!JS_IsException(j)) {
        size_t len = 0;
        const char* s = JS_ToCStringLen(ctx, &len, j);
        if (s) { payload = std::string(s, len); JS_FreeCString(ctx, s); }
        JS_FreeValue(ctx, j);
    } else { JS_FreeValue(ctx, j); }

    entry->inbox.push({id, WorkerMsgType::JSON, std::move(payload)});
    return JS_UNDEFINED;
}

// terminateWorker(workerId)
static JSValue JS_terminateWorker(JSContext* ctx, JSValue,
                                   int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    int32_t id = 0;
    JS_ToInt32(ctx, &id, argv[0]);

    std::shared_ptr<WorkerEntry> entry;
    {
        std::lock_guard<std::mutex> lk(g_workerMtx);
        auto it = g_workers.find(id);
        if (it == g_workers.end()) return JS_UNDEFINED;
        entry = it->second;
        g_workers.erase(it);
    }

    entry->stop.store(true);
    entry->inbox.wake_all();
    if (entry->thread.joinable()) entry->thread.join();

    // Clean up canvas node (OpenGL must be on main thread — we are)
    auto cit = g_workerCanvases.find(id);
    if (cit != g_workerCanvases.end()) {
        UnloadTexture(cit->second.texture);
        g_canvasNodeToWorker.erase(g_nodes[cit->second.nodeId].get());
        g_nodes.erase(cit->second.nodeId);
        g_workerCanvases.erase(cit);
    }

    if (s_lastHoveredWorker == id) s_lastHoveredWorker = -1;
    return JS_UNDEFINED;
}

// createWorkerView(workerId, width, height, styleObj?) → nodeId
//
// Creates a raym3 Custom node backed by a Texture2D that the named worker
// fills via sys_present_canvas. The node participates in normal Yoga layout
// and receives input events routed to the worker's inbox.
//
// Must be called after initRaylib() (OpenGL context required for Texture2D).
static JSValue JS_createWorkerView(JSContext* ctx, JSValue,
                                    int argc, JSValueConst* argv) {
    if (argc < 3)
        return JS_ThrowTypeError(ctx,
            "createWorkerView: expected (workerId, width, height, styleObj?)");

    int32_t workerId = 0, w = 0, h = 0;
    JS_ToInt32(ctx, &workerId, argv[0]);
    JS_ToInt32(ctx, &w, argv[1]);
    JS_ToInt32(ctx, &h, argv[2]);

    if (w <= 0 || h <= 0)
        return JS_ThrowRangeError(ctx, "createWorkerView: width/height must be > 0");

    std::shared_ptr<WorkerEntry> entry;
    {
        std::lock_guard<std::mutex> lk(g_workerMtx);
        auto it = g_workers.find(workerId);
        if (it == g_workers.end())
            return JS_ThrowRangeError(ctx,
                "createWorkerView: unknown workerId %d", workerId);
        entry = it->second;
    }

    if (!IsWindowReady())
        return JS_ThrowTypeError(ctx,
            "createWorkerView: call after initRaylib()");

    // Allocate blank RGBA texture
    Image blank = GenImageColor(w, h, {0, 0, 0, 255});
    Texture2D tex = LoadTextureFromImage(blank);
    UnloadImage(blank);
    SetTextureFilter(tex, TEXTURE_FILTER_BILINEAR);

    // Shared layout rect — render lambda writes it, onPress/hover reads it
    auto layoutRect = std::make_shared<Rectangle>(Rectangle{0.f, 0.f, (float)w, (float)h});

    // ViewProps: sets the Yoga layout dimensions so the node sizes itself correctly
    raym3::v2::ViewProps props;
    props.style.width  = (float)w;
    props.style.height = (float)h;

    // Capture tex by value — UpdateTexture mutates GPU data for the same ID in-place
    Texture2D capturedTex = tex;
    auto node = raym3::v2::Custom(props,
        [capturedTex, layoutRect](Rectangle layout) {
            *layoutRect = layout;
            Rectangle src{0.f, 0.f, (float)capturedTex.width, (float)capturedTex.height};
            DrawTexturePro(capturedTex, src, layout, {0.f, 0.f}, 0.f, WHITE);
        }
    );

    // Wire press → worker inbox with relative coordinates
    node->onPress = [workerId, layoutRect, entry]() {
        Vector2 mouse = GetMousePosition();
        float relX = mouse.x - layoutRect->x;
        float relY = mouse.y - layoutRect->y;
        char buf[128];
        snprintf(buf, sizeof(buf),
            "{\"type\":\"click\",\"x\":%.2f,\"y\":%.2f}",
            (double)relX, (double)relY);
        entry->inbox.push({workerId, WorkerMsgType::JSON, std::string(buf)});
    };

    int nodeId = nextRaym3NodeId();
    g_nodes[nodeId] = node;

    // Register canvas entry
    WorkerCanvasEntry ce;
    ce.workerId   = workerId;
    ce.nodeId     = nodeId;
    ce.texture    = tex;
    ce.layoutRect = layoutRect;
    g_workerCanvases[workerId] = std::move(ce);
    g_canvasNodeToWorker[node.get()] = workerId;

    return JS_NewInt32(ctx, nodeId);
}

// ── Main-thread outbox drain (called each frame) ─────────────────────────────
void drainWorkerOutbox(JSContext* ctx) {
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue cb     = JS_GetPropertyStr(ctx, global, "onWorkerMessage");
    JS_FreeValue(ctx, global);

    WorkerMessage msg;
    while (g_workerOutbox.pop(msg)) {

        // Canvas frame — update the Custom node's GPU texture
        if (msg.type == WorkerMsgType::CanvasReady) {
            auto cit = g_workerCanvases.find(msg.workerId);
            if (cit != g_workerCanvases.end()) {
                std::shared_ptr<WorkerEntry> entry;
                {
                    std::lock_guard<std::mutex> lk(g_workerMtx);
                    auto it = g_workers.find(msg.workerId);
                    if (it != g_workers.end()) entry = it->second;
                }
                if (entry) {
                    std::lock_guard<std::mutex> lk(entry->canvas.mtx);
                    Texture2D& tex = cit->second.texture;
                    if ((int)entry->canvas.pixels.size() ==
                            tex.width * tex.height * 4) {
                        UpdateTexture(tex, entry->canvas.pixels.data());
                    }
                }
            }
        }

        if (!JS_IsFunction(ctx, cb)) continue;

        JSValue jsId   = JS_NewInt32(ctx, msg.workerId);
        JSValue jsData = JS_UNDEFINED;

        switch (msg.type) {
            case WorkerMsgType::JSON:
            case WorkerMsgType::String:
                jsData = JS_ParseJSON(ctx, msg.payload.c_str(),
                                      msg.payload.size(), "<worker>");
                if (JS_IsException(jsData)) {
                    JS_FreeValue(ctx, jsData);
                    jsData = JS_NewString(ctx, msg.payload.c_str());
                }
                break;
            case WorkerMsgType::Primitive:
                jsData = JS_NewFloat64(ctx, msg.numericValue);
                break;
            case WorkerMsgType::CanvasReady: {
                jsData = JS_NewObject(ctx);
                JS_SetPropertyStr(ctx, jsData, "type",
                                  JS_NewString(ctx, "canvas"));
                JS_SetPropertyStr(ctx, jsData, "width",
                                  JS_NewInt32(ctx, msg.canvasWidth));
                JS_SetPropertyStr(ctx, jsData, "height",
                                  JS_NewInt32(ctx, msg.canvasHeight));
                break;
            }
        }

        JSValue args[2] = {jsId, jsData};
        JSValue r = JS_Call(ctx, cb, JS_UNDEFINED, 2, args);
        if (JS_IsException(r)) {
            JSValue exc = JS_GetException(ctx);
            const char* s = JS_ToCString(ctx, exc);
            fprintf(stderr, "[workers] onWorkerMessage error: %s\n", s ? s : "?");
            if (s) JS_FreeCString(ctx, s);
            JS_FreeValue(ctx, exc);
        }
        JS_FreeValue(ctx, r);
        JS_FreeValue(ctx, jsId);
        JS_FreeValue(ctx, jsData);
    }

    JS_FreeValue(ctx, cb);
}

// ── Input event routing (called each frame after raym3 Render) ───────────────
void processWorkerInputEvents(float mouseX, float mouseY,
                              bool mousePressed, bool mouseReleased,
                              bool mouseDown) {
    if (!g_root || g_canvasNodeToWorker.empty()) return;

    // Hit-test against the full raym3 tree
    Vector2 mouse{mouseX, mouseY};
    auto hit = raym3::v2::HitTest(g_root, mouse);

    int hoveredWorker = -1;
    if (hit) {
        auto it = g_canvasNodeToWorker.find(hit.get());
        if (it != g_canvasNodeToWorker.end())
            hoveredWorker = it->second;
    }

    const bool mouseMoved = (fabsf(mouseX - s_lastMouseX) > 0.5f ||
                             fabsf(mouseY - s_lastMouseY) > 0.5f);

    // ── Hover enter / leave ──────────────────────────────────────────────────
    if (hoveredWorker != s_lastHoveredWorker) {
        if (s_lastHoveredWorker >= 0) {
            pushInputEvent(s_lastHoveredWorker, "{\"type\":\"mouseLeave\"}");
        }
        if (hoveredWorker >= 0) {
            auto& ce = g_workerCanvases[hoveredWorker];
            float relX = mouseX - ce.layoutRect->x;
            float relY = mouseY - ce.layoutRect->y;
            char buf[128];
            snprintf(buf, sizeof(buf),
                "{\"type\":\"mouseEnter\",\"x\":%.2f,\"y\":%.2f}",
                (double)relX, (double)relY);
            pushInputEvent(hoveredWorker, buf);
        }
        s_lastHoveredWorker = hoveredWorker;
    }

    if (hoveredWorker < 0) {
        s_lastMouseX = mouseX;
        s_lastMouseY = mouseY;
        return;
    }

    auto& ce = g_workerCanvases[hoveredWorker];
    float relX = mouseX - ce.layoutRect->x;
    float relY = mouseY - ce.layoutRect->y;

    // ── Mouse move (throttled to actual movement) ────────────────────────────
    if (mouseMoved) {
        char buf[128];
        snprintf(buf, sizeof(buf),
            "{\"type\":\"mouseMove\",\"x\":%.2f,\"y\":%.2f}",
            (double)relX, (double)relY);
        pushInputEvent(hoveredWorker, buf);
    }

    // ── Mouse down ───────────────────────────────────────────────────────────
    if (mousePressed) {
        char buf[128];
        snprintf(buf, sizeof(buf),
            "{\"type\":\"mouseDown\",\"x\":%.2f,\"y\":%.2f}",
            (double)relX, (double)relY);
        pushInputEvent(hoveredWorker, buf);
    }

    // ── Mouse up / click ─────────────────────────────────────────────────────
    // raym3 onPress fires on release and already pushes "click" — no duplicate here.
    // But send a mouseUp for workers that track button state independently.
    if (mouseReleased) {
        char buf[128];
        snprintf(buf, sizeof(buf),
            "{\"type\":\"mouseUp\",\"x\":%.2f,\"y\":%.2f}",
            (double)relX, (double)relY);
        pushInputEvent(hoveredWorker, buf);
    }

    // ── Drag (mouse move while held) ─────────────────────────────────────────
    if (mouseDown && mouseMoved) {
        float dx = mouseX - s_lastMouseX;
        float dy = mouseY - s_lastMouseY;
        char buf[192];
        snprintf(buf, sizeof(buf),
            "{\"type\":\"drag\",\"x\":%.2f,\"y\":%.2f,\"dx\":%.2f,\"dy\":%.2f}",
            (double)relX, (double)relY, (double)dx, (double)dy);
        pushInputEvent(hoveredWorker, buf);
    }

    s_lastMouseX = mouseX;
    s_lastMouseY = mouseY;
}

// ── Public API ───────────────────────────────────────────────────────────────

void registerWorkerBindings(JSContext* ctx) {
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "spawnWorker",
        JS_NewCFunction(ctx, JS_spawnWorker,      "spawnWorker",      2));
    JS_SetPropertyStr(ctx, global, "postToWorker",
        JS_NewCFunction(ctx, JS_postToWorker,     "postToWorker",     2));
    JS_SetPropertyStr(ctx, global, "terminateWorker",
        JS_NewCFunction(ctx, JS_terminateWorker,  "terminateWorker",  1));
    JS_SetPropertyStr(ctx, global, "createWorkerView",
        JS_NewCFunction(ctx, JS_createWorkerView, "createWorkerView", 4));
    JS_SetPropertyStr(ctx, global, "onWorkerMessage", JS_UNDEFINED);

    // Web-standard Worker(url) wrapper over spawnWorker/postToWorker.
    static const char *workerClassSrc =
        "globalThis.Worker = class Worker {"
        "  constructor(url, opts) {"
        "    const desc = (opts && opts.type) ? { type: opts.type, path: url } : url;"
        "    this._id = spawnWorker(desc);"
        "    this.onmessage = null;"
        "    const prev = globalThis.onWorkerMessage;"
        "    globalThis.onWorkerMessage = (id, data) => {"
        "      if (prev) prev(id, data);"
        "      if (id === this._id && this.onmessage) this.onmessage({ data });"
        "    };"
        "  }"
        "  postMessage(data) { postToWorker(this._id, data); }"
        "  terminate() { terminateWorker(this._id); }"
        "};";
    JSValue err = JS_Eval(ctx, workerClassSrc, strlen(workerClassSrc), "worker.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(err)) JS_FreeValue(ctx, JS_GetException(ctx));
    else JS_FreeValue(ctx, err);

    JS_FreeValue(ctx, global);
}

void shutdownWorkers() {
    std::unordered_map<int, std::shared_ptr<WorkerEntry>> workers;
    {
        std::lock_guard<std::mutex> lk(g_workerMtx);
        workers = std::move(g_workers);
    }
    for (auto& [id, entry] : workers) {
        entry->stop.store(true);
        entry->inbox.wake_all();
        if (entry->thread.joinable()) entry->thread.join();
    }
    // Unload canvas textures on main (OpenGL) thread
    for (auto& [id, ce] : g_workerCanvases)
        UnloadTexture(ce.texture);
    g_workerCanvases.clear();
    g_canvasNodeToWorker.clear();
}
