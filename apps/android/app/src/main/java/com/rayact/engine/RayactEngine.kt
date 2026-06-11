package com.rayact.engine

import android.content.Context
import android.os.Handler
import android.os.Looper
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

    fun setSafeAreaInsets(top: Float, right: Float, bottom: Float, left: Float) =
        nativeSetSafeAreaInsets(top, right, bottom, left)

    /** Report IME keyboard geometry (height in dp above the nav bar). */
    fun setKeyboardInsets(heightDp: Float, visible: Boolean, durationMs: Float) =
        nativeSetKeyboardInsets(heightDp, visible, durationMs)

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
    external fun nativeSetSafeAreaInsets(top: Float, right: Float, bottom: Float, left: Float)
    external fun nativeSetKeyboardInsets(heightDp: Float, visible: Boolean, durationMs: Float)
    external fun nativeDestroySurface(surfaceId: Int)
    external fun nativeRequestNewSurface(): Int
    external fun nativePushSurface(surfaceId: Int)
    external fun nativePopSurface(): Int
    external fun nativeGetFocusedSurfaceId(): Int
    /** Render one vsync-aligned frame. Returns true when another frame is needed (animations/momentum). */
    external fun nativeRenderFrame(frameTimeNanos: Long, deltaNanos: Long): Boolean
    external fun nativeNextJSTimerDelayMs(): Float
    external fun nativePushExternalViewFrame(nodeId: Int, buffer: android.hardware.HardwareBuffer)
    external fun nativeExternalViewTextChanged(nodeId: Int, text: String)
    external fun nativeSetExternalViewInsets(nodeId: Int, l: Float, t: Float, r: Float, b: Float)
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
    /** Called from Android main thread when soft-keyboard text changes. */
    external fun nativeSetTextInputContent(
        nodeId: Int,
        text: String,
        selectionStart: Int,
        selectionEnd: Int,
        composingStart: Int,
        composingEnd: Int
    )
    /** IME DONE/Enter — blur the focused native field on the render thread. */
    external fun nativeBlurTextInput()
    /** System hid the IME without a native blur — clear JNI ime node id only. */
    external fun nativeImeHiddenBySystem()
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

// Reverse-call from native to read the topmost Fragment-backed surfaceId.
fun topSurfaceIdFromHost(): Int = RayactHostRegistry.topSurfaceId()

// Reverse-call from native to pop the topmost surface via the host.
// The host (NavigationHost) handles the slide-out animation +
// ViewGroup removal. The actual EGL surface teardown is done by the
// view's surfaceDestroyed callback after the view is detached.
fun releaseTopSurfaceFromHost(): Unit = RayactHostRegistry.releaseTopSurface()

// Reverse-call from native to remove a specific Fragment-backed surface.
fun releaseSurfaceFromHost(surfaceId: Int): Unit = RayactHostRegistry.releaseSurface(surfaceId)

// Reverse-call from native to align Android View z-order with engine z-order.
fun orderSurfacesFromHost(surfaceIds: IntArray): Unit = RayactHostRegistry.orderSurfaces(surfaceIds)

// Reverse-call from native when no JS BackHandler listener handled system back.
fun finishActivityFromHost(): Unit = RayactHostRegistry.finishActivityFromHost()

// Reverse-call from C++ onFocus lambda — show keyboard for a specific TextInput node.
fun showSoftKeyboardFromHost(
    nodeId: Int,
    value: String,
    inputType: String = "text",
    autocorrect: Boolean = false,
    secure: Boolean = false,
    imeAction: String = "done"
) {
    val view = RayactHostRegistry.imeView ?: return
    Handler(Looper.getMainLooper()).post {
        view.setupForIme(nodeId, value, inputType, autocorrect, secure, imeAction)
    }
}

// Reverse-call when focus moves between TextInputs — retarget IME without hiding.
fun switchImeFromHost(
    nodeId: Int,
    value: String,
    inputType: String = "text",
    autocorrect: Boolean = false,
    secure: Boolean = false,
    imeAction: String = "done"
) {
    val view = RayactHostRegistry.imeView ?: return
    Handler(Looper.getMainLooper()).post {
        view.switchIme(nodeId, value, inputType, autocorrect, secure, imeAction)
    }
}

// Reverse-call from C++ onBlur lambda — hide keyboard.
fun hideSoftKeyboardFromHost() {
    val view = RayactHostRegistry.imeView ?: return
    Handler(Looper.getMainLooper()).post {
        view.clearIme()
    }
}

// Reverse-call from C++ when the focused field changes editing state.
fun updateImeStateFromHost(
    nodeId: Int,
    selectionStart: Int,
    selectionEnd: Int,
    composingStart: Int,
    composingEnd: Int,
    text: String?
) {
    val view = RayactHostRegistry.imeView ?: return
    Handler(Looper.getMainLooper()).post {
        view.updateImeState(
            nodeId,
            text,
            selectionStart,
            selectionEnd,
            composingStart,
            composingEnd
        )
    }
}

fun copyToClipboardFromHost(text: String) {
    val view = RayactHostRegistry.imeView ?: return
    Handler(Looper.getMainLooper()).post {
        val clipboard = view.context.getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
        clipboard?.setPrimaryClip(android.content.ClipData.newPlainText("rayact", text))
    }
}

fun readClipboardFromHost(): String {
    val view = RayactHostRegistry.imeView ?: return ""
    val clipboard = view.context.getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
    val clip = clipboard?.primaryClip ?: return ""
    if (clip.itemCount <= 0) return ""
    return clip.getItemAt(0).coerceToText(view.context)?.toString().orEmpty()
}

fun performHapticFeedbackFromHost() {
    val view = RayactHostRegistry.imeView ?: return
    Handler(Looper.getMainLooper()).post {
        view.performHapticFeedback(android.view.HapticFeedbackConstants.TEXT_HANDLE_MOVE)
    }
}
