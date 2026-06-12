package com.rayact.devclient

import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.rayact.app.NavigationHost
import com.rayact.engine.RayactEngine

class DevMenuOverlay(private val host: NavigationHost) {
    private val panel = LinearLayout(host.context).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(0xEE1E1E1E.toInt())
        setPadding(48, 48, 48, 48)
        visibility = View.GONE
        elevation = 24f
    }
    private val serverLabel = TextView(host.context).apply {
        setTextColor(0xFFB0B0B0.toInt())
        textSize = 11f
    }

    init {
        val title = TextView(host.context).apply {
            text = "Dev Menu"
            setTextColor(Color.WHITE)
            textSize = 16f
        }
        panel.addView(title)
        panel.addView(serverLabel)
        panel.addView(makeButton("Reload") {
            val url = DevClientBridge.savedDevServerUrl()
            if (!url.isNullOrEmpty()) RayactEngine.loadDevServer(url)
            hide()
        })
        panel.addView(makeButton("Close") { hide() })

        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM or Gravity.END
        ).apply {
            setMargins(48, 48, 48, 192)
        }
        host.addView(panel, params)
    }

    private fun makeButton(label: String, onClick: () -> Unit): Button {
        return Button(host.context).apply {
            text = label
            setOnClickListener { onClick() }
        }
    }

    fun toggle() {
        if (panel.visibility == View.VISIBLE) hide() else show()
    }

    fun show() {
        serverLabel.text = "Server: ${DevClientBridge.savedDevServerUrl().orEmpty()}"
        panel.visibility = View.VISIBLE
    }

    fun hide() {
        panel.visibility = View.GONE
    }
}
