package com.rayact.app

import android.content.Context
import android.text.InputType
import android.text.Selection
import android.util.AttributeSet
import android.view.Choreographer
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.rayact.engine.RayactEngine
import com.rayact.engine.RayactHostRegistry
import java.util.concurrent.atomic.AtomicInteger

private object RayactRenderScheduler {
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

    fun requestFrame() {
        renderThread?.requestFrame()
    }

    private class RenderThread : Thread(null, null, "RayactRender", 8L * 1024 * 1024) {
        @Volatile private var running = false
        @Volatile private var looper: android.os.Looper? = null
        @Volatile private var handler: android.os.Handler? = null
        @Volatile private var choreographer: Choreographer? = null
        @Volatile private var framePending = false
        @Volatile private var continuous = false
        @Volatile private var lastFrameTimeNanos = 0L

        private val frameCallback = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                if (!running) return
                framePending = false
                val prev = lastFrameTimeNanos
                lastFrameTimeNanos = frameTimeNanos
                val deltaNanos = if (prev > 0L) frameTimeNanos - prev else 16_666_667L
                continuous = RayactEngine.nativeRenderFrame(frameTimeNanos, deltaNanos)
                if (continuous) scheduleNextFrame()
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

/**
 * One render surface in the Rayact multi-surface model. Each instance owns:
 *   - one ANativeWindow + one EGL surface (allocated by the native engine)
 *   - one engine screen (its own React tree)
 *   - frame requests into the process-level Rayact render scheduler
 *
 * A single process-level render thread pumps JS and renders all visible
 * surfaces. SurfaceViews register/destroy native windows and request frames;
 * they do not own render threads.
 *
 * Touch events are forwarded only from the focused surface. Lower layers stay
 * mounted for navigation state, but they must not render or accept input while
 * a higher layer is above them.
 */
class RayactSurfaceView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : SurfaceView(context, attrs), SurfaceHolder.Callback {

    /** Native surfaceId == engine screenId, or 0 if not yet created. */
    var surfaceId: Int = 0
        private set
    /**
     * Optional one-shot listener invoked when the native surfaceId is ready
     * (i.e. surfaceCreated has fired and the engine has allocated a screen).
     * Used by RayactHostRegistry.requestNewSurface to block until ready.
     */
    var surfaceReadyListener: ((Int) -> Unit)? = null

    // ── IME (soft keyboard) ───────────────────────────────────────────────────
    private var imeNodeId: Int = -1
    private val imeText = StringBuilder()

    /** Called from Kotlin main thread by showSoftKeyboardFromHost. */
    fun setupForIme(nodeId: Int, initialText: String) {
        imeNodeId = nodeId
        imeText.clear()
        imeText.append(initialText)
        requestFocus()
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.restartInput(this)
        imm.showSoftInput(this, InputMethodManager.SHOW_IMPLICIT)
    }

    /** Retarget an open IME to a different TextInput without hide/show. */
    fun switchIme(nodeId: Int, initialText: String) {
        imeNodeId = nodeId
        imeText.clear()
        imeText.append(initialText)
        activeInputConnection?.editable?.let { ed ->
            ed.clear()
            ed.append(initialText)
            Selection.setSelection(ed, initialText.length)
        }
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.restartInput(this)
    }

    /** Called from Kotlin main thread by hideSoftKeyboardFromHost. */
    fun clearIme() {
        imeNodeId = -1
        imeText.clear()
        activeInputConnection = null
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(windowToken, 0)
    }

    /** Native caret moved (tap-to-caret) — sync the InputConnection selection. */
    fun updateImeSelection(nodeId: Int, cursor: Int) {
        if (imeNodeId != nodeId) return
        val ic = activeInputConnection ?: return
        val ed = ic.editable ?: return
        val pos = cursor.coerceIn(0, ed.length)
        Selection.setSelection(ed, pos)
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.updateSelection(this, pos, pos, -1, -1)
    }

    override fun onCheckIsTextEditor() = imeNodeId >= 0

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        if (imeNodeId < 0) return null
        outAttrs.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        outAttrs.imeOptions = EditorInfo.IME_ACTION_DONE or EditorInfo.IME_FLAG_NO_FULLSCREEN
        // Tell the IME where the cursor starts so backspace/insert land correctly.
        outAttrs.initialSelStart = imeText.length
        outAttrs.initialSelEnd = imeText.length
        val ic = RayactInputConnection()
        // Seed the connection's Editable with the current field value so the IME
        // can delete/edit existing text (backspace on an empty Editable is a no-op).
        ic.editable?.let { ed ->
            ed.clear()
            ed.append(imeText)
            Selection.setSelection(ed, imeText.length)
        }
        activeInputConnection = ic
        return ic
    }

    private var activeInputConnection: RayactInputConnection? = null

    private inner class RayactInputConnection : BaseInputConnection(this@RayactSurfaceView, true) {
        override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean {
            val ok = super.commitText(text, newCursorPosition)
            syncToNative()
            return ok
        }

        override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean {
            val ok = super.setComposingText(text, newCursorPosition)
            syncToNative()
            return ok
        }

        override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
            val ok = super.deleteSurroundingText(beforeLength, afterLength)
            syncToNative()
            return ok
        }

        override fun sendKeyEvent(event: KeyEvent): Boolean {
            // Hardware/soft DEL key — delete one char before the cursor ourselves so
            // it works even when there is no composing region.
            if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_DEL) {
                val ed = editable
                if (ed != null && ed.isNotEmpty()) {
                    val end = Selection.getSelectionEnd(ed).coerceIn(0, ed.length)
                    val start = Selection.getSelectionStart(ed).coerceIn(0, ed.length)
                    if (start != end) {
                        ed.delete(minOf(start, end), maxOf(start, end))
                    } else if (end > 0) {
                        ed.delete(end - 1, end)
                    }
                    syncToNative()
                }
                return true
            }
            if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_ENTER) {
                RayactEngine.nativeBlurTextInput()
                clearIme()
                return true
            }
            val ok = super.sendKeyEvent(event)
            if (event.action == KeyEvent.ACTION_DOWN) syncToNative()
            return ok
        }

        override fun performEditorAction(actionCode: Int): Boolean {
            if (actionCode == EditorInfo.IME_ACTION_DONE || actionCode == EditorInfo.IME_ACTION_GO ||
                actionCode == EditorInfo.IME_ACTION_NEXT || actionCode == EditorInfo.IME_ACTION_SEND) {
                RayactEngine.nativeBlurTextInput()
                clearIme()
                return true
            }
            return super.performEditorAction(actionCode)
        }

        private fun syncToNative() {
            if (imeNodeId < 0) return
            val ed = editable ?: return
            val text = ed.toString()
            imeText.clear(); imeText.append(text)
            val cursor = Selection.getSelectionEnd(ed).coerceIn(0, text.length)
            RayactEngine.nativeSetTextInputContent(imeNodeId, text, cursor)
            // IME commits arrive without a touch event — request a frame so the
            // render thread drains the update and repaints immediately.
            RayactRenderScheduler.requestFrame()
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    init {
        isFocusable = true
        isFocusableInTouchMode = true
        holder.addCallback(this)
        ViewCompat.setOnApplyWindowInsetsListener(this) { _, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            reportSafeAreaInsets(insets.top, insets.right, insets.bottom, insets.left)
            if (!windowInsets.isVisible(WindowInsetsCompat.Type.ime()) && imeNodeId >= 0) {
                RayactEngine.nativeImeHiddenBySystem()
            }
            windowInsets
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        ViewCompat.requestApplyInsets(this)
    }

    private fun reportSafeAreaInsets(topPx: Int, rightPx: Int, bottomPx: Int, leftPx: Int) {
        val density = resources.displayMetrics.density
        if (density <= 0f) return
        RayactEngine.setSafeAreaInsets(
            topPx / density,
            rightPx / density,
            bottomPx / density,
            leftPx / density
        )
    }

    private fun updateSafeAreaInsets() {
        val insets = ViewCompat.getRootWindowInsets(this)
            ?.getInsets(WindowInsetsCompat.Type.systemBars())
            ?: return
        reportSafeAreaInsets(insets.top, insets.right, insets.bottom, insets.left)
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        updateSafeAreaInsets()
        val density = resources.displayMetrics.density
        val sid = RayactEngine.createSurface(holder.surface, density)
        if (sid <= 0) {
            android.util.Log.e("RayactSurfaceView", "createSurface failed")
            return
        }
        surfaceId = sid
        surfaceReadyListener?.invoke(sid)
        surfaceReadyListener = null
        RayactHostRegistry.registerImeView(this)
        RayactRenderScheduler.retainSurface()
        RayactRenderScheduler.requestFrame()
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        // Native re-reads ANativeWindow_getWidth/Height on each BindWindow, so
        // size changes are picked up automatically.
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        if (surfaceId > 0) {
            RayactHostRegistry.unregisterImeView(this)
            RayactEngine.destroySurface(surfaceId)
            surfaceId = 0
            RayactRenderScheduler.releaseSurface()
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
        if (surfaceId <= 0 || RayactEngine.getFocusedSurfaceId() != surfaceId) {
            return false
        }
        val action = when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> RayactEngine.TOUCH_DOWN
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> RayactEngine.TOUCH_UP
            else -> RayactEngine.TOUCH_MOVE
        }
        val idx = event.actionIndex
        RayactEngine.nativeTouch(action, event.getPointerId(idx), event.getX(idx), event.getY(idx))
        RayactRenderScheduler.requestFrame()
        return true
    }
}
