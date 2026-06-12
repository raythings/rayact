package com.rayact.app

import android.graphics.Color
import android.os.Bundle
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import com.rayact.devclient.DevClientBridge
import com.rayact.engine.RayactEngine

class DevLauncherActivity : AppCompatActivity() {
    private lateinit var host: NavigationHost

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        DevClientBridge.init(this)
        RayactEngine.create(filesDir.absolutePath)

        host = NavigationHost(this)
        host.installRoot(RayactSurfaceView(this))
        setContentView(host)
        loadAppJs()
    }

    private fun loadAppJs() {
        val src = runCatching { assets.open("app.js").bufferedReader().use { it.readText() } }.getOrNull()
        if (src != null) RayactEngine.loadDevClient(src)
    }
}
