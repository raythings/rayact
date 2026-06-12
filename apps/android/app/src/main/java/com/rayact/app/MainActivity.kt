package com.rayact.app

import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import com.rayact.engine.RayactEngine

/**
 * Edge-to-edge host: content draws full-bleed behind the status + nav bars,
 * which stay VISIBLE (not immersive). Window size == screen size — the native
 * surface spans the display and raylib InitWindow(0,0) reads that size.
 *
 * The content view is a [NavigationHost] — a stack of [RayactScreenFragment]s
 * (one per pushed screen) plus a root [RayactSurfaceView]. The C++ engine
 * is the single coordinator; it owns the QJS context, the per-screen bridge
 * state, and the screen stack. The JS-side @rayact/navigation package
 * drives navigation by calling __rayactHostRequestNewSurface / ReleaseTopSurface
 * (forwarded to JNI → Kotlin), which manipulate the FragmentManager back
 * stack here.
 *
 * System back press is routed through an OnBackPressedCallback that asks
 * the JS navigator to pop. The navigator then updates its state, which
 * re-runs its useEffect, which calls __rayactHostReleaseTopSurface — which
 * pops the Fragment. This keeps JS router state and the FragmentManager
 * back stack in lockstep (the system back button is the *initiator* of
 * the pop on the JS side, not a parallel pop path).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var host: NavigationHost

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge: lay out behind the system bars, keep them shown + transparent.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Engine is process-level — create once; survives Activity recreation.
        RayactEngine.create(filesDir.absolutePath)
        loadAppJs()

        host = NavigationHost(this)
        // Root surface is the legacy single-screen (surfaceId 1). It's the
        // base of the navigation stack and is never popped.
        host.installRoot(RayactSurfaceView(this))
        setContentView(host)

        // System back: forward into the JS pump. The JS-side
        // @rayact/navigation BackHandler listener decides what to do —
        // typically it dispatches navigation.goBack() (animates exit,
        // then releases the top surface). If no listener handles it
        // (e.g. the user is at the root with nothing to pop), the
        // render thread's drain falls back to finishActivityFromHost
        // and the activity finishes. This is the JS-as-source-of-truth
        // path; there is no parallel Kotlin pop route.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                forwardBackToJs()
            }
        })
    }

    private fun forwardBackToJs() {
        RayactEngine.nativeOnBackPressed()
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            forwardBackToJs()
            return true
        }
        return super.onKeyUp(keyCode, event)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        host.syncSurfacesToCurrentLayout()
    }

    @Deprecated("Use OnBackPressedDispatcher; kept as a fallback for adb/hardware key paths.")
    override fun onBackPressed() {
        forwardBackToJs()
    }

    /**
     * Dev: RAYACT_DEV_SERVER (e.g. http://127.0.0.1:8080 over `adb reverse`).
     * Release: bundled assets/app.js.
     */
    private fun loadAppJs() {
        val dev = System.getenv("RAYACT_DEV_SERVER")
        if (!dev.isNullOrEmpty()) {
            RayactEngine.loadDevServer(dev)
            return
        }
        val src = runCatching { assets.open("app.js").bufferedReader().use { it.readText() } }.getOrNull()
        if (src != null) RayactEngine.loadSource(src)
    }
}
