package com.rayact.app

import android.content.Context
import android.util.AttributeSet
import android.widget.FrameLayout
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.FragmentManager
import com.rayact.engine.RayactEngine
import com.rayact.engine.RayactHostRegistry

/**
 * The container that hosts pushed [RayactScreenFragment]s. Mirrors the
 * `TamerNavHost` design from `@tamer4lynx/tamer-navigation`: the C++ engine
 * is the single coordinator, but each pushed screen is a proper Android
 * Fragment with full lifecycle + FragmentManager back stack.
 *
 * The root screen is a plain [RayactSurfaceView] (no Fragment wrapper) — it
 * predates the navigation API and is always present. All pushed screens
 * after the root are Fragments.
 *
 * Lifecycle:
 *   - `installRoot(view)` adds the root surface to the container directly.
 *   - `pushScreen()` returns a new fragment; the caller awaits its
 *     `surfaceId` (signaled via the fragment's `onSurfaceReady` callback).
 *   - `popScreen()` pops the top fragment off the FragmentManager back
 *     stack, which fires the fragment's onDestroyView → surfaceDestroyed
 *     → engine destroy chain.
 *
 * Back press: FragmentManager's back stack is automatically popped by the
 * system, so no manual `onBackPressed` override is required for the
 * standard back-button case. The JS navigator listens to state changes
 * and matches the FragmentManager (so the system back button also
 * triggers the router's `goBack`, keeping state in sync).
 */
class NavigationHost @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : FrameLayout(context, attrs) {

    /** surfaceId of the root view (the one installed by [installRoot]). */
    var rootSurfaceId: Int = 0
        private set
    private var rootSurfaceView: RayactSurfaceView? = null
    private val fragmentsBySurfaceId = LinkedHashMap<Int, RayactScreenFragment>()

    init {
        id = R.id.rayact_nav_stack_container
        // Register with the global host registry so the C++ engine (via JNI
        // reverse-call) can ask us to allocate a new fragment when the JS
        // navigator pushes a screen.
        RayactHostRegistry.setHost(this)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        RayactHostRegistry.clearHost(this)
    }

    /**
     * Returns the FragmentManager that owns this host's children. The host
     * must be inside a [FragmentActivity] (its `supportFragmentManager`).
     */
    fun fragmentManager(): FragmentManager {
        val activity = context as? FragmentActivity
            ?: throw IllegalStateException(
                "NavigationHost must be hosted by a FragmentActivity"
            )
        return activity.supportFragmentManager
    }

    /**
     * Add the root surface (always present, never popped). The root is NOT
     * a fragment — it's the legacy single-screen before the navigation API
     * was added. It occupies the same container as the fragments; the
     * fragments are added ON TOP.
     */
    fun installRoot(root: RayactSurfaceView) {
        if (indexOfChild(root) >= 0) return
        rootSurfaceView = root
        addView(root, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        // The root surface's surfaceId is 0 until surfaceCreated fires
        // (asynchronous), so pushToFront() must run from the ready callback,
        // not here. Without pushing the root onto the engine screen stack the
        // stack stays empty and engineRenderFrameAndroid early-returns
        // (nothing renders, navigation can't stack).
        root.surfaceReadyListener = { sid ->
            rootSurfaceId = sid
            root.pushToFront()
        }
        // If the surface was already created (synchronous in some host
        // paths), push now.
        if (root.surfaceId > 0) {
            rootSurfaceId = root.surfaceId
            root.pushToFront()
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

    /**
     * Push a new screen fragment. The fragment is added to the FragmentManager
     * with NO custom animations — the transition is driven by the JS-side
     * SceneView (the upper card's raym3 transform style props). The fragment
     * is added instantly; the FragmentManager doesn't move the SurfaceView,
     * so the engine-driven slide / fade is the only motion the user sees.
     * Returns the fragment; the caller must await its `surfaceId` via the
     * `onSurfaceReady` callback.
     */
    fun pushScreen(): RayactScreenFragment {
        val frag = RayactScreenFragment()
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

    /**
     * Pop the top fragment. Returns true if a pop happened, false if the
     * FragmentManager back stack is empty (only the root is showing).
     */
    fun popScreen(): Boolean {
        val entry = fragmentsBySurfaceId.entries.lastOrNull() ?: return false
        return releaseSurface(entry.key)
    }

    /** Number of pushed screens (Fragments), excluding the root. */
    fun pushedCount(): Int = fragmentsBySurfaceId.size

    fun releaseSurface(surfaceId: Int): Boolean {
        if (surfaceId <= 0 || surfaceId == rootSurfaceId) return false
        val fragment = fragmentsBySurfaceId.remove(surfaceId) ?: return false
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

    /**
     * Returns the surfaceId of the topmost fragment, or 0 if none.
     */
    fun topFragmentSurfaceId(): Int {
        return fragmentsBySurfaceId.keys.lastOrNull() ?: 0
    }
}
