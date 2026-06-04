package com.rayact.app

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.rayact.engine.RayactEngine

/**
 * One render surface in the Rayact multi-surface model. Each instance owns:
 *   - one ANativeWindow + one EGL surface (allocated by the native engine)
 *   - one engine screen (its own React tree)
 *   - its own render thread that drives vsync frames
 *
 * The native render loop is debounced: when multiple surfaces all call
 * nativeRenderFrame in the same vsync, only the first call does work. The
 * other surfaces' frames are no-ops, so multi-surface overhead is minimal.
 *
 * Touch events are forwarded to the engine. The engine's hit-test only
 * dispatches to the focused (top of stack) screen, so non-focused surfaces
 * can safely forward touches too — but in practice Android's ViewGroup z-order
 * means only the top view sees MotionEvents.
 */
class RayactSurfaceView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : SurfaceView(context, attrs), SurfaceHolder.Callback {

    private var renderThread: RenderThread? = null
    /** Native surfaceId == engine screenId, or 0 if not yet created. */
    var surfaceId: Int = 0
        private set
    /**
     * Optional one-shot listener invoked when the native surfaceId is ready
     * (i.e. surfaceCreated has fired and the engine has allocated a screen).
     * Used by RayactHostRegistry.requestNewSurface to block until ready.
     */
    var surfaceReadyListener: ((Int) -> Unit)? = null

    init { holder.addCallback(this) }

    override fun surfaceCreated(holder: SurfaceHolder) {
        val density = resources.displayMetrics.density
        val sid = RayactEngine.createSurface(holder.surface, density)
        if (sid <= 0) {
            android.util.Log.e("RayactSurfaceView", "createSurface failed")
            return
        }
        surfaceId = sid
        surfaceReadyListener?.invoke(sid)
        surfaceReadyListener = null
        renderThread = RenderThread().also { it.start() }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        // Native re-reads ANativeWindow_getWidth/Height on each BindWindow, so
        // size changes are picked up automatically.
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        renderThread?.quitAndWait()
        renderThread = null
        if (surfaceId > 0) {
            RayactEngine.destroySurface(surfaceId)
            surfaceId = 0
        }
    }

    /** Push this surface to the top of the focus stack. Call after addView. */
    fun pushToFront() {
        if (surfaceId > 0) RayactEngine.pushSurface(surfaceId)
    }

    /** Pop this surface from the focus stack if it's on top. */
    fun popFromFront(): Boolean {
        if (surfaceId > 0 && RayactEngine.getFocusedSurfaceId() == surfaceId) {
            return RayactEngine.popSurface() != 0
        }
        return false
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val action = when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> RayactEngine.TOUCH_DOWN
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> RayactEngine.TOUCH_UP
            else -> RayactEngine.TOUCH_MOVE
        }
        val idx = event.actionIndex
        RayactEngine.nativeTouch(action, event.getPointerId(idx), event.getX(idx), event.getY(idx))
        renderThread?.requestFrame()
        return true
    }

    /** Render thread: ticks every vsync via Choreographer. The native side
     *  debounces across multiple surfaces, so extra threads are cheap. */
    private inner class RenderThread : Thread(null, null, "RayactRender-$surfaceId", 8L * 1024 * 1024) {

        @Volatile private var running = false
        @Volatile private var looper: android.os.Looper? = null
        @Volatile private var handler: android.os.Handler? = null
        private val frameRunnable = object : Runnable {
            override fun run() {
                if (!running) return
                RayactEngine.nativeRenderFrame()
                handler?.postDelayed(this, 16L)
            }
        }

        override fun run() {
            android.os.Looper.prepare()
            looper = android.os.Looper.myLooper()
            handler = android.os.Handler(android.os.Looper.myLooper()!!)
            running = true
            handler?.post(frameRunnable)
            android.os.Looper.loop()
        }

        fun requestFrame() {
            handler?.post {
                if (running) RayactEngine.nativeRenderFrame()
            }
        }

        fun quitAndWait() {
            running = false
            looper?.let { l ->
                android.os.Handler(l).post {
                    handler?.removeCallbacks(frameRunnable)
                    l.quitSafely()
                }
            }
            try { join(1000) } catch (_: InterruptedException) {}
        }
    }
}
