package com.rayact.app

import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.os.SystemClock
import android.os.Trace
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import com.rayact.devclient.DevClientBridge
import com.rayact.devclient.DevServerLoader
import com.rayact.devclient.DevShakeDetector
import com.rayact.engine.RayactEngineSession
import org.json.JSONObject

class DevLauncherActivity : AppCompatActivity() {
    companion object {
        private const val PERF_TAG = "RayactPerf"
    }

    private enum class ActivePane { LAUNCHER, PROJECT }

    private lateinit var root: FrameLayout
    private lateinit var launcherSession: RayactEngineSession
    private lateinit var launcherHost: NavigationHost

    private var projectSession: RayactEngineSession? = null
    private var projectHost: NavigationHost? = null
    private var projectUrl: String? = null
    private var activePane: ActivePane = ActivePane.LAUNCHER
    @Volatile private var projectLoadGeneration = 0
    private var shakeDetector: DevShakeDetector? = null
    @Volatile private var destroyed = false
    private var projectBackBlockedUntilMs = 0L
    private var launcherBackBlockedUntilMs = 0L
    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            handleDevHostBack()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        RayactBundledAssets.extract(this)

        root = FrameLayout(this)
        setContentView(root)

        val initialProjectUrl = intent.getStringExtra(DevClientBridge.EXTRA_DEV_SERVER_URL)
            ?.takeIf { it.isNotBlank() }

        launcherSession = RayactEngineSession.create(filesDir.absolutePath)
            ?: throw IllegalStateException("Failed to create Rayact engine session")
        launcherHost = createHost(launcherSession)

        DevClientBridge.init(this, launcherSession)
        DevClientBridge.registerDevHost(this, ::openProject, ::reloadProject, ::showLauncher)
        onBackPressedDispatcher.addCallback(this, backCallback)

        if (initialProjectUrl != null) {
            openProject(initialProjectUrl)
        } else {
            loadLauncherJs()
            showLauncher()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.getStringExtra(DevClientBridge.EXTRA_DEV_SERVER_URL)?.takeIf { it.isNotBlank() }?.let { url ->
            openProject(url)
        }
    }

    override fun onStart() {
        super.onStart()
        activeSession()?.acquireGraphics()
    }

    override fun onResume() {
        super.onResume()
        activeSession()?.let { DevClientBridge.attach(this, it) }
    }

    override fun onStop() {
        activeSession()?.releaseGraphics()
        super.onStop()
    }

    override fun onDestroy() {
        destroyed = true
        projectLoadGeneration++
        stopProjectDebugTools()
        destroyProjectSession()
        DevClientBridge.clearDevHost(this)
        backCallback.remove()

        if (::launcherSession.isInitialized) {
            DevClientBridge.detach(this, launcherSession)
            launcherSession.destroy()
        }
        super.onDestroy()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        activeHost()?.syncSurfacesToCurrentLayout()
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (handleDevHostBack()) return true
        }
        return super.onKeyUp(keyCode, event)
    }

    private fun showLauncher() {
        projectLoadGeneration++
        val hadProject = activePane == ActivePane.PROJECT
        if (hadProject) {
            stopProjectDebugTools()
            unmountCurrentPane()
        }
        activePane = ActivePane.LAUNCHER
        launcherBackBlockedUntilMs = SystemClock.uptimeMillis() + 1200L
        mountPane(ActivePane.LAUNCHER, launcherHost, launcherSession)
        launcherHost.post {
            launcherHost.syncSurfacesToCurrentLayout()
            launcherSession.host.renderScheduler.requestFrame()
            if (hadProject) destroyProjectSession()
        }
    }

    private fun openProject(url: String) {
        val normalized = url.trim().replace("\\/", "/")
        if (normalized.isEmpty()) return

        traceInstant("project.open.tap")
        projectLoadGeneration++
        val generation = projectLoadGeneration

        if (activePane == ActivePane.PROJECT) {
            stopProjectDebugTools()
            unmountCurrentPane()
            destroyProjectSession()
        }

        projectUrl = normalized
        val session = ensureProjectSession()
        ensureProjectHost(session)

        Thread {
            val result = traceSection("bundle.fetch") {
                runCatching { DevServerLoader.fetchBundle(normalized) }
            }
            if (destroyed || generation != projectLoadGeneration) return@Thread
            val loaded = traceSection("bundle.eval") {
                val payload = result.getOrNull()
                if (payload != null) {
                    if (payload.bundleFormat == "qjsbc") {
                        session.loadBytecode(payload.bytes)
                    } else {
                        session.loadSource(payload.bytes.toString(Charsets.UTF_8))
                    }
                } else {
                    val message = result.exceptionOrNull()?.message ?: "Failed to load dev server"
                    session.loadSource(
                        """
                        var root = createView({ backgroundColor: 0x2B1111FF, padding: 24, gap: 12, flexGrow: 1 });
                        appendChild(root, createText('Rayact dev server error', { text: { color: 0xFFFFFFFF, fontSize: 24 } }));
                        appendChild(root, createText(${JSONObject.quote(message)}, { text: { color: 0xFFB4B4FF, fontSize: 14 } }));
                        setRootNode(root);
                        """.trimIndent()
                    )
                }
            }
            runOnUiThread {
                if (destroyed || generation != projectLoadGeneration) return@runOnUiThread
                if (!loaded) Log.w(PERF_TAG, "bundle.eval.rejected")
                if (destroyed || generation != projectLoadGeneration) return@runOnUiThread
                traceInstant("project.root.ready")
                switchToProjectPane(session)
            }
        }.start()
    }

    private fun reloadProject() {
        val url = projectUrl ?: DevClientBridge.savedDevServerUrl()
        if (url.isNullOrBlank()) return
        val session = projectSession
        if (activePane == ActivePane.PROJECT && session != null && session.isAlive()) {
            reloadProjectInPlace(url, session)
        } else {
            openProject(url)
        }
    }

    private fun reloadProjectInPlace(url: String, session: RayactEngineSession) {
        session.loadDevServer(url)
        projectHost?.syncSurfacesToCurrentLayout()
        session.host.renderScheduler.requestFrame()
    }

    private fun switchToProjectPane(session: RayactEngineSession) {
        val launcherWasMounted = launcherHost.parent === root
        activePane = ActivePane.PROJECT
        val host = projectHost ?: return
        mountPane(ActivePane.PROJECT, host, session)
        host.post {
            host.syncSurfacesToCurrentLayout()
            session.host.renderScheduler.traceNextFrame("project.first.frame")
            session.host.renderScheduler.requestFrame()
            if (launcherWasMounted) {
                host.postDelayed({
                    if (activePane == ActivePane.PROJECT && launcherHost.parent === root) {
                        root.removeView(launcherHost)
                        launcherSession.releaseGraphics()
                    }
                }, 120L)
            }
        }
    }

    private fun ensureProjectSession(): RayactEngineSession {
        projectSession?.let { return it }
        val session = RayactEngineSession.create(filesDir.absolutePath)
            ?: throw IllegalStateException("Failed to create Rayact project session")
        projectSession = session
        return session
    }

    private fun ensureProjectHost(session: RayactEngineSession) {
        if (projectHost != null) return
        projectHost = createHost(session)
    }

    private fun createHost(session: RayactEngineSession): NavigationHost {
        val host = NavigationHost(this, session)
        host.installRoot(RayactSurfaceView(this, session))
        return host
    }

    private fun mountPane(pane: ActivePane, host: NavigationHost, session: RayactEngineSession) {
        if (host.parent === root) {
            host.bringToFront()
        } else if (host.parent != null) {
            (host.parent as? FrameLayout)?.removeView(host)
            root.addView(host, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ))
        } else {
            root.addView(host, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ))
        }
        session.acquireGraphics()
        DevClientBridge.attach(this, session)
        if (pane == ActivePane.PROJECT) {
            startProjectDebugTools(session, host)
        }
    }

    private fun unmountCurrentPane() {
        val host = activeHost() ?: return
        val session = activeSession() ?: return
        if (host.parent === root) {
            root.removeView(host)
        }
        session.releaseGraphics()
    }

    private fun destroyProjectSession() {
        val session = projectSession ?: return
        if (projectHost?.parent === root) {
            root.removeView(projectHost)
        }
        DevClientBridge.detach(this, session)
        if (session.isAlive()) session.releaseGraphics()
        session.destroy()
        projectSession = null
        projectHost = null
        projectUrl = null
    }

    private fun startProjectDebugTools(session: RayactEngineSession, host: NavigationHost) {
        session.host.attachDevMenuOverlay(host)
        shakeDetector?.stop()
        shakeDetector = DevShakeDetector(this, session).also { it.start() }
    }

    private fun stopProjectDebugTools() {
        shakeDetector?.stop()
        shakeDetector = null
        projectBackBlockedUntilMs = 0L
    }

    private fun handleDevHostBack(): Boolean {
        val now = SystemClock.uptimeMillis()
        if (activePane == ActivePane.PROJECT) {
            if (now < projectBackBlockedUntilMs) return true
            projectBackBlockedUntilMs = now + 600L
            projectSession?.nativeOnBackPressed()
            return true
        }
        if (now < launcherBackBlockedUntilMs) return true

        backCallback.isEnabled = false
        onBackPressedDispatcher.onBackPressed()
        backCallback.isEnabled = true
        return true
    }

    private fun activeSession(): RayactEngineSession? = when (activePane) {
        ActivePane.LAUNCHER -> if (::launcherSession.isInitialized) launcherSession else null
        ActivePane.PROJECT -> projectSession
    }

    private fun activeHost(): NavigationHost? = when (activePane) {
        ActivePane.LAUNCHER -> if (::launcherHost.isInitialized) launcherHost else null
        ActivePane.PROJECT -> projectHost
    }

    private fun loadLauncherJs() {
        val src = runCatching { assets.open("app.js").bufferedReader().use { it.readText() } }.getOrNull()
        if (src != null) launcherSession.loadDevClient(src)
    }

    private fun traceInstant(name: String) {
        Log.i(PERF_TAG, name)
        Trace.beginSection(name)
        Trace.endSection()
    }

    private inline fun <T> traceSection(name: String, block: () -> T): T {
        Log.i(PERF_TAG, "$name.start")
        Trace.beginSection("$name.start")
        Trace.endSection()
        Trace.beginSection(name)
        return try {
            block()
        } finally {
            Trace.endSection()
            Log.i(PERF_TAG, "$name.end")
            Trace.beginSection("$name.end")
            Trace.endSection()
        }
    }
}
