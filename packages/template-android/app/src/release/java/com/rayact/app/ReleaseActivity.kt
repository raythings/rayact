package com.rayact.app

import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import com.rayact.engine.RayactEngineSession

/** Release-only entry point. It owns one engine session and loads embedded app assets. */
class ReleaseActivity : AppCompatActivity() {
    private lateinit var session: RayactEngineSession
    private lateinit var host: NavigationHost

    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            session.nativeOnBackPressed()
            session.host.renderScheduler.requestFrame()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        RayactBundledAssets.extract(this)
        session = RayactEngineSession.create(filesDir.absolutePath)
            ?: throw IllegalStateException("Failed to create Rayact engine session")
        host = NavigationHost(this, session).also {
            it.installRoot(RayactSurfaceView(this, session))
        }
        setContentView(host, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        onBackPressedDispatcher.addCallback(this, backCallback)

        val bytecode = runCatching { assets.open("app.qjsbc").use { it.readBytes() } }.getOrNull()
        if (bytecode != null && bytecode.isNotEmpty()) {
            check(session.loadBytecode(bytecode)) { "Failed to load embedded app bytecode" }
        } else {
            val source = assets.open("app.js").bufferedReader().use { it.readText() }
            check(session.loadSource(source)) { "Failed to load embedded app bundle" }
        }
    }

    override fun onStart() {
        super.onStart()
        if (session.acquireGraphics()) host.recreateSurfacesAfterGraphicsResume()
    }

    override fun onStop() {
        session.releaseGraphics()
        super.onStop()
    }

    override fun onDestroy() {
        backCallback.remove()
        host.dispose()
        session.destroy()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(event)
        val unicode = event.unicodeChar
        val text = if (unicode > 0) String(Character.toChars(unicode)) else ""
        session.nativeKeyEvent(
            if (event.action == KeyEvent.ACTION_UP) 1 else 0,
            text,
            KeyEvent.keyCodeToString(event.keyCode),
            "",
            event.repeatCount > 0,
            event.isCtrlPressed,
            event.isAltPressed,
            event.isShiftPressed,
            event.isMetaPressed
        )
        if (event.action == KeyEvent.ACTION_DOWN && text.isNotEmpty()) {
            session.nativeKeyEvent(2, "", "", text, false, false, false, event.isShiftPressed, false)
        }
        session.host.renderScheduler.requestFrame()
        return super.dispatchKeyEvent(event)
    }
}
