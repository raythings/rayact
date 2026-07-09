#include "js_stdlib.hpp"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <map>
#include <set>
#include <string>
#include <vector>

#include "raylib.h"

// ─── debug: capture swallowed JS errors (timer / unhandled rejection) ─────────
std::string g_lastJsError;

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
    std::string msg = groupIndent() + argsToStr(ctx, argc, argv);
    TraceLog(LOG_INFO, "JS: %s", msg.c_str());
    return JS_UNDEFINED;
}

static JSValue con_info(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
#ifdef __ANDROID__
    TraceLog(LOG_INFO, "JS[info]: %s%s", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
#else
    printf("\033[36m%s[info]\033[0m %s\n", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
#endif
    return JS_UNDEFINED;
}

static JSValue con_warn(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
#ifdef __ANDROID__
    TraceLog(LOG_WARNING, "JS[warn]: %s%s", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
#else
    fprintf(stderr, "\033[33m%s[warn]\033[0m %s\n", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
#endif
    return JS_UNDEFINED;
}

static JSValue con_error(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
#ifdef __ANDROID__
    TraceLog(LOG_ERROR, "JS[error]: %s%s", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
#else
    fprintf(stderr, "\033[31m%s[error]\033[0m %s\n", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
#endif
    return JS_UNDEFINED;
}

static JSValue con_debug(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
#ifdef __ANDROID__
    TraceLog(LOG_DEBUG, "JS[debug]: %s%s", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
#else
    printf("\033[90m%s[debug]\033[0m %s\n", groupIndent().c_str(), argsToStr(ctx, argc, argv).c_str());
#endif
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

// ─── requestAnimationFrame ───────────────────────────────────────────────────

struct RafCallback {
    int id;
    JSValue callback;
};

static std::vector<RafCallback> s_rafQueue;
static std::set<int> s_cancelledRafIds;
static int s_nextRafId = 1;

static JSValue JS_requestAnimationFrame(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1 || !JS_IsFunction(ctx, argv[0]))
        return JS_ThrowTypeError(ctx, "requestAnimationFrame: expected function");
    int id = s_nextRafId++;
    s_rafQueue.push_back({id, JS_DupValue(ctx, argv[0])});
    return JS_NewInt32(ctx, id);
}

static JSValue JS_cancelAnimationFrame(JSContext* ctx, JSValue, int argc, JSValueConst* argv) {
    if (argc < 1) return JS_UNDEFINED;
    int32_t id = 0;
    JS_ToInt32(ctx, &id, argv[0]);
    if (id <= 0) return JS_UNDEFINED;
    s_cancelledRafIds.insert(id);
    for (auto it = s_rafQueue.begin(); it != s_rafQueue.end();) {
        if (it->id == id) {
            JS_FreeValue(ctx, it->callback);
            it = s_rafQueue.erase(it);
        } else {
            ++it;
        }
    }
    return JS_UNDEFINED;
}

bool hasPendingAnimationFrames() { return !s_rafQueue.empty(); }

double nextJSTimerDelayMs() {
    bool found = false;
    double best = 0.0;
    const double now = nowMs();
    for (const auto& t : s_timers) {
        if (t.fired) continue;
        const double delay = t.dueMs - now;
        if (!found || delay < best) { best = delay; found = true; }
    }
    // Overdue timers clamp to 0 ("due now") — must not collide with the
    // -1 "no pending timers" sentinel.
    return found ? std::max(0.0, best) : -1.0;
}

void tickAnimationFrames(JSContext* ctx) {
    if (s_rafQueue.empty()) return;
    std::vector<RafCallback> callbacks;
    callbacks.swap(s_rafQueue);
    double ts = nowMs();
    JSValue tsVal = JS_NewFloat64(ctx, ts);
    for (RafCallback& raf : callbacks) {
        if (s_cancelledRafIds.erase(raf.id) > 0) {
            JS_FreeValue(ctx, raf.callback);
            continue;
        }
        JSValue result = JS_Call(ctx, raf.callback, JS_UNDEFINED, 1, &tsVal);
        if (JS_IsException(result)) {
            JSValue exc = JS_GetException(ctx);
            const char* s = JS_ToCString(ctx, exc);
            fprintf(stderr, "\033[31m[raf error] %s\033[0m\n", s ? s : "(unknown)");
            JS_FreeCString(ctx, s);
            JS_FreeValue(ctx, exc);
        }
        JS_FreeValue(ctx, result);
        JS_FreeValue(ctx, raf.callback);
    }
    JS_FreeValue(ctx, tsVal);
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

// ─── TextEncoder / TextDecoder ───────────────────────────────────────────────

static void installTextEncoding(JSContext* ctx) {
    static const char* kTextEncodingPolyfill = R"JS(
(function() {
  if (typeof globalThis.TextDecoder === 'undefined') {
    globalThis.TextDecoder = class TextDecoder {
      constructor(label) {
        const encoding = String(label || 'utf-8').toLowerCase();
        if (encoding !== 'utf-8' && encoding !== 'utf8') {
          throw new RangeError('Only utf-8 TextDecoder is supported');
        }
        this.encoding = 'utf-8';
        this.fatal = false;
        this.ignoreBOM = false;
      }

      decode(input) {
        if (input == null) return '';
        let bytes;
        if (input instanceof ArrayBuffer) {
          bytes = new Uint8Array(input);
        } else if (ArrayBuffer.isView(input)) {
          bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        } else {
          bytes = new Uint8Array(input);
        }

        let out = '';
        for (let i = 0; i < bytes.length;) {
          const first = bytes[i++];
          let cp = 0xfffd;
          if (first < 0x80) {
            cp = first;
          } else if ((first & 0xe0) === 0xc0 && i < bytes.length) {
            cp = ((first & 0x1f) << 6) | (bytes[i++] & 0x3f);
          } else if ((first & 0xf0) === 0xe0 && i + 1 < bytes.length) {
            cp = ((first & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
          } else if ((first & 0xf8) === 0xf0 && i + 2 < bytes.length) {
            cp = ((first & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) |
                 ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
          }

          if (cp <= 0xffff) {
            out += String.fromCharCode(cp);
          } else {
            cp -= 0x10000;
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
          }
        }
        return out;
      }
    };
  }

  if (typeof globalThis.TextEncoder === 'undefined') {
    globalThis.TextEncoder = class TextEncoder {
      constructor() {
        this.encoding = 'utf-8';
      }

      encode(input) {
        const str = String(input || '');
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
          let cp = str.charCodeAt(i);
          if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
            const next = str.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
              cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
              i++;
            }
          }

          if (cp < 0x80) {
            bytes.push(cp);
          } else if (cp < 0x800) {
            bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
          } else if (cp < 0x10000) {
            bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
          } else {
            bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
                       0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
          }
        }
        return new Uint8Array(bytes);
      }

      encodeInto(input, destination) {
        const encoded = this.encode(input);
        const written = Math.min(encoded.length, destination.length);
        for (let i = 0; i < written; i++) destination[i] = encoded[i];
        return { read: String(input || '').length, written };
      }
    };
  }
})();
)JS";

    JSValue result = JS_Eval(ctx, kTextEncodingPolyfill, strlen(kTextEncodingPolyfill),
                             "<text-encoding-polyfill>", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(ctx);
        const char* message = JS_ToCString(ctx, exc);
        fprintf(stderr, "[stdlib] failed to install TextEncoder/TextDecoder: %s\n",
                message ? message : "(unknown)");
        JS_FreeCString(ctx, message);
        JS_FreeValue(ctx, exc);
    }
    JS_FreeValue(ctx, result);
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
            std::string msg = s ? s : "(unknown)";
            JSValue stk = JS_GetPropertyStr(ctx, exc, "stack");
            const char* st = JS_ToCString(ctx, stk);
            if (st) { msg += " | "; msg += st; }
            g_lastJsError = "[timer] " + msg;
            fprintf(stderr, "\033[31m[timer error] %s\033[0m\n", msg.c_str());
            JS_FreeCString(ctx, st); JS_FreeValue(ctx, stk);
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

static void promiseRejectionTracker(JSContext* ctx, JSValueConst /*promise*/,
                                    JSValueConst reason, bool is_handled, void* /*opaque*/) {
    if (is_handled) return;
    const char* s = JS_ToCString(ctx, reason);
    std::string msg = s ? s : "(unknown)";
    JS_FreeCString(ctx, s);
    JSValue stk = JS_GetPropertyStr(ctx, reason, "stack");
    const char* st = JS_ToCString(ctx, stk);
    if (st) { msg += " | "; msg += st; }
    JS_FreeCString(ctx, st); JS_FreeValue(ctx, stk);
    g_lastJsError = "[rejection] " + msg;
    fprintf(stderr, "\033[31m[unhandled rejection] %s\033[0m\n", msg.c_str());
}

void registerJSStdlib(JSContext* ctx) {
    JS_SetHostPromiseRejectionTracker(JS_GetRuntime(ctx), promiseRejectionTracker, nullptr);
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

    JS_SetPropertyStr(ctx, global, "requestAnimationFrame",
        JS_NewCFunction(ctx, JS_requestAnimationFrame, "requestAnimationFrame", 1));
    JS_SetPropertyStr(ctx, global, "cancelAnimationFrame",
        JS_NewCFunction(ctx, JS_cancelAnimationFrame, "cancelAnimationFrame", 1));

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

    installTextEncoding(ctx);

    // globalThis self-reference
    JS_SetPropertyStr(ctx, global, "globalThis", JS_DupValue(ctx, global));
    JS_SetPropertyStr(ctx, global, "window", JS_DupValue(ctx, global));
    JSValue navigator = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, navigator, "userAgent", JS_NewString(ctx, "rayact-quickjs"));
    JS_SetPropertyStr(ctx, navigator, "platform", JS_NewString(ctx, ""));
    JS_SetPropertyStr(ctx, navigator, "language", JS_NewString(ctx, "en"));
    JS_SetPropertyStr(ctx, global, "navigator", navigator);

    JS_FreeValue(ctx, global);
}

// ─── cleanup ─────────────────────────────────────────────────────────────────

void cleanupJSStdlib(JSContext* ctx) {
    for (auto& t : s_timers) JS_FreeValue(ctx, t.callback);
    s_timers.clear();
    for (auto& raf : s_rafQueue) JS_FreeValue(ctx, raf.callback);
    s_rafQueue.clear();
    s_cancelledRafIds.clear();
    s_consoleTimes.clear();
    s_consoleCounts.clear();
    s_groupDepth = 0;
}

// Per-runtime parking of the JSValue-bearing global stdlib state. The timer and
// rAF lists are process-global (one active runtime at a time), but their
// callbacks belong to a specific JSContext. When the active runtime switches
// (Android launcher↔project), the outgoing runtime must MOVE its timers/rafs
// aside without freeing them — freeing through the wrong runtime's ctx, or
// concurrently with that runtime's render thread, corrupts the heap (SIGSEGV in
// JS_FreeValue during a second engine instance's creation).
struct JSStdlibState {
    std::vector<JSTimer> timers;
    std::vector<RafCallback> rafQueue;
    std::set<int> cancelledRafIds;
    int nextTimerId = 1;
    int nextRafId = 1;
};

void* saveJSStdlibState() {
    auto* st = new JSStdlibState();
    st->timers.swap(s_timers);
    st->rafQueue.swap(s_rafQueue);
    st->cancelledRafIds.swap(s_cancelledRafIds);
    st->nextTimerId = s_nextTimerId;
    st->nextRafId = s_nextRafId;
    // Globals are now empty; counters keep advancing per-runtime on restore.
    return st;
}

void restoreJSStdlibState(void* state) {
    // Whatever is currently in the globals belongs to no one now (the caller is
    // about to overwrite the active runtime) — it must already have been parked
    // via saveJSStdlibState. Clear defensively so a stale list can't leak.
    s_timers.clear();
    s_rafQueue.clear();
    s_cancelledRafIds.clear();
    if (!state) return;
    auto* st = static_cast<JSStdlibState*>(state);
    s_timers.swap(st->timers);
    s_rafQueue.swap(st->rafQueue);
    s_cancelledRafIds.swap(st->cancelledRafIds);
    s_nextTimerId = st->nextTimerId;
    s_nextRafId = st->nextRafId;
    delete st;
}
