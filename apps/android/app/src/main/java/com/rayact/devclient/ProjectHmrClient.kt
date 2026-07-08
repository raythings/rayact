package com.rayact.devclient

import android.util.Log
import com.rayact.engine.RayactEngineSession
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

object ProjectHmrClient {
    private const val TAG = "ProjectHmrClient"
    private val client = OkHttpClient.Builder().build()
    private val generation = AtomicInteger(0)
    private val running = AtomicBoolean(false)

    @Volatile private var webSocket: WebSocket? = null
    @Volatile private var baseUrl: String? = null
    @Volatile private var session: RayactEngineSession? = null

    fun start(serverUrl: String, engineSession: RayactEngineSession) {
        stop()
        val normalized = DevServerLoader.normalizeBase(serverUrl)
        val gen = generation.incrementAndGet()
        baseUrl = normalized
        session = engineSession
        running.set(true)

        // Runs from runOnUiThread (openProject), so the manifest fetch must not
        // block the main thread — a synchronous httpGet here throws
        // NetworkOnMainThreadException, the connect is skipped, and HMR silently
        // never starts. Do the fetch + ws connect on a background thread.
        Thread {
            if (!running.get() || gen != generation.get()) return@Thread
            val manifest = runCatching {
                JSONObject(DevServerLoader.httpGetText("$normalized/rayact/manifest.json?platform=android"))
            }.getOrElse {
                Log.w(TAG, "hmr manifest fetch failed: ${it.message}")
                return@Thread
            }
            if (!running.get() || gen != generation.get()) return@Thread

            val wsUrl = manifest.optString("hmrUrl").ifBlank {
                normalized.replace("http://", "ws://").replace("https://", "wss://") + "/rayact/hmr"
            }

            Log.i(TAG, "connecting hmr ws=$wsUrl gen=$gen")
            val request = Request.Builder().url(wsUrl).build()
            webSocket = client.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    Log.i(TAG, "hmr ws connected gen=$gen")
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    if (!running.get() || gen != generation.get()) return
                    handleMessage(normalized, engineSession, text)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.w(TAG, "hmr ws failure: ${t.message}")
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    Log.i(TAG, "hmr ws closed code=$code reason=$reason")
                }
            })
        }.start()
    }

    fun stop() {
        running.set(false)
        generation.incrementAndGet()
        webSocket?.close(1000, "stop")
        webSocket = null
        session = null
        baseUrl = null
    }

    private fun handleMessage(base: String, engineSession: RayactEngineSession, raw: String) {
        val message = runCatching { JSONObject(raw) }.getOrNull() ?: return
        when (message.optString("type")) {
            "update" -> {
                val updates = message.optJSONArray("updates") ?: return
                for (i in 0 until updates.length()) {
                    val update = updates.optJSONObject(i) ?: continue
                    if (update.optString("type") != "js-update") continue
                    val path = update.optString("path")
                    if (path.isBlank()) continue
                    val timestamp = update.optLong("timestamp", 0L)
                    applyModuleUpdate(base, engineSession, path, timestamp)
                }
            }
            "full-reload", "reload" -> {
                Log.i(TAG, "full-reload requested")
                DevClientBridge.reloadCurrentProject()
            }
        }
    }

    private fun applyModuleUpdate(base: String, engineSession: RayactEngineSession, path: String, timestamp: Long) {
        val query = if (timestamp > 0L) "?t=$timestamp&platform=android" else "?platform=android"
        val moduleUrl = "$base/rayact/m$path$query"
        try {
            val source = DevServerLoader.httpGetText(moduleUrl)
            val ok = engineSession.applyModuleUpdate(path, source)
            Log.i(TAG, "module update path=$path ok=$ok bytes=${source.length}")
        } catch (e: Exception) {
            Log.e(TAG, "module update failed path=$path", e)
        }
    }
}
