#include "js_stdlib.hpp"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <map>
#include <string>
#include <vector>

// ─── timing ──────────────────────────────────────────────────────────────────

static const auto s_epoch = std::chrono::steady_clock::now();

static double nowMs() {
    return std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - s_epoch).count();
}

// ─── value → string ──────────────────────────────────────────────────────────

static std::string jsValToStr(JSContext* ctx, JSValue val) {
    if (JS_IsString(val) || JS_IsNumber(val) || JS_IsBool(val) ||
        JS_IsNull(val) || JS_IsUndefined(val)) {
        const char* s = JS_ToCString(ctx, val);
        std::string r = s ? s : "";
        JS_FreeCString(ctx, s);
        return r;
    }
    // Objects/arrays → JSON.stringify with 2-space indent
    JSValue space = JS_NewInt32(ctx, 2);
    JSValue j = JS_JSONStringify(ctx, val, JS_UNDEFINED, space);
    JS_FreeValue(ctx, space);
    if (!JS_IsException(j) && !JS_IsUndefined(j)) {
        const char* s = JS_ToCString(ctx, j);
        std::string r = s ? s : "{}";
        JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, j);
        return r;
    }
    JS_FreeValue(ctx, j);
    const char* s = JS_ToCString(ctx, val);
    std::string r = s ? s : "[object]";
    JS_FreeCString(ctx, s);
    return r;
}

static std::string argsToStr(JSContext* ctx, int argc, JSValueConst* argv) {
    std::string out;
    for (int i = 0; i < argc; i++) {
        if (i) out += ' ';
        out += jsValToStr(ctx, argv[i]);
    }
    return out;
}

// ─── console state ────────────────────────────────────────────────────────────

static int s_groupDepth = 0;
static std::map<std::string, double> s_consoleTimes;
static std::map<std::string, int> s_consoleCounts;

static std::string groupIndent() { return std::string(s_groupDepth * 2, ' '); }

// ─── console methods ─────────────────────────────────────────────────────────

static JSValue con_log(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    printf("%s%s\n", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
    fflush(stdout);
    return JS_UNDEFINED;
}

static JSValue con_info(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    printf("\033[36m%s[info]\033[0m %s\n", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
    return JS_UNDEFINED;
}

static JSValue con_warn(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    fprintf(stderr, "\033[33m%s[warn]\033[0m %s\n", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
    return JS_UNDEFINED;
}

static JSValue con_error(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    fprintf(stderr, "\033[31m%s[error]\033[0m %s\n", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
    return JS_UNDEFINED;
}

static JSValue con_debug(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    printf("\033[90m%s[debug]\033[0m %s\n", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
    return JS_UNDEFINED;
}

static JSValue con_assert(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    bool ok = argc >= 1 && JS_ToBool(ctx, argv[0]);
    if (!ok) {
        std::string msg = "Assertion failed";
        if (argc > 1) msg += ": " + argsToStr(ctx, argc - 1, argv + 1);
        fprintf(stderr, "\033[31m%s[assert] %s\033[0m\n", groupIndent().c_str(), msg.c_str());
    }
    return JS_UNDEFINED;
}

static JSValue con_time(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    std::string label = argc >= 1 ? jsValToStr(ctx, argv[0]) : "default";
    if (s_consoleTimes.count(label))
        fprintf(stderr, "[timer] Label '%s' already exists\n", label.c_str());
    s_consoleTimes[label] = nowMs();
    return JS_UNDEFINED;
}

static JSValue con_timeEnd(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    std::string label = argc >= 1 ? jsValToStr(ctx, argv[0]) : "default";
    auto it = s_consoleTimes.find(label);
    if (it != s_consoleTimes.end()) {
        printf("%s%s: %.3fms\n", groupIndent().c_str(), label.c_str(), nowMs() - it->second);
        s_consoleTimes.erase(it);
    }
    return JS_UNDEFINED;
}

static JSValue con_timeLog(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    std::string label = argc >= 1 ? jsValToStr(ctx, argv[0]) : "default";
    auto it = s_consoleTimes.find(label);
    if (it != s_consoleTimes.end())
        printf("%s%s: %.3fms\n", groupIndent().c_str(), label.c_str(), nowMs() - it->second);
    return JS_UNDEFINED;
}

static JSValue con_count(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    std::string label = argc >= 1 ? jsValToStr(ctx, argv[0]) : "default";
    printf("%s%s: %d\n", groupIndent().c_str(), label.c_str(), ++s_consoleCounts[label]);
    return JS_UNDEFINED;
}

static JSValue con_countReset(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    std::string label = argc >= 1 ? jsValToStr(ctx, argv[0]) : "default";
    s_consoleCounts[label] = 0;
    return JS_UNDEFINED;
}

static JSValue con_group(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc > 0)
        printf("%s%s\n", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
    s_groupDepth++;
    return JS_UNDEFINED;
}

static JSValue con_groupEnd(JSContext*, JSValue, int, JSValueConst*) {
    if (s_groupDepth > 0) s_groupDepth--;
    return JS_UNDEFINED;
}

static JSValue con_clear(JSContext*, JSValue, int, JSValueConst*) {
    printf("\033[2J\033[H");
    fflush(stdout);
    return JS_UNDEFINED;
}

static JSValue con_table(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    JSValue space = JS_NewInt32(ctx, 2);
    JSValue j = JS_JSONStringify(ctx, argv[0], JS_UNDEFINED, space);
    JS_FreeValue(ctx, space);
    const char* s = JS_ToCString(ctx, j);
    printf("%s%s\n", groupIndent().c_str(), s ? s : "{}");
    JS_FreeCString(ctx, s);
    JS_FreeValue(ctx, j);
    return JS_UNDEFINED;
}

static JSValue con_trace(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    std::string msg = argc > 0 ? argsToStr(ctx, argc, argv) : "Trace";
    printf("\033[90m%s[trace] %s\033[0m\n", groupIndent().c_str(), msg.c_str());
    return JS_UNDEFINED;
}

static JSValue con_dir(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    JSValue space = JS_NewInt32(ctx, 2);
    JSValue j = JS_JSONStringify(ctx, argv[0], JS_UNDEFINED, space);
    JS_FreeValue(ctx, space);
    const char* s = JS_ToCString(ctx, j);
    printf("%s%s\n", groupIndent().c_str(), s ? s : "[object]");
    JS_FreeCString(ctx, s);
    JS_FreeValue(ctx, j);
    return JS_UNDEFINED;
}

// ─── timers ──────────────────────────────────────────────────────────────────

struct JSTimer {
    int id;
    JSValue callback;
    double dueMs;
    double intervalMs; // 0 = one-shot
    bool fired;
};

static std::vector<JSTimer> s_timers;
static int s_nextTimerId = 1;

static JSValue timerAdd(JSContext* ctx, int argc, JSValueConst* argv, bool repeat) {
    if (argc < 1 || !JS_IsFunction(ctx, argv[0]))
        return JS_ThrowTypeError(ctx, "callback must be a function");
    double delayMs = 0;
    if (argc >= 2) JS_ToFloat64(ctx, &delayMs, argv[1]);
    if (delayMs < 0) delayMs = 0;
    int id = s_nextTimerId++;
    s_timers.push_back({id, JS_DupValue(ctx, argv[0]), nowMs() + delayMs,
                        repeat ? delayMs : 0.0, false});
    return JS_NewInt32(ctx, id);
}

static void timerRemove(JSContext* ctx, int id) {
    for (auto it = s_timers.begin(); it != s_timers.end(); ++it) {
        if (it->id == id) {
            JS_FreeValue(ctx, it->callback);
            s_timers.erase(it);
            return;
        }
    }
}

static JSValue JS_setTimeout(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    return timerAdd(ctx, argc, argv, false);
}

static JSValue JS_clearTimeout(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc >= 1) { int id = 0; JS_ToInt32(ctx, &id, argv[0]); timerRemove(ctx, id); }
    return JS_UNDEFINED;
}

static JSValue JS_setInterval(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    return timerAdd(ctx, argc, argv, true);
}

static JSValue JS_clearInterval(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc >= 1) { int id = 0; JS_ToInt32(ctx, &id, argv[0]); timerRemove(ctx, id); }
    return JS_UNDEFINED;
}

// ─── performance ─────────────────────────────────────────────────────────────

static JSValue JS_perfNow(JSContext* ctx, JSValue, int, JSValueConst*) {
    return JS_NewFloat64(ctx, nowMs());
}

// ─── queueMicrotask ──────────────────────────────────────────────────────────

static JSValue JS_queueMicrotask(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsFunction(ctx, argv[0]))
        return JS_ThrowTypeError(ctx, "queueMicrotask: expected function");
    // Schedule via Promise.resolve().then(fn) — uses QJS's native job queue.
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue Promise = JS_GetPropertyStr(ctx, global, "Promise");
    JSValue resolve = JS_GetPropertyStr(ctx, Promise, "resolve");
    JSValue resolved = JS_Call(ctx, resolve, Promise, 0, nullptr);
    JSValue then = JS_GetPropertyStr(ctx, resolved, "then");
    JSValue result = JS_Call(ctx, then, resolved, 1, argv);
    JS_FreeValue(ctx, result);
    JS_FreeValue(ctx, then);
    JS_FreeValue(ctx, resolved);
    JS_FreeValue(ctx, resolve);
    JS_FreeValue(ctx, Promise);
    JS_FreeValue(ctx, global);
    return JS_UNDEFINED;
}

// ─── structuredClone (JSON round-trip) ───────────────────────────────────────

static JSValue JS_structuredClone(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    JSValue space = JS_NewInt32(ctx, 0);
    JSValue j = JS_JSONStringify(ctx, argv[0], JS_UNDEFINED, space);
    JS_FreeValue(ctx, space);
    if (JS_IsException(j)) return j;
    const char* str = JS_ToCString(ctx, j);
    JSValue clone = str ? JS_ParseJSON(ctx, str, strlen(str), "<structuredClone>") : JS_UNDEFINED;
    JS_FreeCString(ctx, str);
    JS_FreeValue(ctx, j);
    return clone;
}

// ─── tick ────────────────────────────────────────────────────────────────────

void tickJSTimers(JSContext* ctx) {
    double now = nowMs();

    // Snapshot expiring timers (duped callbacks, so callbacks can safely
    // modify s_timers — e.g. clearInterval from inside the callback).
    struct FireEntry { int id; JSValue cb; double intervalMs; };
    std::vector<FireEntry> toFire;
    for (auto& t : s_timers) {
        if (!t.fired && now >= t.dueMs)
            toFire.push_back({t.id, JS_DupValue(ctx, t.callback), t.intervalMs});
    }

    // Advance or mark timers before invoking callbacks.
    for (auto& f : toFire) {
        for (auto& t : s_timers) {
            if (t.id != f.id) continue;
            if (f.intervalMs > 0) t.dueMs += f.intervalMs;
            else t.fired = true;
            break;
        }
    }
    s_timers.erase(std::remove_if(s_timers.begin(), s_timers.end(),
        [&](JSTimer& t) {
            if (!t.fired) return false;
            JS_FreeValue(ctx, t.callback);
            return true;
        }), s_timers.end());

    // Invoke.
    for (auto& f : toFire) {
        JSValue result = JS_Call(ctx, f.cb, JS_UNDEFINED, 0, nullptr);
        if (JS_IsException(result)) {
            JSValue exc = JS_GetException(ctx);
            const char* s = JS_ToCString(ctx, exc);
            fprintf(stderr, "\033[31m[timer error] %s\033[0m\n", s ? s : "(unknown)");
            JS_FreeCString(ctx, s);
            JS_FreeValue(ctx, exc);
        }
        JS_FreeValue(ctx, result);
        JS_FreeValue(ctx, f.cb);
    }

    // Drain promise/microtask queue after timers may have resolved promises.
    JSContext* jctx;
    while (JS_ExecutePendingJob(JS_GetRuntime(ctx), &jctx) > 0) {}
}

// ─── registration ─────────────────────────────────────────────────────────────

void registerJSStdlib(JSContext* ctx) {
    JSValue global = JS_GetGlobalObject(ctx);

    // console
    JSValue console = JS_NewObject(ctx);
    struct { const char* name; JSCFunction* fn; } methods[] = {
        {"log",            con_log},
        {"info",           con_info},
        {"warn",           con_warn},
        {"error",          con_error},
        {"debug",          con_debug},
        {"assert",         con_assert},
        {"time",           con_time},
        {"timeEnd",        con_timeEnd},
        {"timeLog",        con_timeLog},
        {"count",          con_count},
        {"countReset",     con_countReset},
        {"group",          con_group},
        {"groupCollapsed", con_group},
        {"groupEnd",       con_groupEnd},
        {"clear",          con_clear},
        {"table",          con_table},
        {"trace",          con_trace},
        {"dir",            con_dir},
        {"dirxml",         con_dir},
    };
    for (auto& m : methods)
        JS_SetPropertyStr(ctx, console, m.name, JS_NewCFunction(ctx, m.fn, m.name, 1));
    JS_SetPropertyStr(ctx, global, "console", console);

    // timers
    JS_SetPropertyStr(ctx, global, "setTimeout",
        JS_NewCFunction(ctx, JS_setTimeout,   "setTimeout",   2));
    JS_SetPropertyStr(ctx, global, "clearTimeout",
        JS_NewCFunction(ctx, JS_clearTimeout, "clearTimeout", 1));
    JS_SetPropertyStr(ctx, global, "setInterval",
        JS_NewCFunction(ctx, JS_setInterval,  "setInterval",  2));
    JS_SetPropertyStr(ctx, global, "clearInterval",
        JS_NewCFunction(ctx, JS_clearInterval,"clearInterval",1));

    // performance
    JSValue perf = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, perf, "now",
        JS_NewCFunction(ctx, JS_perfNow, "now", 0));
    JS_SetPropertyStr(ctx, global, "performance", perf);

    // queueMicrotask
    JS_SetPropertyStr(ctx, global, "queueMicrotask",
        JS_NewCFunction(ctx, JS_queueMicrotask, "queueMicrotask", 1));

    // structuredClone
    JS_SetPropertyStr(ctx, global, "structuredClone",
        JS_NewCFunction(ctx, JS_structuredClone, "structuredClone", 1));

    // globalThis self-reference
    JS_SetPropertyStr(ctx, global, "globalThis", JS_DupValue(ctx, global));

    JS_FreeValue(ctx, global);
}

// ─── cleanup ─────────────────────────────────────────────────────────────────

void cleanupJSStdlib(JSContext* ctx) {
    for (auto& t : s_timers) JS_FreeValue(ctx, t.callback);
    s_timers.clear();
    s_consoleTimes.clear();
    s_consoleCounts.clear();
    s_groupDepth = 0;
}
