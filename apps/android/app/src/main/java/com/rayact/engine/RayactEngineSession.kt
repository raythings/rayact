package com.rayact.engine

import android.view.Surface
import com.rayact.app.RayactRenderScheduler

class RayactEngineSession private constructor(val nativeHandle: Long) {
    val host = RayactHost(this, RayactRenderScheduler(this))

    // Cleared on destroy so callers (e.g. the shared DevClientBridge) can avoid
    // invoking native methods on a torn-down engine handle.
    @Volatile private var destroyed = false
    fun isAlive(): Boolean = !destroyed

    fun acquireGraphics(): Boolean = nativeAcquireGraphics(nativeHandle)
    fun releaseGraphics() {
        host.renderScheduler.stopRendering()
        nativeReleaseGraphics(nativeHandle)
    }
    fun destroy() {
        destroyed = true
        nativeDestroy(nativeHandle)
    }

    fun loadSource(source: String): Boolean = nativeLoadScript(nativeHandle, 0, source)
    fun loadDevClient(source: String): Boolean = nativeLoadScript(nativeHandle, 0, source)
    fun loadDevServer(url: String): Boolean = nativeLoadScript(nativeHandle, 1, url)
    fun loadBytecode(bytes: ByteArray): Boolean = nativeLoadBytecode(nativeHandle, bytes)
    private fun devTransportScript(serverUrl: String): String = """
        globalThis.__RAYACT_DEV_SERVER__ = ${org.json.JSONObject.quote(serverUrl)};
        globalThis.__rayactDevFetch = function(url) { return rayactDevFetch(url); };
    """.trimIndent()

    /**
     * Load the dev bootstrap with its transport globals in a SINGLE script.
     * nativeLoadScript keeps only one pending script slot, so a separate
     * injectDevTransport() call would be clobbered by the bootstrap load and the
     * bootstrap would run without __RAYACT_DEV_SERVER__ (→ black screen).
     */
    fun loadDevBootstrap(serverUrl: String, source: String): Boolean =
        loadSource(devTransportScript(serverUrl) + "\n" + source)

    fun applyModuleUpdate(path: String, source: String): Boolean =
        nativeApplyModuleUpdate(nativeHandle, path, source)

    fun createSurface(surface: Surface, density: Float): Int =
        nativeCreateSurface(nativeHandle, surface, density)

    fun resizeSurface(surfaceId: Int, width: Int, height: Int, density: Float) =
        nativeResizeSurface(nativeHandle, surfaceId, width, height, density)

    fun relayoutOnSurfaceResizeEnabled(): Boolean =
        nativeRelayoutOnSurfaceResizeEnabled(nativeHandle)

    fun setSafeAreaInsets(top: Float, right: Float, bottom: Float, left: Float) =
        nativeSetSafeAreaInsets(nativeHandle, top, right, bottom, left)

    fun setKeyboardInsets(heightDp: Float, visible: Boolean, durationMs: Float) =
        nativeSetKeyboardInsets(nativeHandle, heightDp, visible, durationMs)

    fun destroySurface(surfaceId: Int) = nativeDestroySurface(nativeHandle, surfaceId)
    fun pushSurface(surfaceId: Int) = nativePushSurface(nativeHandle, surfaceId)
    fun popSurface(): Int = nativePopSurface(nativeHandle)
    fun getFocusedSurfaceId(): Int = nativeGetFocusedSurfaceId(nativeHandle)

    fun nativeRenderFrame(frameTimeNanos: Long, deltaNanos: Long): Boolean =
        nativeRenderFrame(nativeHandle, frameTimeNanos, deltaNanos)

    fun nativeNextJSTimerDelayMs(): Float = nativeNextJSTimerDelayMs(nativeHandle)
    fun nativeToggleDevMenu() = nativeToggleDevMenu(nativeHandle)
    fun nativeOnBackPressed() = nativeOnBackPressed(nativeHandle)

    fun nativeTouch(action: Int, id: Int, x: Float, y: Float) =
        nativeTouch(nativeHandle, action, id, x, y)

    fun nativeSetTextInputContent(
        nodeId: Int, text: String,
        selectionStart: Int, selectionEnd: Int,
        composingStart: Int, composingEnd: Int
    ) = nativeSetTextInputContent(
        nativeHandle, nodeId, text, selectionStart, selectionEnd, composingStart, composingEnd
    )

    fun nativeBlurTextInput() = nativeBlurTextInput(nativeHandle)
    fun nativeImeHiddenBySystem() = nativeImeHiddenBySystem(nativeHandle)

    fun nativePushExternalViewFrame(nodeId: Int, buffer: android.hardware.HardwareBuffer) =
        nativePushExternalViewFrame(nativeHandle, nodeId, buffer)

    fun nativeExternalViewTextChanged(nodeId: Int, text: String) =
        nativeExternalViewTextChanged(nativeHandle, nodeId, text)

    fun nativeSetExternalViewInsets(nodeId: Int, l: Float, t: Float, r: Float, b: Float) =
        nativeSetExternalViewInsets(nativeHandle, nodeId, l, t, r, b)

    companion object {
        init { System.loadLibrary("rayact") }

        fun create(dataPath: String): RayactEngineSession? {
            val handle = nativeCreate(dataPath)
            if (handle == 0L) return null
            val session = RayactEngineSession(handle)
            nativeRegisterHost(handle, session.host.hostCallbacks)
            RayactPlatformViews.bindSession(session)
            return session
        }

        const val TOUCH_DOWN = 0
        const val TOUCH_UP = 1
        const val TOUCH_MOVE = 2

        @JvmStatic external fun nativeCreate(dataPath: String): Long
        @JvmStatic external fun nativeRegisterHost(handle: Long, callbacks: RayactEngineHostCallbacks)
        @JvmStatic external fun nativeDestroy(handle: Long)
        @JvmStatic external fun nativeAcquireGraphics(handle: Long): Boolean
        @JvmStatic external fun nativeReleaseGraphics(handle: Long)
        @JvmStatic external fun nativeLoadScript(handle: Long, mode: Int, arg: String): Boolean
        @JvmStatic external fun nativeLoadBytecode(handle: Long, bytes: ByteArray): Boolean
        @JvmStatic external fun nativeApplyModuleUpdate(handle: Long, path: String, source: String): Boolean
        @JvmStatic external fun nativeToggleDevMenu(handle: Long)
        @JvmStatic external fun nativeCreateSurface(handle: Long, surface: Surface, density: Float): Int
        @JvmStatic external fun nativeResizeSurface(handle: Long, surfaceId: Int, width: Int, height: Int, density: Float)
        @JvmStatic external fun nativeRelayoutOnSurfaceResizeEnabled(handle: Long): Boolean
        @JvmStatic external fun nativeSetSafeAreaInsets(handle: Long, top: Float, right: Float, bottom: Float, left: Float)
        @JvmStatic external fun nativeSetKeyboardInsets(handle: Long, heightDp: Float, visible: Boolean, durationMs: Float)
        @JvmStatic external fun nativeDestroySurface(handle: Long, surfaceId: Int)
        @JvmStatic external fun nativePushSurface(handle: Long, surfaceId: Int)
        @JvmStatic external fun nativePopSurface(handle: Long): Int
        @JvmStatic external fun nativeGetFocusedSurfaceId(handle: Long): Int
        @JvmStatic external fun nativeRenderFrame(handle: Long, frameTimeNanos: Long, deltaNanos: Long): Boolean
        @JvmStatic external fun nativeNextJSTimerDelayMs(handle: Long): Float
        @JvmStatic external fun nativeTouch(handle: Long, action: Int, id: Int, x: Float, y: Float)
        @JvmStatic external fun nativeOnBackPressed(handle: Long)
        @JvmStatic external fun nativeSetTextInputContent(
            handle: Long, nodeId: Int, text: String,
            selectionStart: Int, selectionEnd: Int, composingStart: Int, composingEnd: Int
        )
        @JvmStatic external fun nativeBlurTextInput(handle: Long)
        @JvmStatic external fun nativeImeHiddenBySystem(handle: Long)
        @JvmStatic external fun nativePushExternalViewFrame(handle: Long, nodeId: Int, buffer: android.hardware.HardwareBuffer)
        @JvmStatic external fun nativeExternalViewTextChanged(handle: Long, nodeId: Int, text: String)
        @JvmStatic external fun nativeSetExternalViewInsets(handle: Long, nodeId: Int, l: Float, t: Float, r: Float, b: Float)
    }
}
