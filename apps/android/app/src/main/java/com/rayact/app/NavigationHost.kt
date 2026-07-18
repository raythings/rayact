package com.rayact.app

import android.content.Context
import android.util.AttributeSet
import android.widget.FrameLayout
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.FragmentManager
import com.rayact.engine.RayactEngineSession
import com.rayact.engine.RayactHost

class NavigationHost @JvmOverloads constructor(
    context: Context,
    private val session: RayactEngineSession,
    attrs: AttributeSet? = null
) : FrameLayout(context, attrs) {

    var rootSurfaceId: Int = 0
        private set
    private var rootSurfaceView: RayactSurfaceView? = null
    private val fragmentsBySurfaceId = LinkedHashMap<Int, RayactScreenFragment>()
    // A fragment can be queued before its SurfaceView has a native id, so it
    // must be tracked independently of fragmentsBySurfaceId for host teardown.
    private val pushedFragments = LinkedHashSet<RayactScreenFragment>()

    val engineSession: RayactEngineSession get() = session
    val host: RayactHost get() = session.host

    init {
        id = R.id.rayact_nav_stack_container
        session.host.setNavigationHost(this)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        session.host.setNavigationHost(this)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        session.host.clearNavigationHost(this)
    }

    fun fragmentManager(): FragmentManager {
        val activity = context as? FragmentActivity
            ?: throw IllegalStateException("NavigationHost must be hosted by a FragmentActivity")
        return activity.supportFragmentManager
    }

    fun installRoot(root: RayactSurfaceView, onReady: ((Int) -> Unit)? = null) {
        if (indexOfChild(root) >= 0) return
        rootSurfaceView = root
        addView(root, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        root.surfaceReadyListener = { sid ->
            rootSurfaceId = sid
            root.pushToFront()
            onReady?.invoke(sid)
        }
        if (root.surfaceId > 0) {
            rootSurfaceId = root.surfaceId
            root.pushToFront()
            onReady?.invoke(root.surfaceId)
        }
    }

    fun syncSurfacesToCurrentLayout() {
        requestLayout()
        post {
            rootSurfaceView?.syncSurfaceSizeFromLayout()
            for (fragment in fragmentsBySurfaceId.values) {
                fragment.rayactSurfaceView()?.syncSurfaceSizeFromLayout()
            }
        }
    }

    fun recreateSurfacesAfterGraphicsResume() {
        requestLayout()
        post {
            rootSurfaceView?.recreateNativeSurfaceAfterGraphicsResume()
            for (fragment in fragmentsBySurfaceId.values) {
                fragment.rayactSurfaceView()?.recreateNativeSurfaceAfterGraphicsResume()
            }
        }
    }

    fun pushScreen(): RayactScreenFragment {
        val frag = RayactScreenFragment(session)
        pushedFragments.add(frag)
        val fm = fragmentManager()
        val tag = "rayact-screen-${System.nanoTime()}"
        fm.beginTransaction()
            .setReorderingAllowed(true)
            .add(id, frag, tag)
            .commit()
        return frag
    }

    fun noteSurfaceReady(fragment: RayactScreenFragment, surfaceId: Int) {
        if (surfaceId > 0) fragmentsBySurfaceId[surfaceId] = fragment
    }

    fun popScreen(): Boolean {
        val entry = fragmentsBySurfaceId.entries.lastOrNull() ?: return false
        return releaseSurface(entry.key)
    }

    fun pushedCount(): Int = fragmentsBySurfaceId.size

    fun releaseSurface(surfaceId: Int): Boolean {
        if (surfaceId <= 0 || surfaceId == rootSurfaceId) return false
        val fragment = fragmentsBySurfaceId.remove(surfaceId) ?: return false
        pushedFragments.remove(fragment)
        fragmentManager().beginTransaction()
            .setReorderingAllowed(true)
            .remove(fragment)
            .commit()
        return true
    }

    fun orderSurfaces(surfaceIds: IntArray) {
        for (surfaceId in surfaceIds) {
            if (surfaceId == rootSurfaceId) continue
            val view = fragmentsBySurfaceId[surfaceId]?.rayactSurfaceView()
            view?.bringToFront()
        }
        invalidate()
    }

    fun topFragmentSurfaceId(): Int = fragmentsBySurfaceId.keys.lastOrNull() ?: 0

    /**
     * Remove every native navigation surface before its engine session dies.
     * Removing this host view alone leaves FragmentManager-owned SurfaceViews
     * alive; those stale views can cover a newly reloaded project and consume
     * its input (notably worker/WASM canvas screens).
     */
    fun dispose() {
        session.host.clearNavigationHost(this)
        val fragments = pushedFragments.toList()
        pushedFragments.clear()
        fragmentsBySurfaceId.clear()
        if (fragments.isNotEmpty()) {
            runCatching {
                fragmentManager().beginTransaction()
                    .setReorderingAllowed(true)
                    .apply { fragments.forEach { remove(it) } }
                    .commitNowAllowingStateLoss()
            }
        }
        rootSurfaceView = null
        removeAllViews()
    }
}
