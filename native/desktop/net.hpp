#pragma once

extern "C" {
#include "quickjs.h"
}

// Register fetch, EventSource, and WebSocket bindings into the given JSContext.
// Call this once per JSContext (both main thread and worker threads).
void registerNetBindings(JSContext* ctx);

// Drain all pending network events for this JSContext, resolving Promises
// and firing JS callbacks. Call each frame (main thread) or from workerSleep
// (worker threads). Must be called from the thread that owns ctx.
void drainNetEvents(JSContext* ctx);

// Enable render-frame wake-on-event for the main render context's queue, so an
// idle on-demand host (Android/iOS) schedules a frame when a fetch/SSE/WebSocket
// event arrives. Call once for the main ctx (never for worker ctxs).
void netEnableFrameWake(JSContext* ctx);

// True if this context has undelivered net events queued. Used as an on-demand
// render-frame source (engineNeedsAnotherFrame) so delivery is never stranded.
bool netHasPendingEvents(JSContext* ctx);

// Tear down all network state for this JSContext. Stops all background threads,
// frees stored JSValues. Call before JS_FreeContext.
void shutdownNetCtx(JSContext* ctx);
