package com.rayact.app

import android.content.res.Configuration
import android.graphics.Color
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import com.rayact.app.BuildConfig
import com.rayact.devclient.DevClientBridge
import com.rayact.devclient.DevServerLoader
import com.rayact.devclient.DevShakeDetector
import com.rayact.engine.RayactEngine
import com.rayact.engine.RayactHostRegistry
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_DEV_SERVER_URL = "RAYACT_DEV_SERVER"
    }

    private lateinit var host: NavigationHost
    private var shakeDetector: DevShakeDetector? = null
    @Volatile private var destroyed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val devServer = intent.getStringExtra(EXTRA_DEV_SERVER_URL)
        if (BuildConfig.RAYACT_DEV_CLIENT && devServer.isNullOrBlank()) {
            startActivity(Intent(this, DevLauncherActivity::class.java))
            finish()
            return
        }

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        DevClientBridge.init(this)
        RayactEngine.create(filesDir.absolutePath)

        if (!devServer.isNullOrBlank()) {
            loadDevServerAndInstallHost(devServer)
            return
        }

        loadAppJs(null)
        installHost()
    }

    private fun installHost() {
        host = NavigationHost(this)
        host.installRoot(RayactSurfaceView(this))
        setContentView(host)
        if (BuildConfig.RAYACT_DEV_CLIENT) {
            RayactHostRegistry.attachDevMenuOverlay(host)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                forwardBackToJs()
            }
        })

        if (BuildConfig.RAYACT_DEV_CLIENT) {
            shakeDetector = DevShakeDetector(this).also { it.start() }
        }
    }

    private fun loadDevServerAndInstallHost(devServer: String) {
        Thread {
            val result = runCatching { DevServerLoader.fetchBundle(devServer) }
            runOnUiThread {
                if (destroyed) return@runOnUiThread
                val payload = result.getOrNull()
                if (payload != null) {
                    if (payload.bundleFormat == "qjsbc") {
                        RayactEngine.loadBytecode(payload.bytes)
                    } else {
                        RayactEngine.loadSource(payload.bytes.toString(Charsets.UTF_8))
                    }
                } else {
                    val message = result.exceptionOrNull()?.message ?: "Failed to load dev server"
                    RayactEngine.loadSource(
                        """
                        var root = createView({ backgroundColor: 0x2B1111FF, padding: 24, gap: 12, flexGrow: 1 });
                        appendChild(root, createText('Rayact dev server error', { text: { color: 0xFFFFFFFF, fontSize: 24 } }));
                        appendChild(root, createText(${JSONObject.quote(message)}, { text: { color: 0xFFB4B4FF, fontSize: 14 } }));
                        setRootNode(root);
                        """.trimIndent()
                    )
                }
                installHost()
            }
        }.start()
    }

    override fun onDestroy() {
        destroyed = true
        shakeDetector?.stop()
        shakeDetector = null
        super.onDestroy()
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

    private fun loadAppJs(devServer: String?) {
        val envDev = devServer ?: System.getenv(EXTRA_DEV_SERVER_URL)
        if (!envDev.isNullOrEmpty()) {
            RayactEngine.loadDevServer(envDev)
            return
        }

        if (BuildConfig.RAYACT_DEV_CLIENT) {
            val src = runCatching { assets.open("app.js").bufferedReader().use { it.readText() } }.getOrNull()
            if (src != null) RayactEngine.loadDevClient(src)
            return
        }

        val qjsbc = runCatching { assets.open("app.qjsbc").use { it.readBytes() } }.getOrNull()
        if (qjsbc != null) {
            RayactEngine.loadBytecode(qjsbc)
            return
        }

        val src = runCatching { assets.open("app.js").bufferedReader().use { it.readText() } }.getOrNull()
        if (src != null) RayactEngine.loadSource(src)
    }
}
