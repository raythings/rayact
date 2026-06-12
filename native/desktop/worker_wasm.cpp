#include "worker_wasm.hpp"
#include "worker_queue.hpp"
#include "module_bus.hpp"

extern "C" {
#include "wasm3.h"
}

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <memory>
#include <thread>

// Userdata threaded through every host-linked function
struct WasmWorkerCtx {
    int                          workerId;
    std::shared_ptr<WorkerEntry> entry;
    IM3Runtime                   runtime;
};

// ── Host functions exported to the WASM module ──────────────────────────────

// sys_post_message(ptr: i32, size: i32)
// Worker → main: pushes a JSON string from wasm linear memory
static m3ApiRawFunction(wasm_sys_post_message) {
    m3ApiGetArg(uint32_t, ptr);
    m3ApiGetArg(uint32_t, size);

    WasmWorkerCtx* wctx = (WasmWorkerCtx*)_ctx->userdata;
    uint32_t memSize = 0;
    uint8_t* mem = m3_GetMemory(runtime, &memSize, 0);
    if (mem && (uint64_t)ptr + size <= memSize) {
        std::string s(reinterpret_cast<char*>(mem + ptr), size);
        g_workerOutbox.push({wctx->workerId, WorkerMsgType::JSON, std::move(s)});
    }
    m3ApiSuccess();
}

// sys_post_primitive(value: f64)
// Worker → main: pushes a numeric value
static m3ApiRawFunction(wasm_sys_post_primitive) {
    m3ApiGetArg(double, value);

    WasmWorkerCtx* wctx = (WasmWorkerCtx*)_ctx->userdata;
    g_workerOutbox.push({wctx->workerId, WorkerMsgType::Primitive, "", value});
    m3ApiSuccess();
}

// sys_poll_message(outBuf: i32, bufSize: i32) -> i32
// Main → worker: non-blocking. Returns byte count written, or 0 if inbox empty.
static m3ApiRawFunction(wasm_sys_poll_message) {
    m3ApiGetArg(uint32_t, outBuf);
    m3ApiGetArg(uint32_t, bufSize);
    m3ApiReturnType(uint32_t);

    WasmWorkerCtx* wctx = (WasmWorkerCtx*)_ctx->userdata;

    WorkerMessage msg;
    if (!wctx->entry->inbox.pop(msg)) {
        m3ApiReturn(0);
    }

    uint32_t memSize = 0;
    uint8_t* mem = m3_GetMemory(runtime, &memSize, 0);
    if (!mem || outBuf >= memSize) {
        m3ApiReturn(0);
    }

    uint32_t available = memSize - outBuf;
    uint32_t capacity  = bufSize < available ? bufSize : available;
    uint32_t len       = (uint32_t)msg.payload.size();
    if (len >= capacity) len = capacity - 1;

    memcpy(mem + outBuf, msg.payload.data(), len);
    mem[outBuf + len] = '\0';
    m3ApiReturn(len);
}

// sys_present_canvas(ptr: i32, width: i32, height: i32)
// Worker writes pixel buffer (RGBA) at ptr in its own linear memory,
// then calls this to hand the frame to the main thread.
static m3ApiRawFunction(wasm_sys_present_canvas) {
    m3ApiGetArg(uint32_t, ptr);
    m3ApiGetArg(uint32_t, width);
    m3ApiGetArg(uint32_t, height);

    WasmWorkerCtx* wctx = (WasmWorkerCtx*)_ctx->userdata;

    uint32_t memSize = 0;
    uint8_t* mem = m3_GetMemory(runtime, &memSize, 0);
    size_t pixelBytes = (size_t)width * height * 4;

    if (mem && (uint64_t)ptr + pixelBytes <= memSize) {
        std::lock_guard<std::mutex> lk(wctx->entry->canvas.mtx);
        wctx->entry->canvas.pixels.resize(pixelBytes);
        memcpy(wctx->entry->canvas.pixels.data(), mem + ptr, pixelBytes);
        wctx->entry->canvas.width  = (int)width;
        wctx->entry->canvas.height = (int)height;
    }
    g_workerOutbox.push({wctx->workerId, WorkerMsgType::CanvasReady, "",
                         0.0, (int)width, (int)height});
    m3ApiSuccess();
}

// sys_invoke(namePtr,nameLen, methodPtr,methodLen, argPtr,argLen, outPtr,outCap) -> i32
// Synchronous call into the native module bus from a WASM worker. Returns the
// result length (>=0); if it exceeds outCap, nothing is written and the required
// length is returned (caller retries with a bigger buffer). Negative = error.
static m3ApiRawFunction(wasm_sys_invoke) {
    m3ApiReturnType(int32_t);
    m3ApiGetArg(uint32_t, namePtr);
    m3ApiGetArg(uint32_t, nameLen);
    m3ApiGetArg(uint32_t, methodPtr);
    m3ApiGetArg(uint32_t, methodLen);
    m3ApiGetArg(uint32_t, argPtr);
    m3ApiGetArg(uint32_t, argLen);
    m3ApiGetArg(uint32_t, outPtr);
    m3ApiGetArg(uint32_t, outCap);

    uint32_t memSize = 0;
    uint8_t* mem = m3_GetMemory(runtime, &memSize, 0);
    if (!mem ||
        (uint64_t)namePtr + nameLen > memSize ||
        (uint64_t)methodPtr + methodLen > memSize ||
        (uint64_t)argPtr + argLen > memSize ||
        (uint64_t)outPtr + outCap > memSize) {
        m3ApiReturn(-1);
    }

    int n = rayact::busInvokeRaw(
        (const char*)(mem + namePtr), nameLen,
        (const char*)(mem + methodPtr), methodLen,
        mem + argPtr, argLen,
        mem + outPtr, outCap);
    m3ApiReturn(n);
}

// ── Worker thread body ───────────────────────────────────────────────────────

static void runWasmWorkerThread(int workerId,
                                 std::string filePath,
                                 std::string initialDataJSON,
                                 std::shared_ptr<WorkerEntry> entry) {
    (void)initialDataJSON; // WASM gets data via sys_poll_message if needed

    // Read .wasm file
    FILE* f = fopen(filePath.c_str(), "rb");
    if (!f) {
        fprintf(stderr, "[wasm worker %d] cannot open %s\n", workerId, filePath.c_str());
        return;
    }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::vector<uint8_t> wasmBytes((size_t)sz);
    fread(wasmBytes.data(), 1, sz, f);
    fclose(f);

    IM3Environment env = m3_NewEnvironment();
    if (!env) {
        fprintf(stderr, "[wasm worker %d] m3_NewEnvironment failed\n", workerId);
        return;
    }

    // 512 KB wasm3 stack
    IM3Runtime rt = m3_NewRuntime(env, 512 * 1024, nullptr);
    if (!rt) {
        fprintf(stderr, "[wasm worker %d] m3_NewRuntime failed\n", workerId);
        m3_FreeEnvironment(env);
        return;
    }

    WasmWorkerCtx wctx{workerId, entry, rt};

    IM3Module module = nullptr;
    M3Result err = m3_ParseModule(env, &module, wasmBytes.data(), (uint32_t)wasmBytes.size());
    if (err) {
        fprintf(stderr, "[wasm worker %d] m3_ParseModule: %s\n", workerId, err);
        m3_FreeRuntime(rt);
        m3_FreeEnvironment(env);
        return;
    }

    err = m3_LoadModule(rt, module);
    if (err) {
        fprintf(stderr, "[wasm worker %d] m3_LoadModule: %s\n", workerId, err);
        m3_FreeModule(module);
        m3_FreeRuntime(rt);
        m3_FreeEnvironment(env);
        return;
    }

    // Link host functions — module name "env" matches standard clang/wasi convention
    m3_LinkRawFunctionEx(module, "env", "sys_post_message",   "v(ii)",   wasm_sys_post_message,   &wctx);
    m3_LinkRawFunctionEx(module, "env", "sys_post_primitive", "v(F)",    wasm_sys_post_primitive, &wctx);
    m3_LinkRawFunctionEx(module, "env", "sys_poll_message",   "i(ii)",   wasm_sys_poll_message,   &wctx);
    m3_LinkRawFunctionEx(module, "env", "sys_present_canvas", "v(iii)",  wasm_sys_present_canvas, &wctx);
    m3_LinkRawFunctionEx(module, "env", "sys_invoke",         "i(iiiiiiii)", wasm_sys_invoke,     &wctx);

    // Also try "rayact" module name as an alias
    m3_LinkRawFunctionEx(module, "rayact", "sys_post_message",   "v(ii)",   wasm_sys_post_message,   &wctx);
    m3_LinkRawFunctionEx(module, "rayact", "sys_post_primitive", "v(F)",    wasm_sys_post_primitive, &wctx);
    m3_LinkRawFunctionEx(module, "rayact", "sys_poll_message",   "i(ii)",   wasm_sys_poll_message,   &wctx);
    m3_LinkRawFunctionEx(module, "rayact", "sys_present_canvas", "v(iii)",  wasm_sys_present_canvas, &wctx);
    m3_LinkRawFunctionEx(module, "rayact", "sys_invoke",         "i(iiiiiiii)", wasm_sys_invoke,     &wctx);

    // Try _start first (WASI convention), then main, then start
    const char* entryPoints[] = {"_start", "main", "start", nullptr};
    IM3Function entryFn = nullptr;
    for (int i = 0; entryPoints[i]; i++) {
        if (m3_FindFunction(&entryFn, rt, entryPoints[i]) == m3Err_none) {
            fprintf(stderr, "[wasm worker %d] calling %s\n", workerId, entryPoints[i]);
            break;
        }
        entryFn = nullptr;
    }

    if (!entryFn) {
        fprintf(stderr, "[wasm worker %d] no entry point found (_start/main/start)\n", workerId);
    } else {
        err = m3_CallV(entryFn);
        if (err && strcmp(err, "exit called") != 0) {
            // Surface wasm trap info
            M3ErrorInfo info;
            m3_GetErrorInfo(rt, &info);
            fprintf(stderr, "[wasm worker %d] runtime error: %s — %s\n",
                    workerId, err, info.message ? info.message : "");
        }
    }

    m3_FreeRuntime(rt);
    m3_FreeEnvironment(env);
    fprintf(stderr, "[wasm worker %d] thread exiting\n", workerId);
}

void spawnWASMWorker(int workerId,
                     std::string filePath,
                     std::string initialDataJSON,
                     std::shared_ptr<WorkerEntry> entry) {
    entry->thread = std::thread(runWasmWorkerThread,
                                workerId,
                                std::move(filePath),
                                std::move(initialDataJSON),
                                entry);
}
