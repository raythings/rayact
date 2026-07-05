package com.rayact.engine

import android.os.Handler
import android.os.Looper
import com.rayact.app.NavigationHost
import com.rayact.app.RayactRenderScheduler
import com.rayact.app.RayactScreenFragment
import com.rayact.app.RayactSurfaceView
import com.rayact.devclient.DevClientBridge
import com.rayact.devclient.DevMenuOverlay
import java.lang.ref.WeakReference
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class RayactHost(
    private val session: RayactEngineSession,
    val renderScheduler: RayactRenderScheduler
) : RayactEngineHostCallbacks {

    @Volatile
    private var navigationHost: WeakReference<NavigationHost>? = null

    @Volatile
    private var devMenuOverlay: DevMenuOverlay? = null

    @Volatile
    var imeView: RayactSurfaceView? = null
        private set

    val hostCallbacks: RayactEngineHostCallbacks get() = this

    fun registerImeView(v: RayactSurfaceView) { imeView = v }
    fun unregisterImeView(v: RayactSurfaceView) { if (imeView === v) imeView = null }

    fun setNavigationHost(h: NavigationHost) {
        navigationHost = WeakReference(h)
    }

    fun clearNavigationHost(h: NavigationHost) {
        if (navigationHost?.get() === h) navigationHost = null
    }

    override fun requestNewSurface(): Int {
        val h = navigationHost?.get() ?: return 0
        val latch = CountDownLatch(1)
        val result = IntArray(1)
        Handler(Looper.getMainLooper()).post {
            try {
                val frag = h.pushScreen()
                frag.onSurfaceReady = { sid ->
                    h.noteSurfaceReady(frag, sid)
                    result[0] = sid
                    latch.countDown()
                }
                if (frag.surfaceId > 0) {
                    result[0] = frag.surfaceId
                    latch.countDown()
                }
            } catch (_: Throwable) {
                latch.countDown()
            }
        }
        latch.await(2, TimeUnit.SECONDS)
        return result[0]
    }

    override fun releaseTopSurface() {
        val h = navigationHost?.get() ?: return
        Handler(Looper.getMainLooper()).post { h.popScreen() }
    }

    override fun releaseSurface(surfaceId: Int) {
        val h = navigationHost?.get() ?: return
        Handler(Looper.getMainLooper()).post { h.releaseSurface(surfaceId) }
    }

    override fun orderSurfaces(surfaceIds: IntArray) {
        val h = navigationHost?.get() ?: return
        Handler(Looper.getMainLooper()).post { h.orderSurfaces(surfaceIds) }
    }

    override fun rootSurfaceId(): Int = navigationHost?.get()?.rootSurfaceId ?: 0

    override fun topSurfaceId(): Int {
        val h = navigationHost?.get() ?: return 0
        return h.topFragmentSurfaceId().takeIf { it > 0 } ?: h.rootSurfaceId
    }

    override fun finishActivity() {
        // Return to the in-app dev launcher instead of finishing the Activity
        // whenever a project pane is actually open over a launcher session. This
        // is gated purely at runtime (tryShowLauncherFromFinishActivity checks a
        // dev host is registered and the active session isn't the launcher) — a
        // plain app is always in the launcher pane, so it still finishes. The old
        // BuildConfig.RAYACT_DEV_CLIENT compile gate disabled this in release
        // builds, so the release dev-app exited (and crashed in the two-session
        // onDestroy teardown) instead of going back to the launcher.
        if (DevClientBridge.tryShowLauncherFromFinishActivity()) {
            return
        }
        val h = navigationHost?.get() ?: return
        val activity = (h.context as? android.app.Activity) ?: return
        Handler(Looper.getMainLooper()).post { activity.finish() }
    }

    fun attachDevMenuOverlay(h: NavigationHost) {
        Handler(Looper.getMainLooper()).post {
            devMenuOverlay = DevMenuOverlay(h, session)
        }
    }

    override fun toggleDevMenu() {
        Handler(Looper.getMainLooper()).post { devMenuOverlay?.toggle() }
    }

    override fun requestRenderFrame() {
        renderScheduler.requestFrame()
    }

    override fun stopRenderScheduler() {
        renderScheduler.stopRendering()
    }

    override fun showSoftKeyboard(
        nodeId: Int,
        value: String,
        inputType: String,
        autocorrect: Boolean,
        secure: Boolean,
        imeAction: String
    ) {
        val view = imeView ?: return
        Handler(Looper.getMainLooper()).post {
            view.setupForIme(nodeId, value, inputType, autocorrect, secure, imeAction)
        }
    }

    override fun switchIme(
        nodeId: Int,
        value: String,
        inputType: String,
        autocorrect: Boolean,
        secure: Boolean,
        imeAction: String
    ) {
        val view = imeView ?: return
        Handler(Looper.getMainLooper()).post {
            view.switchIme(nodeId, value, inputType, autocorrect, secure, imeAction)
        }
    }

    override fun hideSoftKeyboard() {
        val view = imeView ?: return
        Handler(Looper.getMainLooper()).post { view.clearIme() }
    }

    override fun updateImeState(
        nodeId: Int,
        selectionStart: Int,
        selectionEnd: Int,
        composingStart: Int,
        composingEnd: Int,
        text: String?
    ) {
        val view = imeView ?: return
        Handler(Looper.getMainLooper()).post {
            view.updateImeState(nodeId, text, selectionStart, selectionEnd, composingStart, composingEnd)
        }
    }

    override fun copyToClipboard(text: String) {
        val view = imeView ?: return
        Handler(Looper.getMainLooper()).post {
            val clipboard = view.context.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
                as? android.content.ClipboardManager
            clipboard?.setPrimaryClip(android.content.ClipData.newPlainText("rayact", text))
        }
    }

    override fun readClipboard(): String {
        val view = imeView ?: return ""
        val clipboard = view.context.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
            as? android.content.ClipboardManager
        val clip = clipboard?.primaryClip ?: return ""
        if (clip.itemCount <= 0) return ""
        return clip.getItemAt(0).coerceToText(view.context)?.toString().orEmpty()
    }

    override fun performHapticFeedback() {
        val view = imeView ?: return
        Handler(Looper.getMainLooper()).post {
            view.performHapticFeedback(android.view.HapticFeedbackConstants.TEXT_HANDLE_MOVE)
        }
    }
}
