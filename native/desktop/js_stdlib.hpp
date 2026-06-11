#pragma once
extern "C" {
#include "quickjs.h"
}

// Register console, timers, performance, queueMicrotask, and print into ctx.
void registerJSStdlib(JSContext* ctx);

// Call once per frame — fires expired setTimeout/setInterval callbacks,
// then drains the QuickJS promise/microtask job queue.
void tickJSTimers(JSContext* ctx);

// Fire queued requestAnimationFrame callbacks once per frame.
void tickAnimationFrames(JSContext* ctx);
// True while JS requestAnimationFrame callbacks are queued (drives the
// Android on-demand frame scheduler).
bool hasPendingAnimationFrames();

// Milliseconds until the earliest pending setTimeout/setInterval fires:
// 0 = due now, >0 = due in that many ms, -1 = no pending timers. Drives the
// Android on-demand frame scheduler — a due timer needs a frame to fire in
// (timers only tick inside the per-frame JS pump).
double nextJSTimerDelayMs();

// Free all pending timer callbacks. Call before JS_FreeContext.
void cleanupJSStdlib(JSContext* ctx);
