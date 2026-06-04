package com.rayact.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.rayact.engine.RayactEngine

/**
 * One pushed screen in the Rayact navigation stack. A Fragment (not just a
 * View) so it gets the proper Android lifecycle, FragmentManager back stack,
 * and `OnBackPressedDispatcher` integration that tamer-navigation models.
 *
 * Each fragment owns exactly one [RayactSurfaceView], which the engine maps
 * to one EGL surface + one engine screen. `surfaceId` is filled in once
 * the surface is created and the engine has allocated a screen.
 *
 * The C++ engine is the single coordinator: every fragment's engine screen
 * shares the same QJS context. The JS-side navigator mounts each route's
 * React tree into the right engine screen via `setCurrentScreen(surfaceId)`.
 */
class RayactScreenFragment : Fragment() {

    private var surfaceView: RayactSurfaceView? = null
    /** Engine screenId == EGL surfaceId, or 0 if not yet created. */
    var surfaceId: Int = 0
        private set
    /** One-shot listener invoked on the main thread once [surfaceId] is set. */
    var onSurfaceReady: ((Int) -> Unit)? = null
    private var surfaceReadyFired = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val view = RayactSurfaceView(requireContext())
        // Compose this pushed screen's surface ABOVE the root surface (and any
        // screens beneath). Overlapping SurfaceViews otherwise fall into the
        // same layer and the new screen can render behind the root.
        view.setZOrderMediaOverlay(true)
        view.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        view.surfaceReadyListener = { sid ->
            if (!surfaceReadyFired && sid > 0) {
                surfaceReadyFired = true
                surfaceId = sid
                // Push this screen onto the engine's z-order stack so the
                // render loop composes it on top of the screens beneath it.
                // Without this the new screen exists but is never rendered.
                view.pushToFront()
                onSurfaceReady?.invoke(sid)
            }
        }
        surfaceView = view
        return view
    }

    override fun onDestroyView() {
        super.onDestroyView()
        surfaceView = null
    }
}
