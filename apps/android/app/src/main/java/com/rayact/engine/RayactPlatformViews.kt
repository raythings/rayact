package com.rayact.engine

import android.app.Presentation
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.graphics.Rect
import android.graphics.RectF
import android.hardware.HardwareBuffer
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.Log
import android.view.KeyEvent
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import java.util.concurrent.ConcurrentHashMap

/**
 * Android producers for ExternalView nodes (platform views composited as
 * textures). A "textfield" node hosts a real [EditText] inside a
 * [Presentation] on a [VirtualDisplay] whose output surface is an
 * [ImageReader]; frames flow zero-copy as HardwareBuffers into the engine
 * (rlvk AHardwareBuffer import) and are drawn by the node's customRender.
 *
 * Touch: gestures that start inside a hosted field's surface rect are routed
 * wholesale into the Presentation (real DOWN/MOVE/UP stream, original
 * timing), so tap-to-caret, long-press selection, and drag-select are the
 * platform's own behavior — never synthesized.
 *
 * IME (the Flutter VirtualDisplay mechanism): the window-attached
 * [com.rayact.app.RayactSurfaceView] stays the IME's focused client; its
 * onCreateInputConnection() delegates to the embedded EditText's own
 * InputConnection (wrapped so sendKeyEvent reaches the unfocusable
 * Presentation window), and checkInputConnectionProxy() returns true so the
 * IMM accepts the proxy.
 */
object RayactPlatformViews {
    private const val TAG = "RayactPlatformViews"
    private val mainHandler = Handler(Looper.getMainLooper())
    private val hosts = ConcurrentHashMap<Int, TextFieldHost>()

    @Volatile
    private var boundSession: RayactEngineSession? = null

    fun bindSession(session: RayactEngineSession) {
        boundSession = session
    }

    private fun session(): RayactEngineSession? = boundSession

    /** The embedded EditText that should receive IME input, if any. */
    @Volatile
    var focusedEditText: EditText? = null
        private set

    /** Gesture currently captured by a host (set on DOWN inside its rect). */
    private var touchTarget: TextFieldHost? = null

    /** True when [view] is an EditText hosted by a platform view (IMM proxy check). */
    fun isPlatformViewInput(view: android.view.View): Boolean {
        for (host in hosts.values) if (host.editText === view) return true
        return false
    }

    /**
     * Build the proxied InputConnection for the focused embedded field.
     * sendKeyEvent is rerouted: the Presentation window is unfocusable, so
     * normal key dispatch would be dropped — soft-keyboard DEL/Enter arrive
     * this way and must reach the EditText directly.
     */
    fun createProxyInputConnection(outAttrs: EditorInfo): InputConnection? {
        val et = focusedEditText ?: return null
        val target = et.onCreateInputConnection(outAttrs) ?: return null
        return object : InputConnectionWrapper(target, true) {
            override fun sendKeyEvent(event: KeyEvent): Boolean {
                mainHandler.post { et.dispatchKeyEvent(event) }
                return true
            }
        }
    }

    /**
     * Route a surface-view touch into a hosted field. Returns true when the
     * event was consumed (gesture started inside a field rect). Call from
     * RayactSurfaceView.onTouchEvent BEFORE forwarding to the engine.
     * Coordinates are surface px == field-texture px (JNI converts node
     * layout rects with the engine's raster scale).
     */
    fun routeTouch(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            touchTarget = null
            for (host in hosts.values) {
                // While focused, the hit region includes the overflow chrome
                // (selection toolbar above, handles below) so those controls
                // are tappable; unfocused fields only claim their own rect.
                val rect = if (host.editText != null && host.editText === focusedEditText)
                    host.expandedRect() else host.screenRect
                if (rect.contains(event.x, event.y)) {
                    touchTarget = host
                    break
                }
            }
        }
        val host = touchTarget ?: return false
        host.forwardTouch(event)
        if (event.actionMasked == MotionEvent.ACTION_UP ||
            event.actionMasked == MotionEvent.ACTION_CANCEL) {
            if (event.actionMasked == MotionEvent.ACTION_UP) host.ensureImeFocus()
            touchTarget = null
        }
        return true
    }

    fun onRect(nodeId: Int, kind: String, x: Float, y: Float, w: Float, h: Float) {
        if (kind != "textfield") return
        mainHandler.post {
            val ctx = session()?.host?.imeView?.context ?: run {
                Log.e(TAG, "no context for platform view $nodeId")
                return@post
            }
            val host = hosts.getOrPut(nodeId) { TextFieldHost(nodeId, ctx) }
            host.screenRect.set(x, y, x + w, y + h)
            host.resize(w.toInt().coerceAtLeast(1), h.toInt().coerceAtLeast(1),
                        ctx.resources.displayMetrics.densityDpi)
        }
    }

    fun onInput(nodeId: Int, action: Int, lx: Float, ly: Float) {
        // Touch is routed at the Kotlin layer (routeTouch); the bridge-side
        // tap path stays for hosts without direct event access (desktop).
    }

    fun onProp(nodeId: Int, key: String, value: String) {
        mainHandler.post { hosts[nodeId]?.setProp(key, value) }
    }

    fun onDispose(nodeId: Int) {
        mainHandler.post {
            hosts.remove(nodeId)?.dispose()
        }
    }

    internal fun setFocused(et: EditText?) {
        focusedEditText = et
    }

    /**
     * Implements the WindowManager↔child layout protocol (gravity, x, y) for
     * popup windows reparented into the presentation's view tree. Port of
     * Flutter's SingleViewFakeWindowViewGroup: text-selection handles and the
     * floating toolbar are PopupWindows — as real windows on the
     * VirtualDisplay they'd render but never receive our injected touches, so
     * they are intercepted at the WindowManager and added here instead.
     */
    private class FakeWindowViewGroup(context: Context) : ViewGroup(context) {
        private val viewBounds = Rect()
        private val childRect = Rect()

        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            for (i in 0 until childCount) {
                val child = getChildAt(i)
                val params = child.layoutParams as WindowManager.LayoutParams
                viewBounds.set(l, t, r, b)
                Gravity.apply(
                    params.gravity, child.measuredWidth, child.measuredHeight,
                    viewBounds, params.x, params.y, childRect
                )
                child.layout(childRect.left, childRect.top, childRect.right, childRect.bottom)
            }
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            for (i in 0 until childCount) {
                getChildAt(i).measure(atMost(widthMeasureSpec), atMost(heightMeasureSpec))
            }
            super.onMeasure(widthMeasureSpec, heightMeasureSpec)
        }

        private fun atMost(spec: Int): Int =
            MeasureSpec.makeMeasureSpec(MeasureSpec.getSize(spec), MeasureSpec.AT_MOST)
    }

    /** WindowManager proxy routing popup add/remove into the fake root. */
    private class FakeWindowManager(
        private val delegate: WindowManager,
        private val fakeRoot: FakeWindowViewGroup
    ) : WindowManager by delegate {
        override fun addView(view: View, params: ViewGroup.LayoutParams) {
            fakeRoot.addView(view, params)
        }
        override fun removeView(view: View) {
            fakeRoot.removeView(view)
        }
        override fun removeViewImmediate(view: View) {
            view.clearAnimation()
            fakeRoot.removeView(view)
        }
        override fun updateViewLayout(view: View, params: ViewGroup.LayoutParams) {
            fakeRoot.updateViewLayout(view, params)
        }
    }

    /**
     * View context whose WINDOW_SERVICE resolves to the fake window manager,
     * so PopupWindows created from views (selection handles, magnifier) land
     * in the presentation's own tree where injected touches reach them.
     * NOTE: the system floating ActionMode toolbar resolves its WindowManager
     * from the Presentation window's display context (createDisplayContext —
     * unwrappable), so it is suppressed instead and replaced by our own
     * toolbar (Flutter does the same: it draws its own selection toolbar).
     */
    private class PopupInterceptContext(
        base: Context,
        private val fakeWindowManager: WindowManager
    ) : ContextWrapper(base) {
        override fun getSystemService(name: String): Any? =
            if (Context.WINDOW_SERVICE == name) fakeWindowManager
            else super.getSystemService(name)
    }

    /**
     * One EditText-in-VirtualDisplay producer. All methods main-thread only
     * except forwardTouch/screenRect (called from the UI thread's touch
     * dispatch, which IS the main thread).
     */
    private class TextFieldHost(val nodeId: Int, val context: Context) {
        var editText: EditText? = null
            private set
        /** Node rect in surface px (set from the engine's layout pushes). */
        val screenRect = RectF()
        // Producer-surface padding (px) around the field so overflow chrome —
        // selection toolbar above, caret/selection handles + magnifier below —
        // renders inside the texture instead of being clipped at the edge.
        private val density = context.resources.displayMetrics.density
        val padLeft = (24f * density)
        val padTop = (56f * density)
        val padRight = (24f * density)
        val padBottom = (48f * density)

        fun expandedRect() = RectF(
            screenRect.left - padLeft, screenRect.top - padTop,
            screenRect.right + padRight, screenRect.bottom + padBottom
        )
        private var reader: ImageReader? = null
        private var virtualDisplay: VirtualDisplay? = null
        private var presentation: Presentation? = null
        private var widthPx = 0
        private var heightPx = 0
        // Keep the two most recent acquired images open: the GPU may still be
        // sampling the previous frame's buffer (FIF=2) when a new one lands.
        private var liveImage: Image? = null
        private var prevImage: Image? = null
        private var suppressWatcher = false
        private var pendingValue: String? = null
        private var pendingHint: String? = null
        private var pendingInputType: String? = null
        private var pendingSecure = false

        fun resize(fieldWPx: Int, fieldHPx: Int, densityDpi: Int) {
            val wPx = fieldWPx + (padLeft + padRight).toInt()
            val hPx = fieldHPx + (padTop + padBottom).toInt()
            if (wPx == widthPx && hPx == heightPx && virtualDisplay != null) return
            widthPx = wPx
            heightPx = hPx
            session()?.nativeSetExternalViewInsets(nodeId, padLeft, padTop, padRight, padBottom)

            val newReader = ImageReader.newInstance(
                wPx, hPx, android.graphics.ImageFormat.PRIVATE, 4,
                HardwareBuffer.USAGE_GPU_SAMPLED_IMAGE or HardwareBuffer.USAGE_GPU_COLOR_OUTPUT
            )
            newReader.setOnImageAvailableListener({ r ->
                val image = try { r.acquireLatestImage() } catch (_: Exception) { null }
                    ?: return@setOnImageAvailableListener
                val hb = image.hardwareBuffer
                if (hb != null) {
                    session()?.nativePushExternalViewFrame(nodeId, hb)
                    hb.close()
                }
                prevImage?.close()
                prevImage = liveImage
                liveImage = image
                session()?.host?.renderScheduler?.requestFrame()
            }, mainHandler)

            val vd = virtualDisplay
            if (vd == null) {
                val dm = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
                virtualDisplay = dm.createVirtualDisplay(
                    "rayact-pv-$nodeId", wPx, hPx, densityDpi, newReader.surface,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY
                )
                buildPresentation()
            } else {
                vd.resize(wPx, hPx, densityDpi)
                vd.surface = newReader.surface
            }
            liveImage?.close(); liveImage = null
            prevImage?.close(); prevImage = null
            reader?.close()
            reader = newReader
        }

        private fun buildPresentation() {
            val display = virtualDisplay?.display ?: return
            val p = Presentation(context, display)
            p.window?.setFlags(
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            )
            p.window?.setBackgroundDrawableResource(android.R.color.transparent)

            val realWm = p.context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val fakeRoot = FakeWindowViewGroup(p.context)
            val viewContext = PopupInterceptContext(p.context, FakeWindowManager(realWm, fakeRoot))

            val et = EditText(viewContext)
            // The system floating toolbar lives in an unreachable VD window —
            // suppress both action modes; selectionToolbar (ours) replaces it.
            val noActionMode = object : android.view.ActionMode.Callback {
                override fun onCreateActionMode(mode: android.view.ActionMode?, menu: android.view.Menu?) = false
                override fun onPrepareActionMode(mode: android.view.ActionMode?, menu: android.view.Menu?) = false
                override fun onActionItemClicked(mode: android.view.ActionMode?, item: android.view.MenuItem?) = false
                override fun onDestroyActionMode(mode: android.view.ActionMode?) {}
            }
            et.customSelectionActionModeCallback = noActionMode
            et.customInsertionActionModeCallback = noActionMode
            et.setBackgroundColor(Color.TRANSPARENT)
            et.setTextColor(Color.WHITE)
            et.setHintTextColor(0xFF9E9E9E.toInt())
            et.textSize = 16f
            et.inputType = InputType.TYPE_CLASS_TEXT
            et.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    if (suppressWatcher) return
                    session()?.nativeExternalViewTextChanged(nodeId, s?.toString() ?: "")
                    session()?.host?.renderScheduler?.requestFrame()
                }
            })

            val root = FrameLayout(p.context)
            val lp = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            lp.setMargins(padLeft.toInt(), padTop.toInt(), padRight.toInt(), padBottom.toInt())
            root.addView(et, lp)
            // Popup overlay (selection handles, floating toolbar) above the field.
            root.addView(
                fakeRoot,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                )
            )
            buildSelectionToolbar(root, et)
            p.setContentView(root)
            p.show()
            presentation = p
            editText = et

            pendingValue?.let { applyValue(it) }
            pendingHint?.let { et.hint = it }
            pendingInputType?.let { applyInputType(it) }
            if (pendingSecure) applyInputType("password")
        }

        /** Replay a real touch event into the presentation, surface-local px
         *  (the presentation origin sits padTop/padLeft above the field). */
        fun forwardTouch(event: MotionEvent) {
            val decor = presentation?.window?.decorView ?: return
            val local = MotionEvent.obtain(event)
            local.offsetLocation(-(screenRect.left - padLeft), -(screenRect.top - padTop))
            decor.dispatchTouchEvent(local)
            local.recycle()
        }

        /** After a routed tap: bind the IME to this field via the proxy. */
        fun ensureImeFocus() {
            val keepLongPressToolbar =
                toolbar?.visibility == View.VISIBLE && toolbarShownByLongPress
            if (editText?.hasSelection() != true && !keepLongPressToolbar) hideToolbar()
            val et = editText ?: return
            val surfaceView = session()?.host?.imeView ?: return
            et.requestFocus()
            setFocused(et)
            surfaceView.requestFocus()
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.restartInput(surfaceView)
            imm.showSoftInput(surfaceView, 0)
        }

        private var toolbar: android.widget.LinearLayout? = null
        private var toolbarShownByLongPress = false

        /** Our replacement for the system floating toolbar: Cut/Copy/Paste/
         *  Select all wired straight to the platform text actions, living in
         *  the presentation tree (top padding band) so it's touch-reachable. */
        private fun buildSelectionToolbar(root: FrameLayout, et: EditText) {
            val bar = android.widget.LinearLayout(et.context)
            bar.orientation = android.widget.LinearLayout.HORIZONTAL
            val bg = android.graphics.drawable.GradientDrawable()
            bg.setColor(0xFF2E2A33.toInt())
            bg.cornerRadius = 22f * density
            bar.background = bg
            bar.elevation = 8f * density
            val pad = (10f * density).toInt()
            bar.setPadding(pad, 0, pad, 0)

            fun action(label: String, id: Int) {
                val tv = android.widget.TextView(et.context)
                tv.text = label
                tv.setTextColor(Color.WHITE)
                tv.textSize = 14f
                tv.setPadding(pad, (10f * density).toInt(), pad, (10f * density).toInt())
                tv.setOnClickListener {
                    et.onTextContextMenuItem(id)
                    if (id != android.R.id.selectAll) hideToolbar()
                }
                bar.addView(tv)
            }
            action("Cut", android.R.id.cut)
            action("Copy", android.R.id.copy)
            action("Paste", android.R.id.paste)
            action("All", android.R.id.selectAll)

            bar.visibility = View.GONE
            val lp = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            )
            lp.leftMargin = padLeft.toInt()
            lp.topMargin = (4f * density).toInt()
            root.addView(bar, lp)
            toolbar = bar

            et.setOnLongClickListener {
                showToolbar(fromLongPress = true)
                false // let the platform also do word-select + handles
            }
            et.accessibilityDelegate = null
        }

        fun showToolbar(fromLongPress: Boolean = false) {
            if (fromLongPress) toolbarShownByLongPress = true
            toolbar?.visibility = View.VISIBLE
            toolbar?.bringToFront()
        }

        fun hideToolbar() {
            toolbarShownByLongPress = false
            toolbar?.visibility = View.GONE
        }

        fun setProp(key: String, value: String) {
            val et = editText
            when (key) {
                "value" -> if (et != null) applyValue(value) else pendingValue = value
                "placeholder" -> if (et != null) et.hint = value else pendingHint = value
                "inputType" -> if (et != null) applyInputType(value) else pendingInputType = value
                "secure" -> {
                    val sec = value == "true" || value == "1"
                    if (et != null) { if (sec) applyInputType("password") } else pendingSecure = sec
                }
                "focused" -> if (value == "1" || value == "true") ensureImeFocus()
            }
        }

        private fun applyValue(value: String) {
            val et = editText ?: return
            if (et.text.toString() == value) return
            suppressWatcher = true
            et.setText(value)
            et.setSelection(value.length.coerceAtMost(et.text.length))
            suppressWatcher = false
        }

        private fun applyInputType(type: String) {
            val et = editText ?: return
            et.inputType = when (type) {
                "email" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                "number" -> InputType.TYPE_CLASS_NUMBER
                "phone" -> InputType.TYPE_CLASS_PHONE
                "password" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                "multiline" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
                else -> InputType.TYPE_CLASS_TEXT
            }
        }

        fun dispose() {
            if (focusedEditText === editText) setFocused(null)
            presentation?.dismiss()
            presentation = null
            virtualDisplay?.release()
            virtualDisplay = null
            liveImage?.close(); liveImage = null
            prevImage?.close(); prevImage = null
            reader?.close()
            reader = null
            editText = null
        }
    }
}

// ─── JNI up-call entry points (static methods on RayactPlatformViewsKt) ──────

fun platformViewRectFromHost(nodeId: Int, kind: String, x: Float, y: Float, w: Float, h: Float) {
    RayactPlatformViews.onRect(nodeId, kind, x, y, w, h)
}

fun platformViewInputFromHost(nodeId: Int, action: Int, lx: Float, ly: Float) {
    RayactPlatformViews.onInput(nodeId, action, lx, ly)
}

fun platformViewPropFromHost(nodeId: Int, key: String, value: String) {
    RayactPlatformViews.onProp(nodeId, key, value)
}

fun platformViewDisposeFromHost(nodeId: Int) {
    RayactPlatformViews.onDispose(nodeId)
}
