package com.rayact.app

import android.content.Context
import android.text.InputType
import android.text.Selection
import android.text.SpannableStringBuilder
import android.util.AttributeSet
import android.view.Choreographer
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import android.view.inputmethod.CursorAnchorInfo
import android.view.inputmethod.ExtractedText
import android.view.inputmethod.ExtractedTextRequest
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.rayact.engine.RayactEngine
import com.rayact.engine.RayactHostRegistry
import java.util.concurrent.atomic.AtomicInteger

internal object RayactRenderScheduler {
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

        private val timerWakeup = Runnable {
            if (running) scheduleNextFrame()
        }

        private val frameCallback = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                if (!running) return
                framePending = false
                val prev = lastFrameTimeNanos
                lastFrameTimeNanos = frameTimeNanos
                val deltaNanos = if (prev > 0L) frameTimeNanos - prev else 16_666_667L
                continuous = RayactEngine.nativeRenderFrame(frameTimeNanos, deltaNanos)
                if (continuous) {
                    handler?.removeCallbacks(timerWakeup)
                    scheduleNextFrame()
                } else {
                    // Loop is stopping: if a JS timer is pending, wake up at its
                    // deadline so it can fire inside that frame's JS pump.
                    val delayMs = RayactEngine.nativeNextJSTimerDelayMs()
                    handler?.removeCallbacks(timerWakeup)
                    if (delayMs >= 0f) {
                        handler?.postDelayed(timerWakeup, delayMs.toLong().coerceAtLeast(1L))
                    }
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
    private val imeText = SpannableStringBuilder()
    private var imeInputType: String = "text"
    private var imeAutocorrect: Boolean = false
    private var imeSecure: Boolean = false
    private var imeAction: String = "done"

    /** Called from Kotlin main thread by showSoftKeyboardFromHost. */
    fun setupForIme(
        nodeId: Int,
        initialText: String,
        inputType: String,
        autocorrect: Boolean,
        secure: Boolean,
        imeActionValue: String
    ) {
        imeNodeId = nodeId
        imeText.replace(0, imeText.length, initialText)
        Selection.setSelection(imeText, imeText.length)
        imeInputType = inputType
        imeAutocorrect = autocorrect
        imeSecure = secure
        this.imeAction = imeActionValue
        requestFocus()
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.restartInput(this)
        imm.showSoftInput(this, InputMethodManager.SHOW_IMPLICIT)
    }

    /** Retarget an open IME to a different TextInput without hide/show. */
    fun switchIme(
        nodeId: Int,
        initialText: String,
        inputType: String,
        autocorrect: Boolean,
        secure: Boolean,
        imeActionValue: String
    ) {
        imeNodeId = nodeId
        imeText.replace(0, imeText.length, initialText)
        Selection.setSelection(imeText, imeText.length)
        imeInputType = inputType
        imeAutocorrect = autocorrect
        imeSecure = secure
        this.imeAction = imeActionValue
        activeInputConnection?.editable?.let { ed ->
            ed.replace(0, ed.length, initialText)
            Selection.setSelection(ed, initialText.length)
            activeInputConnection?.resetSnapshot()
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

    /** Native editing state changed — sync the InputConnection without echoing back. */
    fun updateImeState(
        nodeId: Int,
        text: String?,
        selectionStart: Int,
        selectionEnd: Int,
        composingStart: Int,
        composingEnd: Int
    ) {
        if (imeNodeId != nodeId) return
        val ic = activeInputConnection ?: return
        val ed = ic.editable ?: return
        ic.applyingFromNative = true
        if (text != null && text != ed.toString()) {
            ed.replace(0, ed.length, text)
            imeText.replace(0, imeText.length, text)
        }
        val start = if (selectionStart < 0 || selectionEnd < 0) {
            ed.length
        } else {
            minOf(selectionStart, selectionEnd).coerceIn(0, ed.length)
        }
        val end = if (selectionStart < 0 || selectionEnd < 0) {
            ed.length
        } else {
            maxOf(selectionStart, selectionEnd).coerceIn(0, ed.length)
        }
        Selection.setSelection(ed, start, end)
        if (composingStart >= 0 && composingEnd >= composingStart) {
            ic.setComposingRegion(
                composingStart.coerceIn(0, ed.length),
                composingEnd.coerceIn(0, ed.length)
            )
        } else {
            ic.finishComposingText()
        }
        ic.applyingFromNative = false
        ic.resetSnapshot()
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.updateSelection(this, start, end, composingStart, composingEnd)
        val cursorBuilder = CursorAnchorInfo.Builder().setSelectionRange(start, end)
        imm.updateCursorAnchorInfo(this, cursorBuilder.build())
    }

    override fun onCheckIsTextEditor() =
        imeNodeId >= 0 || com.rayact.engine.RayactPlatformViews.focusedEditText != null

    // The IMM asks the served view (this) whether [view] may act as its input
    // proxy. Platform-view EditTexts live in unfocusable Presentation windows
    // on VirtualDisplays, so the IME binds to this surface view and we
    // delegate the InputConnection to the embedded EditText (Flutter's
    // VirtualDisplay text-input mechanism).
    override fun checkInputConnectionProxy(view: android.view.View): Boolean =
        com.rayact.engine.RayactPlatformViews.isPlatformViewInput(view)

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        com.rayact.engine.RayactPlatformViews.createProxyInputConnection(outAttrs)?.let {
            activeInputConnection = null
            return it
        }
        if (imeNodeId < 0) return null
        outAttrs.inputType = buildInputTypeFlags()
        outAttrs.imeOptions = buildImeOptions()
        // Tell the IME where the cursor starts so backspace/insert land correctly.
        outAttrs.initialSelStart = imeText.length
        outAttrs.initialSelEnd = imeText.length
        val ic = RayactInputConnection()
        // Seed the connection's Editable with the current field value so the IME
        // can delete/edit existing text (backspace on an empty Editable is a no-op).
        ic.editable?.let { ed ->
            ed.replace(0, ed.length, imeText)
            Selection.setSelection(ed, imeText.length)
            ic.resetSnapshot()
        }
        activeInputConnection = ic
        return ic
    }

    private var activeInputConnection: RayactInputConnection? = null

    private fun buildInputTypeFlags(): Int {
        var flags = when (imeInputType) {
            "email" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            "number" -> InputType.TYPE_CLASS_NUMBER
            "phone" -> InputType.TYPE_CLASS_PHONE
            "password" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            "multiline" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            else -> InputType.TYPE_CLASS_TEXT
        }
        if (!imeAutocorrect || imeSecure) {
            flags = flags or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        }
        return flags
    }

    private fun buildImeOptions(): Int {
        val action = when (imeAction) {
            "go" -> EditorInfo.IME_ACTION_GO
            "next" -> EditorInfo.IME_ACTION_NEXT
            "send" -> EditorInfo.IME_ACTION_SEND
            "search" -> EditorInfo.IME_ACTION_SEARCH
            else -> EditorInfo.IME_ACTION_DONE
        }
        return action or EditorInfo.IME_FLAG_NO_FULLSCREEN
    }

    private inner class RayactInputConnection : BaseInputConnection(this@RayactSurfaceView, true) {
        // Flutter-style client binding: this connection may only write to the
        // node it was created for. A stale connection (kept alive by the IMM
        // across restartInput/focus changes) must never push its editable at
        // whatever imeNodeId currently points to — that cross-field write is
        // how a non-focused field can get wiped.
        private val boundNodeId = imeNodeId
        var applyingFromNative: Boolean = false
        private var batchDepth = 0
        private var lastText = ""
        private var lastSelStart = -1
        private var lastSelEnd = -1
        private var lastCompStart = -1
        private var lastCompEnd = -1

        override fun getEditable() = imeText

        fun resetSnapshot() {
            val ed = editable ?: return
            lastText = ed.toString()
            lastSelStart = Selection.getSelectionStart(ed)
            lastSelEnd = Selection.getSelectionEnd(ed)
            lastCompStart = BaseInputConnection.getComposingSpanStart(ed)
            lastCompEnd = BaseInputConnection.getComposingSpanEnd(ed)
        }

        override fun beginBatchEdit(): Boolean {
            batchDepth += 1
            return true
        }

        override fun endBatchEdit(): Boolean {
            if (batchDepth > 0) batchDepth -= 1
            if (batchDepth == 0) syncToNative()
            return true
        }

        override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean {
            val ok = super.commitText(text, newCursorPosition)
            syncToNative()
            return ok
        }

        override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean {
            if (text.isNullOrEmpty()) {
                val ok = finishComposingText()
                syncToNative()
                return ok
            }
            val ok = super.setComposingText(text, newCursorPosition)
            syncToNative()
            return ok
        }

        override fun getExtractedText(request: ExtractedTextRequest?, flags: Int): ExtractedText? {
            val ed = editable ?: return null
            return ExtractedText().apply {
                text = ed.toString()
                partialStartOffset = 0
                partialEndOffset = text?.length ?: 0
                selectionStart = Selection.getSelectionStart(ed)
                selectionEnd = Selection.getSelectionEnd(ed)
                this.flags = flags
            }
        }

        override fun requestCursorUpdates(cursorUpdateMode: Int): Boolean {
            syncToNative()
            return true
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

        override fun closeConnection() {
            while (batchDepth > 0) batchDepth -= 1
            syncToNative()
            super.closeConnection()
        }

        private fun syncToNative() {
            if (applyingFromNative) return
            if (batchDepth > 0) return
            if (imeNodeId < 0) return
            if (this !== activeInputConnection || boundNodeId != imeNodeId) return
            val ed = editable ?: return
            val text = ed.toString()
            val selStart = Selection.getSelectionStart(ed).coerceIn(0, text.length)
            val selEnd = Selection.getSelectionEnd(ed).coerceIn(0, text.length)
            val compStart = BaseInputConnection.getComposingSpanStart(ed)
            val compEnd = BaseInputConnection.getComposingSpanEnd(ed)
            if (text == lastText && selStart == lastSelStart && selEnd == lastSelEnd &&
                compStart == lastCompStart && compEnd == lastCompEnd) {
                return
            }
            lastText = text
            lastSelStart = selStart
            lastSelEnd = selEnd
            lastCompStart = compStart
            lastCompEnd = compEnd
            RayactEngine.nativeSetTextInputContent(
                imeNodeId,
                text,
                selStart,
                selEnd,
                compStart,
                compEnd
            )
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
            reportKeyboardInsets(windowInsets)
            if (!windowInsets.isVisible(WindowInsetsCompat.Type.ime()) && imeNodeId >= 0) {
                RayactEngine.nativeImeHiddenBySystem()
                imeNodeId = -1
                imeText.clear()
                activeInputConnection = null
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
        RayactRenderScheduler.requestFrame()
    }

    private var lastImeHeightDp = -1f
    private var lastImeVisible = false

    private fun reportKeyboardInsets(windowInsets: WindowInsetsCompat) {
        val density = resources.displayMetrics.density
        if (density <= 0f) return
        val visible = windowInsets.isVisible(WindowInsetsCompat.Type.ime())
        val imeBottomPx = windowInsets.getInsets(WindowInsetsCompat.Type.ime()).bottom
        val navBottomPx = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom
        // Keyboard height above the nav bar: AvoidKeyboard adds safeArea.bottom
        // back on top, so the net offset lands at the IME's top edge.
        val heightDp = ((imeBottomPx - navBottomPx).coerceAtLeast(0)) / density
        if (visible == lastImeVisible && heightDp == lastImeHeightDp) return
        lastImeVisible = visible
        lastImeHeightDp = heightDp
        RayactEngine.setKeyboardInsets(heightDp, visible, 250f)
        RayactRenderScheduler.requestFrame()
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
        reportSurfaceResize(width, height)
    }

    override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
        super.onSizeChanged(width, height, oldWidth, oldHeight)
        if (width <= 0 || height <= 0 || (width == oldWidth && height == oldHeight)) return
        if (RayactEngine.relayoutOnSurfaceResizeEnabled()) reportSurfaceResize(width, height)
    }

    fun syncSurfaceSizeFromLayout() {
        if (!RayactEngine.relayoutOnSurfaceResizeEnabled()) return
        requestLayout()
        post {
            if (width > 0 && height > 0) reportSurfaceResize(width, height)
        }
    }

    private fun reportSurfaceResize(width: Int, height: Int) {
        if (surfaceId <= 0 || width <= 0 || height <= 0) return
        updateSafeAreaInsets()
        RayactEngine.resizeSurface(surfaceId, width, height, resources.displayMetrics.density)
        RayactRenderScheduler.requestFrame()
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
        // Gestures starting inside a platform-view field route wholesale into
        // its Presentation (real event stream → native caret/selection).
        if (com.rayact.engine.RayactPlatformViews.routeTouch(event)) {
            return true
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
