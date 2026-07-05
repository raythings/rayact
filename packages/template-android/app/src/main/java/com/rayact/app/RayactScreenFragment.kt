package com.rayact.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.rayact.engine.RayactEngineSession

class RayactScreenFragment(
    private val session: RayactEngineSession
) : Fragment() {

    private var surfaceView: RayactSurfaceView? = null
    var surfaceId: Int = 0
        private set
    var onSurfaceReady: ((Int) -> Unit)? = null
    private var surfaceReadyFired = false

    fun rayactSurfaceView(): RayactSurfaceView? = surfaceView

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val view = RayactSurfaceView(requireContext(), session)
        view.setZOrderMediaOverlay(true)
        view.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        view.surfaceReadyListener = { sid ->
            if (!surfaceReadyFired && sid > 0) {
                surfaceReadyFired = true
                surfaceId = sid
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
