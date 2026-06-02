package com.rayact.app

import android.graphics.Color
import android.os.Bundle
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import com.rayact.engine.RayactEngine

/**
 * Edge-to-edge host: content draws full-bleed behind the status + nav bars,
 * which stay VISIBLE (not immersive). Window size == screen size — the native
 * surface spans the display and raylib InitWindow(0,0) reads that size.
 */
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge: lay out behind the system bars, keep them shown + transparent.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        // Keep the screen on while rendering.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Engine is process-level — create once; survives Activity recreation.
        RayactEngine.create(filesDir.absolutePath)
        loadAppJs()

        setContentView(RayactSurfaceView(this))
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
