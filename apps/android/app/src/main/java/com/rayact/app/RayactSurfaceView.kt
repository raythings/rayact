package com.rayact.app

import android.content.Context
import android.util.AttributeSet
import android.view.Choreographer
import android.view.MotionEvent
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.rayact.engine.RayactEngine

/**
 * Hosts one Rayact render surface. The engine runs on a dedicated render thread;
 * a Choreographer frame callback (posted on that thread's Looper) drives one
 * nativeRenderFrame() per vsync. Touch is forwarded from the UI thread.
 *
 * In the full react-navigation native-stack model there is one of these per
 * Screen container; for now a single instance hosts the root screen.
 */
class RayactSurfaceView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : SurfaceView(context, attrs), SurfaceHolder.Callback {

    private var renderThread: RenderThread? = null

    init { holder.addCallback(this) }

    override fun surfaceCreated(holder: SurfaceHolder) {
        val density = resources.displayMetrics.density
        renderThread = RenderThread(holder.surface, density).also { it.start() }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        renderThread?.quitAndWait()
        renderThread = null
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val action = when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> RayactEngine.TOUCH_DOWN
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> RayactEngine.TOUCH_UP
            else -> RayactEngine.TOUCH_MOVE
        }
        val idx = event.actionIndex
        RayactEngine.nativeTouch(action, event.getPointerId(idx), event.getX(idx), event.getY(idx))
        return true
    }

    /** Render thread: binds the surface, then ticks every vsync via Choreographer. */
    private class RenderThread(
        private val surface: Surface,
        private val density: Float
    ) : Thread("RayactRender"), Choreographer.FrameCallback {

        @Volatile private var running = false
        private lateinit var choreographer: Choreographer
        @Volatile private var looper: android.os.Looper? = null

        override fun run() {
            android.os.Looper.prepare()
            looper = android.os.Looper.myLooper()
            RayactEngine.nativeSurfaceCreated(surface, density)
            running = true
            choreographer = Choreographer.getInstance()
            choreographer.postFrameCallback(this)
            android.os.Looper.loop()
            RayactEngine.nativeSurfaceDestroyed()
        }

        override fun doFrame(frameTimeNanos: Long) {
            if (!running) return
            RayactEngine.nativeRenderFrame()
            choreographer.postFrameCallback(this)
        }

        fun quitAndWait() {
            running = false
            // Stop the vsync loop and quit the render Looper from its own thread.
            looper?.let { l ->
                android.os.Handler(l).post {
                    if (this::choreographer.isInitialized) choreographer.removeFrameCallback(this)
                    l.quitSafely()
                }
            }
            try { join(1000) } catch (_: InterruptedException) {}
        }
    }
}
