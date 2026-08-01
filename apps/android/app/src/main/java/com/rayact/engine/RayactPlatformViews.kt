package com.rayact.engine

import android.app.Presentation
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.RectF
import android.hardware.HardwareBuffer
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.Looper
import android.os.Build
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.Log
import android.view.KeyEvent
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import com.rayact.app.RayactPlatformViewContainer
import com.rayact.app.RayactOverlaySurfaceView
import com.rayact.app.RayactOverlayTextureView
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Android producers for ExternalView nodes (platform views composited as
 * textures). A "textfield" node hosts a real [EditText] inside a
 * [Presentation] on a [VirtualDisplay] whose output surface is an
 * [ImageReader]; frames flow zero-copy as HardwareBuffers into the engine
 * (backend AHardwareBuffer import) and are drawn by the node's customRender.
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
    private interface PlatformHost {
        val screenRect: RectF
        fun resize(width: Int, height: Int, densityDpi: Int)
        fun setProperties(properties: Map<String, Any?>)
        fun forwardTouch(event: MotionEvent)
        fun applyComposition(compositionJson: String) {}
        fun preservesFrameworkUnderlay(): Boolean = false
        fun resolveGesture(accepted: Boolean) {}
        fun hierarchyView(): View? = null
        fun ensureImeFocus() {}
        fun dispose()
    }

    private val hosts = ConcurrentHashMap<Int, PlatformHost>()
    private data class PendingView(
        val surfaceId: Int,
        val kind: String,
        val properties: MutableMap<String, Any?>,
        var rect: RectF? = null,
        var densityDpi: Int = 0,
        // The engine session whose node tree owns this view. surfaceIds are
        // per-instance (launcher and project both use surface 1), so without
        // the owner a registerScreen for a NEW session would resurrect the
        // previous session's platform views into the new screen.
        var owner: RayactEngineSession? = null,
    )
    private val pendingViews = ConcurrentHashMap<Int, PendingView>()
    private val screenContainers =
        ConcurrentHashMap<Int, RayactPlatformViewContainer>()
    private data class ScreenComposition(
        val width: Float,
        val height: Float,
        val density: Float,
        val entries: MutableList<Pair<Int, String>> = mutableListOf(),
        // Which overlay planes composite() actually handed out this frame.
        // endFrame must hide the rest — an unused overlay still shows its
        // stale last-presented buffer otherwise.
        var usedSurfaceOverlay: Boolean = false,
        var usedTextureOverlays: Int = 0,
    )
    private val frameCompositions =
        ConcurrentHashMap<Int, ScreenComposition>()
    private val overlayViews =
        ConcurrentHashMap<Int, RayactOverlaySurfaceView>()
    // Interleavable TextureView overlays for non-final slice boundaries,
    // indexed by boundary order within a frame. The final boundary keeps the
    // zero-copy RayactOverlaySurfaceView (legitimately above everything).
    private val textureOverlays =
        ConcurrentHashMap<Int, MutableList<RayactOverlayTextureView>>()
    // Boundary count observed on the previous frame. composite() must answer
    // synchronously on the render thread, so "is this the final boundary?"
    // is predicted from the last frame; a count change corrects itself on the
    // next frame (one-frame layering transition, Flutter-style pooling).
    private val expectedBoundaries = ConcurrentHashMap<Int, Int>()

    fun registerScreen(surfaceId: Int, container: RayactPlatformViewContainer) {
        screenContainers[surfaceId] = container
        mainHandler.post {
            RayactPlatformRegistry.initialize(container.context)
            for ((nodeId, pending) in pendingViews) {
                if (pending.surfaceId != surfaceId) continue
                // Same-session surface recreation (background/resume) restores
                // its views; a dead or foreign session's views must not be
                // resurrected under the new screen.
                val owner = pending.owner
                if (owner != null && !owner.isAlive()) {
                    hosts.remove(nodeId)?.dispose()
                    pendingViews.remove(nodeId)
                    continue
                }
                if (owner != null && owner !== session()) continue
                if (!isEditorKind(pending.kind)) ensureOverlay(surfaceId)
                attachPendingView(nodeId, pending, container.context)
            }
        }
    }

    /**
     * Dispose every platform view owned by [session]. Called when an engine
     * session is torn down (launcher ↔ project switch, project reload): the
     * JS side never unmounts those nodes, so without this the native views
     * stay attached to the shared container forever.
     */
    fun releaseSession(session: RayactEngineSession) {
        mainHandler.post {
            val owned = pendingViews.filter { it.value.owner === session }.keys.toList()
            for (nodeId in owned) {
                hosts.remove(nodeId)?.dispose()
                pendingViews.remove(nodeId)
            }
            if (owned.isNotEmpty()) {
                Log.i(TAG, "releaseSession disposed ${owned.size} platform view(s)")
            }
        }
    }

    fun unregisterScreen(surfaceId: Int, container: RayactPlatformViewContainer) {
        screenContainers.remove(surfaceId, container)
        mainHandler.post {
            val owned = pendingViews.filterValues { it.surfaceId == surfaceId }.keys
            for (nodeId in owned) {
                hosts.remove(nodeId)?.dispose()
            }
            overlayViews.remove(surfaceId)?.let { overlay ->
                container.removeView(overlay)
            }
            textureOverlays.remove(surfaceId)?.forEach { overlay ->
                container.removeView(overlay)
            }
            expectedBoundaries.remove(surfaceId)
            frameCompositions.remove(surfaceId)
        }
    }

    /**
     * Editor kinds render as a transparent editing layer directly above the
     * base renderer surface: raym3 keeps the field chrome on the base surface
     * (preserveFrameworkUnderlay) and only glyph editing floats. They never
     * force an overlay allocation on their own — a top-z overlay SurfaceView
     * escapes the screen/fragment stack, so a launcher screen with just a URL
     * field would ghost over any screen pushed above it.
     */
    private fun isEditorKind(kind: String): Boolean =
        kind == "textfield" || kind == "rayact.internal.text-input"

    private fun overlayId(surfaceId: Int): Long =
        (surfaceId.toLong() shl 32) or 1L

    private fun textureOverlayId(surfaceId: Int, index: Int): Long =
        (surfaceId.toLong() shl 32) or (2L + index)

    /** Main-thread only. Grows the per-surface TextureView overlay pool. */
    private fun ensureTextureOverlays(surfaceId: Int, count: Int) {
        if (count <= 0) return
        val container = screenContainers[surfaceId] ?: return
        val session = session() ?: return
        val list = textureOverlays.getOrPut(surfaceId) { mutableListOf() }
        while (list.size < count) {
            val overlay = RayactOverlayTextureView(
                container.context, session,
                textureOverlayId(surfaceId, list.size))
            list.add(overlay)
            container.addView(
                overlay,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
        }
    }

    private fun ensureOverlay(surfaceId: Int) {
        if (overlayViews.containsKey(surfaceId)) return
        val container = screenContainers[surfaceId] ?: return
        val session = session() ?: return
        val overlay = RayactOverlaySurfaceView(
            container.context, session, overlayId(surfaceId))
        overlayViews[surfaceId] = overlay
        container.addView(
            overlay,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )
        Log.i(
            TAG,
            "surface $surfaceId composition=${if (Build.VERSION.SDK_INT >= 34) "HCPP" else "HC"}",
        )
    }

    fun beginFrame(surfaceId: Int, width: Float, height: Float, density: Float) {
        frameCompositions[surfaceId] =
            ScreenComposition(width, height, density)
    }

    fun composite(surfaceId: Int, nodeId: Int, compositionJson: String): Long {
        val composition = frameCompositions[surfaceId] ?: return 0L
        val boundaryIndex = composition.entries.size
        composition.entries.add(nodeId to compositionJson)
        // Non-final boundaries render into interleavable TextureView overlays
        // so their slice sits below the next platform view; only the final
        // boundary may use the top-z SurfaceView overlay.
        val expected = expectedBoundaries[surfaceId] ?: 1
        if (boundaryIndex < expected - 1) {
            val overlay = textureOverlays[surfaceId]?.getOrNull(boundaryIndex)
            if (overlay?.registered == true) {
                composition.usedTextureOverlays =
                    maxOf(composition.usedTextureOverlays, boundaryIndex + 1)
                return overlay.registeredSurfaceId
            }
            return 0L
        }
        // Final boundary: editor kinds sandwich directly on the base surface
        // (chrome below via preserveFrameworkUnderlay, EditText view above).
        // Handing them the top-z SurfaceView overlay would lift everything
        // painted after the field above every screen in the window.
        if (isEditorKind(pendingViews[nodeId]?.kind ?: "")) return 0L
        val overlay = overlayViews[surfaceId]
        if (overlay?.registered == true) {
            composition.usedSurfaceOverlay = true
            return overlay.registeredSurfaceId
        }
        return 0L
    }

    fun endFrame(surfaceId: Int) {
        val composition = frameCompositions.remove(surfaceId) ?: return
        val boundaryCount = composition.entries.size
        expectedBoundaries[surfaceId] = boundaryCount.coerceAtLeast(1)
        mainHandler.post {
            val container = screenContainers[surfaceId] ?: return@post
            val overlay = overlayViews[surfaceId]
            // Grow the TextureView pool for the next frame (composite() only
            // hands out already-registered overlays).
            ensureTextureOverlays(surfaceId, boundaryCount - 1)
            val textures = textureOverlays[surfaceId]
            // Explicit interleave: [renderer, pv0, texOv0, pv1, texOv1, …,
            // pvN-1, SurfaceView overlay]. Slice i (raym3 content painted
            // after platform view i) must sit above pv_i and below pv_{i+1} —
            // that is exactly what lets a filled text field's chrome render
            // beneath its own EditText while still covering a WebView below.
            composition.entries.forEachIndexed { index, (nodeId, payload) ->
                val host = hosts[nodeId] ?: return@forEachIndexed
                host.applyComposition(payload)
                host.hierarchyView()?.let(container::bringChildToFront)
                if (index < composition.usedTextureOverlays) {
                    textures?.getOrNull(index)?.let { tex ->
                        tex.visibility = View.VISIBLE
                        container.bringChildToFront(tex)
                    }
                }
            }
            // Park pool members this frame didn't composite into: an unused
            // overlay keeps presenting its stale last buffer otherwise.
            textures?.forEachIndexed { index, tex ->
                if (index >= composition.usedTextureOverlays) tex.visibility = View.INVISIBLE
            }
            if (overlay != null) {
                overlay.scheduleHierarchyTransaction(
                    visible = composition.usedSurfaceOverlay)
                overlay.visibility =
                    if (composition.usedSurfaceOverlay) View.VISIBLE else View.INVISIBLE
                if (composition.usedSurfaceOverlay) container.bringChildToFront(overlay)
            }
            if (composition.entries.size > 2) {
                Log.w(
                    TAG,
                    "${composition.entries.size} logical overlay slices on surface $surfaceId",
                )
            }
        }
    }

    fun resolveGesture(surfaceId: Int, nodeId: Int, accepted: Boolean) {
        mainHandler.post { hosts[nodeId]?.resolveGesture(accepted) }
    }

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
    private var touchTarget: PlatformHost? = null

    /** True when [view] is an EditText hosted by a platform view (IMM proxy check). */
    fun isPlatformViewInput(view: android.view.View): Boolean {
        for (host in hosts.values) if ((host as? TextFieldHost)?.editText === view) return true
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
                val field = host as? TextFieldHost
                val rect = if (field?.editText != null && field.editText === focusedEditText)
                    field.expandedRect() else host.screenRect
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

    fun onCreate(surfaceId: Int, nodeId: Int, kind: String, propsJson: String) {
        val initial = parseProperties(propsJson).toMutableMap()
        mainHandler.post {
            pendingViews[nodeId] =
                PendingView(surfaceId, kind, initial, owner = session())
            if (!isEditorKind(kind)) ensureOverlay(surfaceId)
        }
    }

    fun onRect(surfaceId: Int, nodeId: Int, kind: String, x: Float, y: Float, w: Float, h: Float) {
        mainHandler.post {
            val ctx = session()?.host?.imeView?.context ?: run {
                Log.e(TAG, "no context for platform view $nodeId")
                return@post
            }
            RayactPlatformRegistry.initialize(ctx)
            val pending = pendingViews.getOrPut(nodeId) {
                PendingView(surfaceId, kind, mutableMapOf(), owner = session())
            }
            if (pending.owner == null) pending.owner = session()
            pending.rect = RectF(x, y, x + w, y + h)
            pending.densityDpi = ctx.resources.displayMetrics.densityDpi
            attachPendingView(nodeId, pending, ctx)
        }
    }

    private fun attachPendingView(nodeId: Int, pending: PendingView, ctx: Context) {
        val rect = pending.rect ?: return
        var host = hosts[nodeId]
        if (host == null) {
            host = when (pending.kind) {
                "textfield" -> TextFieldHost(nodeId, ctx).also {
                    it.setProperties(pending.properties)
                }
                else -> {
                    if (!RayactPlatformRegistry.shared.hasViewFactory(pending.kind)) return
                    val screen = screenContainers[pending.surfaceId] ?: return
                    HierarchyViewHost(
                        nodeId, pending.kind, screen,
                        pending.properties.toMap(),
                    )
                }
            }
            hosts[nodeId] = host
        }
        host.screenRect.set(rect)
        host.resize(
            rect.width().toInt().coerceAtLeast(1),
            rect.height().toInt().coerceAtLeast(1),
            pending.densityDpi.takeIf { it > 0 }
                ?: ctx.resources.displayMetrics.densityDpi,
        )
    }

    fun onInput(nodeId: Int, action: Int, lx: Float, ly: Float) {
        // Touch is routed at the Kotlin layer (routeTouch); the bridge-side
        // tap path stays for hosts without direct event access (desktop).
    }

    fun onProps(nodeId: Int, propsJson: String) {
        val patch = parseProperties(propsJson)
        mainHandler.post {
            val pending = pendingViews[nodeId]
            if (pending != null) {
                for ((key, value) in patch) {
                    if (value == null) pending.properties.remove(key)
                    else pending.properties[key] = value
                }
            }
            hosts[nodeId]?.setProperties(patch)
        }
    }

    fun onDispose(nodeId: Int) {
        mainHandler.post {
            hosts.remove(nodeId)?.dispose()
            pendingViews.remove(nodeId)
        }
    }

    private fun parseProperties(json: String): Map<String, Any?> {
        val objectValue = runCatching { JSONObject(json) }.getOrElse { return emptyMap() }
        return jsonObjectToMap(objectValue)
    }

    private fun jsonObjectToMap(value: JSONObject): Map<String, Any?> =
        buildMap {
            val keys = value.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                put(key, jsonValue(value.opt(key)))
            }
        }

    private fun jsonValue(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> jsonObjectToMap(value)
        is JSONArray -> List(value.length()) { index -> jsonValue(value.opt(index)) }
        else -> value
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
     * Real in-hierarchy platform view. Unlike the transitional
     * RegisteredViewHost below, this never creates a VirtualDisplay and is the
     * production path for registered views such as WebView.
     */
    private class HierarchyViewHost(
        private val nodeId: Int,
        kind: String,
        private val container: RayactPlatformViewContainer,
        initialProperties: Map<String, Any?>,
    ) : PlatformHost {
        override val screenRect = RectF()
        private val mutatorView = RayactMutatorView(container.context, nodeId)
        private val controller: RayactPlatformViewController
        private var frameworkUnderlay = false

        init {
            controller = RayactPlatformRegistry.shared.createView(
                kind,
                RayactPlatformViewContext(
                    container.context, nodeId, initialProperties,
                ) { payload ->
                    session()?.nativeExternalViewTextChanged(nodeId, payload)
                    session()?.host?.renderScheduler?.requestFrame()
                },
            ) ?: error("Platform view factory '$kind' disappeared")
            mutatorView.addView(
                controller.view,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
            container.addView(mutatorView)
        }

        override fun resize(width: Int, height: Int, densityDpi: Int) {
            mutatorView.layoutParams = FrameLayout.LayoutParams(width, height)
            mutatorView.x = screenRect.left
            mutatorView.y = screenRect.top
            mutatorView.visibility = View.VISIBLE
        }

        override fun setProperties(properties: Map<String, Any?>) {
            controller.setProperties(properties)
        }

        override fun forwardTouch(event: MotionEvent) {}

        override fun applyComposition(compositionJson: String) {
            val composition = runCatching { JSONObject(compositionJson) }.getOrNull()
                ?: return
            // The composition carries this frame's bounds (surface px) and is
            // the only geometry the host still receives once the embedder is
            // active: the engine skips the node's customRender — which is what
            // pushes platformViewRect — for every view it composites. Relying
            // on that first rect froze fields at their pre-layout position
            // whenever layout settled later (collapsed rows inside a
            // ScrollView all stacked in the top-left corner).
            composition.optJSONObject("bounds")?.let { value ->
                val x = value.optDouble("x").toFloat()
                val y = value.optDouble("y").toFloat()
                val w = value.optDouble("width").toFloat()
                val h = value.optDouble("height").toFloat()
                if (w > 0f && h > 0f &&
                    (screenRect.left != x || screenRect.top != y ||
                        screenRect.width() != w || screenRect.height() != h)
                ) {
                    screenRect.set(x, y, x + w, y + h)
                    resize(w.toInt().coerceAtLeast(1), h.toInt().coerceAtLeast(1), 0)
                }
            }
            frameworkUnderlay =
                composition.optBoolean("preservesFrameworkUnderlay", false)
            var opacity = 1f
            var clip: RectF? = null
            var roundedRadius = 0f
            val transform = Matrix()
            val mutators = composition.optJSONArray("mutators") ?: JSONArray()
            var ambientScale = 1f
            for (index in 0 until mutators.length()) {
                val mutator = mutators.optJSONObject(index) ?: continue
                when (mutator.optString("kind")) {
                    "opacity" ->
                        opacity *= mutator.optDouble("opacity", 1.0).toFloat()
                    "clipRect", "clipRoundedRect" -> {
                        val value = mutator.optJSONObject("rect") ?: continue
                        val next = RectF(
                            value.optDouble("x").toFloat() - screenRect.left,
                            value.optDouble("y").toFloat() - screenRect.top,
                            value.optDouble("x").toFloat() -
                                screenRect.left + value.optDouble("width").toFloat(),
                            value.optDouble("y").toFloat() -
                                screenRect.top + value.optDouble("height").toFloat(),
                        )
                        clip = clip?.also { it.intersect(next) } ?: next
                        if (mutator.optString("kind") == "clipRoundedRect") {
                            roundedRadius = mutator.optDouble("radius").toFloat()
                        }
                    }
                    "transform" -> {
                        val values = mutator.optJSONArray("matrix") ?: continue
                        if (values.length() == 9) {
                            val raw = FloatArray(9) {
                                values.optDouble(it).toFloat()
                            }
                            if (ambientScale == 1f &&
                                raw[0] > 0f && raw[4] > 0f &&
                                raw[1] == 0f && raw[3] == 0f &&
                                raw[2] == 0f && raw[5] == 0f) {
                                // Mutator 0 is the engine's ambient dp→px
                                // scale; the host already works in px.
                                ambientScale = raw[0]
                            } else {
                                // The composed engine transform is
                                // Ambient(dp→px) · T(dp); expressed in the
                                // host's px space that is S·T·S⁻¹, i.e. the
                                // same scale/skew with translation × density.
                                // The old code divided every term by the
                                // density, which turned a plain translate into
                                // a 0.28x scale — fields rendered tiny in the
                                // top-left corner.
                                raw[2] *= ambientScale
                                raw[5] *= ambientScale
                                transform.postConcat(Matrix().apply { setValues(raw) })
                            }
                        }
                    }
                }
            }
            mutatorView.alpha = opacity.coerceIn(0f, 1f)
            mutatorView.clipBounds = clip?.let {
                Rect(
                    it.left.toInt(), it.top.toInt(),
                    it.right.toInt(), it.bottom.toInt(),
                )
            }
            if (roundedRadius > 0f) {
                mutatorView.outlineProvider =
                    object : ViewOutlineProvider() {
                        override fun getOutline(view: View, outline: android.graphics.Outline) {
                            val bounds = view.clipBounds ?: Rect(0, 0, view.width, view.height)
                            outline.setRoundRect(bounds, roundedRadius)
                        }
                    }
                mutatorView.clipToOutline = true
            } else {
                mutatorView.clipToOutline = false
                mutatorView.outlineProvider = null
            }
            if (Build.VERSION.SDK_INT >= 29) {
                mutatorView.animationMatrix =
                    if (transform.isIdentity) null else transform
            }
            mutatorView.hitTestTransparent =
                composition.optString("hitTestBehavior", "opaque") == "transparent"
        }

        override fun resolveGesture(accepted: Boolean) {
            mutatorView.resolveGesture(accepted)
        }

        override fun hierarchyView(): View = mutatorView

        override fun preservesFrameworkUnderlay(): Boolean = frameworkUnderlay

        override fun ensureImeFocus() {
            controller.view.requestFocus()
        }

        override fun dispose() {
            controller.dispose()
            mutatorView.disposeSequence()
            container.removeView(mutatorView)
        }
    }

    private class RayactMutatorView(
        context: Context,
        private val nodeId: Int,
    ) : FrameLayout(context) {
        private val preservedEvents = ArrayList<MotionEvent>()
        private var resolved: Boolean? = null
        var hitTestTransparent = false

        init {
            clipChildren = false
            clipToPadding = false
        }

        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
            if (hitTestTransparent) return false
            if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                disposeSequence()
                resolved = null
            }
            if (resolved == true) {
                val handled = super.dispatchTouchEvent(event)
                if (event.actionMasked == MotionEvent.ACTION_UP ||
                    event.actionMasked == MotionEvent.ACTION_CANCEL) {
                    resolved = null
                }
                return handled
            }
            preservedEvents += MotionEvent.obtain(event)
            val primaryIndex = event.findPointerIndex(0).let {
                if (it >= 0) it else 0
            }
            val primaryAction = when (event.actionMasked) {
                MotionEvent.ACTION_DOWN ->
                    RayactEngineSession.TOUCH_DOWN
                MotionEvent.ACTION_UP ->
                    RayactEngineSession.TOUCH_UP
                MotionEvent.ACTION_CANCEL -> RayactEngineSession.TOUCH_CANCEL
                MotionEvent.ACTION_POINTER_DOWN,
                MotionEvent.ACTION_POINTER_UP -> null
                else -> RayactEngineSession.TOUCH_MOVE
            }
            if (primaryAction != null) {
                val offsetX = event.rawX - event.x
                val offsetY = event.rawY - event.y
                session()?.nativeTouch(
                    primaryAction,
                    event.getPointerId(primaryIndex),
                    event.getX(primaryIndex) + offsetX,
                    event.getY(primaryIndex) + offsetY,
                )
            }
            session()?.host?.renderScheduler?.requestFrame()
            return true
        }

        fun resolveGesture(accepted: Boolean) {
            if (resolved != null) return
            resolved = accepted
            if (accepted) {
                for (event in preservedEvents) super.dispatchTouchEvent(event)
            }
            disposeSequence()
        }

        fun disposeSequence() {
            preservedEvents.forEach(MotionEvent::recycle)
            preservedEvents.clear()
        }
    }

    /** Generic texture compositor for package-registered Android views. */
    private class TextFieldHost(val nodeId: Int, val context: Context) : PlatformHost {
        var editText: EditText? = null
            private set
        /** Node rect in surface px (set from the engine's layout pushes). */
        override val screenRect = RectF()
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

        override fun resize(fieldWPx: Int, fieldHPx: Int, densityDpi: Int) {
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
        override fun forwardTouch(event: MotionEvent) {
            val decor = presentation?.window?.decorView ?: return
            val local = MotionEvent.obtain(event)
            local.offsetLocation(-(screenRect.left - padLeft), -(screenRect.top - padTop))
            decor.dispatchTouchEvent(local)
            local.recycle()
        }

        /** After a routed tap: bind the IME to this field via the proxy. */
        override fun ensureImeFocus() {
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

        override fun setProperties(properties: Map<String, Any?>) {
            for ((key, rawValue) in properties) {
                val value = rawValue?.toString().orEmpty()
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

        override fun dispose() {
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

fun platformViewCreateFromHost(surfaceId: Int, nodeId: Int, kind: String, propsJson: String) {
    RayactPlatformViews.onCreate(surfaceId, nodeId, kind, propsJson)
}

fun platformViewRectFromHost(surfaceId: Int, nodeId: Int, kind: String, x: Float, y: Float, w: Float, h: Float) {
    RayactPlatformViews.onRect(surfaceId, nodeId, kind, x, y, w, h)
}

fun platformViewInputFromHost(nodeId: Int, action: Int, lx: Float, ly: Float) {
    RayactPlatformViews.onInput(nodeId, action, lx, ly)
}

fun platformViewPropsFromHost(nodeId: Int, propsJson: String) {
    RayactPlatformViews.onProps(nodeId, propsJson)
}

fun platformViewDisposeFromHost(nodeId: Int) {
    RayactPlatformViews.onDispose(nodeId)
}

fun platformViewsBeginFrameFromHost(
    surfaceId: Int, width: Float, height: Float, density: Float,
) {
    RayactPlatformViews.beginFrame(surfaceId, width, height, density)
}

fun platformViewCompositeFromHost(
    surfaceId: Int, nodeId: Int, compositionJson: String,
): Long = RayactPlatformViews.composite(surfaceId, nodeId, compositionJson)

fun platformViewsEndFrameFromHost(surfaceId: Int) {
    RayactPlatformViews.endFrame(surfaceId)
}

fun platformViewGestureDecisionFromHost(
    surfaceId: Int, nodeId: Int, accepted: Boolean,
) {
    RayactPlatformViews.resolveGesture(surfaceId, nodeId, accepted)
}
