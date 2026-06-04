package com.rayact.engine

import android.view.Surface

/**
 * Process-level facade over the native Rayact engine. The engine (QuickJS +
 * raym3) is a singleton not owned by any Activity, so it survives Activity
 * recreation and can coordinate multiple surfaces/screens.
 *
 * JNI symbol names map to Java_com_rayact_engine_RayactEngine_native* in
 * native/android/jni_bridge.cpp.
 */
object RayactEngine {
    init { System.loadLibrary("rayact") }

    @Volatile var created = false
        private set

    /** Create the engine once. dataPath = context.filesDir.absolutePath. */
    @Synchronized
    fun create(dataPath: String): Boolean {
        if (created) return true
        created = nativeCreate(dataPath)
        return created
    }

    /** Load app JS from a source string (bundled asset). */
    fun loadSource(source: String): Boolean = nativeLoadScript(0, source)

    /** Load app JS from a dev-server URL (adb reverse). */
    fun loadDevServer(url: String): Boolean = nativeLoadScript(1, url)

    // Touch action codes — mirror RCORE_AS_TOUCH_* in rcore_android_surface.h
    const val TOUCH_DOWN = 0
    const val TOUCH_UP = 1
    const val TOUCH_MOVE = 2

    // ── multi-surface ──────────────────────────────────────────────────────
    // A "surface" is one ANativeWindow + one EGL surface + one engine screen.
    // The first surface (id 1) brings up the EGL context; subsequent surfaces
    // add EGL surfaces that share the same context. The engine render loop
    // iterates the focused-screen stack and binds the right EGL surface
    // per pass. surfaceId == screenId (the host can treat them as the same key).
    // Returns the new surfaceId (>0) or 0 on failure.
    fun createSurface(surface: Surface, density: Float): Int =
        nativeCreateSurface(surface, density)

    fun destroySurface(surfaceId: Int) = nativeDestroySurface(surfaceId)

    /** Push a surface to the top of the focus stack. */
    fun pushSurface(surfaceId: Int) = nativePushSurface(surfaceId)

    /** Pop the focused surface. Returns the popped surfaceId, or 0 if it was the root. */
    fun popSurface(): Int = nativePopSurface()

    /** Currently focused surfaceId (top of the stack). */
    fun getFocusedSurfaceId(): Int = nativeGetFocusedSurfaceId()

    // ── JNI ───────────────────────────────────────────────────────────────
    external fun nativeCreate(dataPath: String): Boolean
    external fun nativeLoadScript(mode: Int, arg: String): Boolean
    external fun nativeCreateSurface(surface: Surface, density: Float): Int
    external fun nativeDestroySurface(surfaceId: Int)
    external fun nativeRequestNewSurface(): Int
    external fun nativePushSurface(surfaceId: Int)
    external fun nativePopSurface(): Int
    external fun nativeGetFocusedSurfaceId(): Int
    external fun nativeRenderFrame()
    external fun nativeTouch(action: Int, id: Int, x: Float, y: Float)
    external fun nativeSurfaceDestroyed()
    external fun nativeDestroy()

    // ── back / exit / engine-stack JS-driven hooks (Part 3) ─────────────
    /** Forward the Kotlin OnBackPressedCallback into the JS pump. */
    external fun nativeOnBackPressed()
    /** JS called BackHandler.exitApp(); the render thread schedules
     *  finishActivityFromHost on the main thread. */
    external fun nativeExitApp()
    /** JS-driven engine z-order trim. Replaces g_screenStack with the
     *  supplied ids (bottom→top). Idempotent; root screen preserved. */
    external fun nativeSetScreenStack(ids: IntArray)
}

// Reverse-call from native (C++ engine, via JNI) to allocate a new
// EGL surface + engine screen. Called on the render thread; the
// actual UI work happens on the main thread, and this function
// blocks until the surfaceId is ready (or 2s timeout).
//
// The host must be set via RayactHostRegistry.setHost() before this
// is called (typically by MainActivity.onCreate).
fun requestNewSurfaceFromHost(): Int = RayactHostRegistry.requestNewSurface()

// Reverse-call from native to read the root surfaceId (the one created
// by MainActivity.installRoot). The JS navigator uses this for the
// initial route so the first screen mounts into the existing root
// surface, not a freshly-allocated one.
fun rootSurfaceIdFromHost(): Int = RayactHostRegistry.rootSurfaceId()

// Reverse-call from native to pop the topmost surface via the host.
// The host (NavigationHost) handles the slide-out animation +
// ViewGroup removal. The actual EGL surface teardown is done by the
// view's surfaceDestroyed callback after the view is detached.
fun releaseTopSurfaceFromHost(): Unit = RayactHostRegistry.releaseTopSurface()

// Reverse-call from native when no JS BackHandler listener handled system back.
fun finishActivityFromHost(): Unit = RayactHostRegistry.finishActivityFromHost()
