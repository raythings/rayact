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

// Free all pending timer callbacks. Call before JS_FreeContext.
void cleanupJSStdlib(JSContext* ctx);
