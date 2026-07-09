package com.rayact.app

import android.content.Context
import android.graphics.Matrix
import android.graphics.Paint
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
import com.rayact.engine.RayactEngineSession
import java.util.concurrent.atomic.AtomicInteger

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
    context: Context,
    private val session: RayactEngineSession,
    attrs: AttributeSet? = null
) : SurfaceView(context, attrs), SurfaceHolder.Callback {

    /** Native surfaceId == engine screenId, or 0 if not yet created. */
    var surfaceId: Int = 0
        private set
    private var renderSurfaceRetained = false
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
        activeInputConnection?.let { ic ->
            ic.finishComposingText()
            ic.resetSnapshot()
        }
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
        val compStart = if (composingStart >= 0 && composingEnd >= composingStart) {
            composingStart.coerceIn(0, ed.length)
        } else {
            -1
        }
        val compEnd = if (composingStart >= 0 && composingEnd >= composingStart) {
            composingEnd.coerceIn(0, ed.length)
        } else {
            -1
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
        if (compStart >= 0 && compEnd >= compStart) {
            ic.setComposingRegion(compStart, compEnd)
        } else {
            ic.finishComposingText()
        }
        ic.applyingFromNative = false
        ic.resetSnapshot()
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.updateSelection(this, start, end, compStart, compEnd)
        val cursor = Selection.getSelectionEnd(ed).coerceIn(0, ed.length)
        val paint = Paint().apply {
            textSize = 16f * resources.displayMetrics.scaledDensity
            isAntiAlias = true
        }
        val cursorX = paint.measureText(ed.substring(0, cursor))
        val cursorHeight = paint.fontSpacing
        imm.updateCursorAnchorInfo(
            this,
            CursorAnchorInfo.Builder()
                .setSelectionRange(start, end)
                .setMatrix(Matrix())
                .setInsertionMarkerLocation(cursorX, 0f, cursorX, cursorHeight, CursorAnchorInfo.FLAG_HAS_VISIBLE_REGION)
                .build()
        )
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

        override fun setSelection(start: Int, end: Int): Boolean {
            val ok = super.setSelection(start, end)
            syncToNative()
            return ok
        }

        override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
            val ok = super.deleteSurroundingText(beforeLength, afterLength)
            syncToNative()
            return ok
        }

        override fun sendKeyEvent(event: KeyEvent): Boolean {
            if (imeNodeId == -2 && event.action == KeyEvent.ACTION_DOWN) {
                when (event.keyCode) {
                    KeyEvent.KEYCODE_DEL -> {
                        session.nativeKeyEvent(0, "Backspace", "Backspace", "", false, false, false, false, false)
                        session.host.renderScheduler.requestFrame()
                        return true
                    }
                    KeyEvent.KEYCODE_ENTER -> {
                        session.nativeKeyEvent(0, "Enter", "Enter", "", false, false, false, false, false)
                        session.host.renderScheduler.requestFrame()
                        return true
                    }
                }
            }
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
                session.nativeBlurTextInput()
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
                session.nativeBlurTextInput()
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
            session.nativeSetTextInputContent(
                imeNodeId,
                text,
                selStart,
                selEnd,
                compStart,
                compEnd
            )
            // IME commits arrive without a touch event — request a frame so the
            // render thread drains the update and repaints immediately.
            session.host.renderScheduler.requestFrame()
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
                session.nativeImeHiddenBySystem()
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

    override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
        super.onWindowFocusChanged(hasWindowFocus)
        if (!hasWindowFocus && imeNodeId >= 0) {
            session.nativeBlurTextInput()
            clearIme()
        }
    }

    private fun reportSafeAreaInsets(topPx: Int, rightPx: Int, bottomPx: Int, leftPx: Int) {
        val density = resources.displayMetrics.density
        if (density <= 0f) return
        session.setSafeAreaInsets(
            topPx / density,
            rightPx / density,
            bottomPx / density,
            leftPx / density
        )
        session.host.renderScheduler.requestFrame()
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
        session.setKeyboardInsets(heightDp, visible, 250f)
        session.host.renderScheduler.requestFrame()
    }

    private fun updateSafeAreaInsets() {
        val insets = ViewCompat.getRootWindowInsets(this)
            ?.getInsets(WindowInsetsCompat.Type.systemBars())
            ?: return
        reportSafeAreaInsets(insets.top, insets.right, insets.bottom, insets.left)
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        updateSafeAreaInsets()
        if (surfaceId > 0) {
            session.destroySurface(surfaceId)
            surfaceId = 0
        }
        val density = resources.displayMetrics.density
        val sid = session.createSurface(holder.surface, density)
        if (sid <= 0) {
            android.util.Log.e("RayactSurfaceView", "createSurface failed")
            return
        }
        surfaceId = sid
        surfaceReadyListener?.invoke(sid)
        surfaceReadyListener = null
        session.host.registerImeView(this)
        if (!renderSurfaceRetained) {
            session.host.renderScheduler.retainSurface()
            renderSurfaceRetained = true
        }
        session.host.renderScheduler.requestFrame()
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        reportSurfaceResize(width, height)
    }

    override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
        super.onSizeChanged(width, height, oldWidth, oldHeight)
        if (width <= 0 || height <= 0 || (width == oldWidth && height == oldHeight)) return
        reportSurfaceResize(width, height)
    }

    fun syncSurfaceSizeFromLayout() {
        requestLayout()
        post {
            if (width > 0 && height > 0) reportSurfaceResize(width, height)
        }
    }

    fun recreateNativeSurfaceAfterGraphicsResume() {
        val surface = holder.surface
        if (!surface.isValid) return
        if (surfaceId > 0) {
            session.destroySurface(surfaceId)
            surfaceId = 0
        }
        renderSurfaceRetained = false
        surfaceCreated(holder)
        post {
            if (width > 0 && height > 0) reportSurfaceResize(width, height)
        }
    }

    private fun reportSurfaceResize(width: Int, height: Int) {
        if (surfaceId <= 0 || width <= 0 || height <= 0) return
        updateSafeAreaInsets()
        session.resizeSurface(surfaceId, width, height, resources.displayMetrics.density)
        session.host.renderScheduler.requestFrame()
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        if (surfaceId > 0) {
            session.host.unregisterImeView(this)
            session.destroySurface(surfaceId)
            surfaceId = 0
            if (renderSurfaceRetained) {
                session.host.renderScheduler.releaseSurface()
                renderSurfaceRetained = false
            }
        }
    }

    /** Push this surface to the top of the focus stack. Call after addView. */
    fun pushToFront() {
        if (surfaceId > 0) session.pushSurface(surfaceId)
    }

    /** Pop this surface from the focus stack if it's on top. */
    fun popFromFront(): Boolean {
        if (surfaceId > 0 && session.getFocusedSurfaceId() == surfaceId) {
            return session.popSurface() != 0
        }
        return false
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (surfaceId <= 0 || session.getFocusedSurfaceId() != surfaceId) {
            return false
        }
        // Gestures starting inside a platform-view field route wholesale into
        // its Presentation (real event stream → native caret/selection).
        if (com.rayact.engine.RayactPlatformViews.routeTouch(event)) {
            return true
        }
        val action = when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> RayactEngineSession.TOUCH_DOWN
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> RayactEngineSession.TOUCH_UP
            else -> RayactEngineSession.TOUCH_MOVE
        }
        val idx = event.actionIndex
        session.nativeTouch(action, event.getPointerId(idx), event.getX(idx), event.getY(idx))
        session.host.renderScheduler.requestFrame()
        return true
    }
}
