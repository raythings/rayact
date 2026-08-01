package com.rayact.app

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceControl
import android.view.SurfaceView
import android.view.TextureView
import android.os.Build
import android.widget.FrameLayout
import com.rayact.engine.RayactEngineSession
import com.rayact.engine.RayactPlatformViews

/**
 * One screen-scoped Android hierarchy. The renderer SurfaceView stays at index
 * zero; real platform views and renderer overlay surfaces are interleaved above
 * it by [RayactPlatformViews].
 */
class RayactPlatformViewContainer(
    context: Context,
    val rayactSurfaceView: RayactSurfaceView,
) : FrameLayout(context) {
    var surfaceId: Int = 0
        internal set

    init {
        clipChildren = false
        clipToPadding = false
        addView(
            rayactSurfaceView,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
    }

    override fun onDetachedFromWindow() {
        if (surfaceId > 0) RayactPlatformViews.unregisterScreen(surfaceId, this)
        super.onDetachedFromWindow()
    }
}

/**
 * Transparent renderer plane shared by all logical slices on HCPP devices.
 * The Vulkan backend owns the swapchain; this view owns only the Android
 * hierarchy/surface lifetime.
 */
internal class RayactOverlaySurfaceView(
    context: Context,
    private val session: RayactEngineSession,
    val registeredSurfaceId: Long,
) : SurfaceView(context), SurfaceHolder.Callback {
    @Volatile var registered = false
        private set

    init {
        setZOrderOnTop(true)
        // Match Flutter's HCPP overlay contract: request a concrete RGBA
        // buffer instead of the legacy TRANSLUCENT hint. Some compositors
        // otherwise choose a format whose alpha interpretation lightens
        // opaque framework colors above the platform view.
        holder.setFormat(PixelFormat.RGBA_8888)
        holder.addCallback(this)
        isFocusable = false
        isClickable = false
        visibility = INVISIBLE
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        scheduleHierarchyTransaction(visible = false)
        registered = session.registerOverlaySurface(
            registeredSurfaceId,
            holder.surface,
            width.coerceAtLeast(1),
            height.coerceAtLeast(1),
        )
        if (registered) session.host.renderScheduler.requestFrame()
    }

    override fun surfaceChanged(
        holder: SurfaceHolder, format: Int, width: Int, height: Int,
    ) {
        if (registered) {
            session.resizeOverlaySurface(
                registeredSurfaceId,
                width.coerceAtLeast(1),
                height.coerceAtLeast(1),
            )
            session.host.renderScheduler.requestFrame()
        }
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        if (registered) session.unregisterOverlaySurface(registeredSurfaceId)
        registered = false
    }

    fun scheduleHierarchyTransaction(visible: Boolean) {
        if (Build.VERSION.SDK_INT < 34 || !holder.surface.isValid) return
        val attached = rootSurfaceControl ?: return
        val child: SurfaceControl = surfaceControl
        val transaction = attached.buildReparentTransaction(child) ?: return
        transaction.setLayer(child, Int.MAX_VALUE)
        transaction.setVisibility(child, visible)
        attached.applyTransactionOnDraw(transaction)
    }
}

/**
 * Renderer overlay plane for a non-final slice boundary. Unlike
 * [RayactOverlaySurfaceView] (an independent surface that can only composite
 * above the entire window), a TextureView is an ordinary view: it interleaves
 * with platform views by child order, which is what lets raym3 chrome painted
 * after one platform view sit *below* the next one (Flutter's HC model).
 * The Vulkan backend renders into the SurfaceTexture like any registered
 * overlay swapchain.
 */
internal class RayactOverlayTextureView(
    context: Context,
    private val session: RayactEngineSession,
    val registeredSurfaceId: Long,
) : TextureView(context), TextureView.SurfaceTextureListener {
    @Volatile var registered = false
        private set
    private var registeredSurface: Surface? = null

    init {
        isOpaque = false
        isFocusable = false
        isClickable = false
        visibility = INVISIBLE
        surfaceTextureListener = this
    }

    override fun onSurfaceTextureAvailable(
        texture: SurfaceTexture, width: Int, height: Int,
    ) {
        val surface = Surface(texture)
        registeredSurface = surface
        registered = session.registerOverlaySurface(
            registeredSurfaceId,
            surface,
            width.coerceAtLeast(1),
            height.coerceAtLeast(1),
        )
        if (registered) session.host.renderScheduler.requestFrame()
    }

    override fun onSurfaceTextureSizeChanged(
        texture: SurfaceTexture, width: Int, height: Int,
    ) {
        if (registered) {
            session.resizeOverlaySurface(
                registeredSurfaceId,
                width.coerceAtLeast(1),
                height.coerceAtLeast(1),
            )
            session.host.renderScheduler.requestFrame()
        }
    }

    override fun onSurfaceTextureDestroyed(texture: SurfaceTexture): Boolean {
        if (registered) session.unregisterOverlaySurface(registeredSurfaceId)
        registered = false
        registeredSurface?.release()
        registeredSurface = null
        return true
    }

    override fun onSurfaceTextureUpdated(texture: SurfaceTexture) {}
}
