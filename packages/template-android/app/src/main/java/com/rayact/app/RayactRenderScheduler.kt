package com.rayact.app

import android.os.Trace
import android.util.Log
import android.view.Choreographer
import com.rayact.engine.RayactEngineSession
import java.util.concurrent.atomic.AtomicInteger

class RayactRenderScheduler(private val session: RayactEngineSession) {
    companion object {
        private const val TAG = "RayactPerf"
    }

    private val surfaceCount = AtomicInteger(0)
    @Volatile private var renderThread: RenderThread? = null

    fun retainSurface() {
        if (surfaceCount.incrementAndGet() == 1) {
            synchronized(this) {
                if (renderThread == null) {
                    renderThread = RenderThread().also { it.start() }
                }
            }
        }
    }

    fun releaseSurface() {
        val remaining = surfaceCount.updateAndGet { count -> (count - 1).coerceAtLeast(0) }
        if (remaining == 0) {
            synchronized(this) {
                renderThread?.quitAndWait()
                renderThread = null
            }
        }
    }

    fun stopRendering() {
        synchronized(this) {
            renderThread?.quitAndWait()
            renderThread = null
            surfaceCount.set(0)
        }
    }

    fun requestFrame() {
        renderThread?.requestFrame()
    }

    fun traceNextFrame(name: String) {
        renderThread?.traceNextFrame(name)
    }

    private inner class RenderThread : Thread(null, null, "RayactRender", 8L * 1024 * 1024) {
        @Volatile private var running = false
        @Volatile private var looper: android.os.Looper? = null
        @Volatile private var handler: android.os.Handler? = null
        @Volatile private var choreographer: Choreographer? = null
        @Volatile private var framePending = false
        @Volatile private var lastFrameTimeNanos = 0L
        @Volatile private var nextTraceName: String? = null

        private val timerWakeup = Runnable {
            if (running) scheduleNextFrame()
        }

        private val frameCallback = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                if (!running) return
                framePending = false
                val traceName = nextTraceName
                nextTraceName = null
                if (traceName != null) {
                    Trace.beginSection(traceName)
                    Log.i(TAG, traceName)
                }
                val prev = lastFrameTimeNanos
                lastFrameTimeNanos = frameTimeNanos
                val deltaNanos = if (prev > 0L) frameTimeNanos - prev else 16_666_667L
                try {
                    val continuous = session.nativeRenderFrame(frameTimeNanos, deltaNanos)
                    if (continuous) {
                        handler?.removeCallbacks(timerWakeup)
                        scheduleNextFrame()
                    } else {
                        val delayMs = session.nativeNextJSTimerDelayMs()
                        handler?.removeCallbacks(timerWakeup)
                        if (delayMs >= 0f) {
                            handler?.postDelayed(timerWakeup, delayMs.toLong().coerceAtLeast(1L))
                        }
                    }
                } finally {
                    if (traceName != null) Trace.endSection()
                }
            }
        }

        override fun run() {
            android.os.Looper.prepare()
            looper = android.os.Looper.myLooper()
            handler = android.os.Handler(android.os.Looper.myLooper()!!)
            choreographer = Choreographer.getInstance()
            running = true
            scheduleNextFrame()
            android.os.Looper.loop()
        }

        private fun scheduleNextFrame() {
            if (!running || framePending) return
            framePending = true
            choreographer?.postFrameCallback(frameCallback)
        }

        fun requestFrame() {
            handler?.post {
                if (running) scheduleNextFrame()
            }
        }

        fun traceNextFrame(name: String) {
            handler?.post {
                nextTraceName = name
                if (running) scheduleNextFrame()
            }
        }

        fun quitAndWait() {
            running = false
            looper?.let { l ->
                android.os.Handler(l).post {
                    choreographer?.removeFrameCallback(frameCallback)
                    l.quitSafely()
                }
            }
            try { join(1000) } catch (_: InterruptedException) {}
        }
    }
}
