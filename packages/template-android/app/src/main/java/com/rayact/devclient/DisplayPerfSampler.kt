package com.rayact.devclient

import android.app.Activity
import android.view.Choreographer
import org.json.JSONObject

object DisplayPerfSampler {
    private var active = false
    private var lastFrameNs = 0L
    private var windowStartNs = 0L
    private var frames = 0
    private var totalDeltaNs = 0L
    private var dropped = 0L
    private var janky = 0L
    private var samples = 0L
    private var refreshRate = 60.0
    private val callback = object : Choreographer.FrameCallback {
        override fun doFrame(t: Long) {
            if (!active) { lastFrameNs = 0; return }
            if (windowStartNs == 0L) windowStartNs = t
            if (lastFrameNs != 0L) {
                val delta = t - lastFrameNs
                val target = 1_000_000_000.0 / refreshRate
                frames++; samples++; totalDeltaNs += delta
                if (delta > target * 1.5) janky++
                if (delta > target * 2.0) dropped += (delta / target).toLong() - 1
            }
            lastFrameNs = t
            Choreographer.getInstance().postFrameCallback(this)
        }
    }
    fun setActive(activity: Activity?, enabled: Boolean) { activity?.runOnUiThread {
        if (active == enabled) return@runOnUiThread
        active = enabled; lastFrameNs = 0; windowStartNs = 0; frames = 0; totalDeltaNs = 0; dropped = 0; janky = 0; samples = 0
        if (enabled) { refreshRate = activity.display?.refreshRate?.toDouble()?.takeIf { it > 0 } ?: 60.0; Choreographer.getInstance().postFrameCallback(callback) }
        else Choreographer.getInstance().removeFrameCallback(callback)
    } }
    @Synchronized fun appendTo(out: JSONObject) {
        val now = System.nanoTime(); val elapsed = if (windowStartNs > 0) (now-windowStartNs)/1e9 else 0.0
        val fps = (if (elapsed > 0) frames/elapsed else 0.0).coerceAtMost(refreshRate); val avg = if (frames > 0) totalDeltaNs/1e6/frames else 0.0
        out.put("frameTimeMs",avg).put("rollingFrameTimeMs",avg).put("fps",fps).put("targetRefreshRate",refreshRate)
            .put("droppedFrames",dropped).put("jankyFrames",janky).put("sampleFrames",samples)
        windowStartNs=now; frames=0; totalDeltaNs=0
    }
}
