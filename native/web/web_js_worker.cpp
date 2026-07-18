#include "web_js_worker.hpp"

#include "../desktop/worker_queue.hpp"
#include "../desktop/workers.hpp"

#include <emscripten/emscripten.h>

#include <mutex>
#include <set>

namespace {
std::mutex g_webJsWorkerMutex;
std::set<int> g_webJsWorkers;
}

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebJsWorkerMessage(int workerId, const char* json) {
    g_workerOutbox.push({workerId, WorkerMsgType::JSON, json ? std::string(json) : "null"});
}

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebJsWorkerClosed(int workerId) {
    std::lock_guard<std::mutex> lock(g_webJsWorkerMutex);
    g_webJsWorkers.erase(workerId);
}

namespace rayact {

bool webSpawnJSWorker(int workerId,
                      const std::string& filePath,
                      const std::string& source,
                      const std::string& initialDataJSON,
                      std::shared_ptr<WorkerEntry> entry) {
    (void)entry;
    int ok = EM_ASM_INT({
        var id = $0;
        var path = UTF8ToString($1);
        var source = UTF8ToString($2);
        var initialJSON = UTF8ToString($3 || 0) || 'null';
        Module.__rayactJsWorkers = Module.__rayactJsWorkers || {};
        try {
            var bootstrap =
                "const __rayactPath = " + JSON.stringify(path) + ";\n" +
                "let initialData = null;\n" +
                "try { initialData = JSON.parse(" + JSON.stringify(initialJSON) + "); } catch (_) { initialData = null; }\n" +
                "self.initialData = initialData;\n" +
                "self.globalThis = self;\n" +
                "self.window = self;\n" +
                "self.onMessage = self.onMessage || undefined;\n" +
                "self.addEventListener('message', function(ev) {\n" +
                "  if (ev.data && ev.data.__rayactInternal) return;\n" +
                "  if (typeof self.onMessage === 'function') self.onMessage(ev.data);\n" +
                "});\n" +
                "try {\n" +
                source + "\n" +
                "} catch (e) {\n" +
                "  self.postMessage({ type: 'error', message: String(e && e.stack || e) });\n" +
                "}\n";
            var blob = new Blob([bootstrap], { type: 'text/javascript' });
            var url = URL.createObjectURL(blob);
            var worker = new Worker(url, { name: 'rayact-worker-' + id });
            var slot = {};
            slot.worker = worker;
            slot.url = url;
            Module.__rayactJsWorkers[id] = slot;
            worker.onmessage = function(ev) {
                var payload;
                try { payload = JSON.stringify(ev.data === undefined ? null : ev.data); }
                catch (_) { payload = JSON.stringify(String(ev.data)); }
                var n = lengthBytesUTF8(payload) + 1;
                var p = _malloc(n);
                stringToUTF8(payload, p, n);
                try { _rayactWebJsWorkerMessage(id, p); }
                finally { _free(p); }
            };
            worker.onerror = function(ev) {
                var errorPayload = {};
                errorPayload.type = 'error';
                errorPayload.message = ev.message || 'Worker error';
                var payload = JSON.stringify(errorPayload);
                var n = lengthBytesUTF8(payload) + 1;
                var p = _malloc(n);
                stringToUTF8(payload, p, n);
                try { _rayactWebJsWorkerMessage(id, p); }
                finally { _free(p); }
            };
            return 1;
        } catch (e) {
            console.error('[rayact-web] failed to spawn JS worker', e);
            return 0;
        }
    }, workerId, filePath.c_str(), source.c_str(), initialDataJSON.c_str());
    if (!ok) return false;
    std::lock_guard<std::mutex> lock(g_webJsWorkerMutex);
    g_webJsWorkers.insert(workerId);
    return true;
}

bool webPostToJSWorker(int workerId, const std::string& payloadJSON) {
    return EM_ASM_INT({
        var id = $0;
        var payloadJSON = UTF8ToString($1);
        var slot = Module.__rayactJsWorkers && Module.__rayactJsWorkers[id];
        if (!slot) return 0;
        var payload = null;
        try { payload = JSON.parse(payloadJSON); } catch (_) { payload = payloadJSON; }
        slot.worker.postMessage(payload);
        return 1;
    }, workerId, payloadJSON.c_str()) != 0;
}

bool webTerminateJSWorker(int workerId) {
    int ok = EM_ASM_INT({
        var id = $0;
        var slot = Module.__rayactJsWorkers && Module.__rayactJsWorkers[id];
        if (!slot) return 0;
        slot.worker.terminate();
        if (slot.url) URL.revokeObjectURL(slot.url);
        delete Module.__rayactJsWorkers[id];
        return 1;
    }, workerId);
    if (ok) {
        std::lock_guard<std::mutex> lock(g_webJsWorkerMutex);
        g_webJsWorkers.erase(workerId);
    }
    return ok != 0;
}

bool webIsJSWorker(int workerId) {
    std::lock_guard<std::mutex> lock(g_webJsWorkerMutex);
    return g_webJsWorkers.count(workerId) != 0;
}

}
