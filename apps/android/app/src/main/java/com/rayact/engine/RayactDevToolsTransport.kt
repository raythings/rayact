package com.rayact.engine

import android.os.Build
import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

internal class RayactDevToolsTransport(
    private val session: RayactEngineSession,
    serverUrl: String,
    private val title: String
) {
    private val client = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build()
    private val deviceId = UUID.randomUUID().toString()
    private val endpoint = serverUrl.replaceFirst("http://", "ws://").replaceFirst("https://", "wss://")
        .trimEnd('/') + "/rayact/devtools/device"
    @Volatile private var active = false
    @Volatile private var socket: WebSocket? = null
    @Volatile private var cdpSessionId: String? = null
    private var retryMs = 250L
    private val handler = Handler(Looper.getMainLooper())

    fun start() { active = true; connect() }

    fun stop() {
        active = false
        cdpSessionId = null
        socket?.close(1000, "Rayact session stopped")
        socket = null
        handler.removeCallbacksAndMessages(null)
        client.dispatcher.executorService.shutdown()
    }

    fun sendCdp(message: String) {
        val id = cdpSessionId ?: return
        socket?.send(JSONObject().put("event", "wrappedEvent").put("payload", JSONObject()
            .put("pageId", "main").put("sessionId", id).put("message", message)).toString())
    }
    fun sendEnvelope(message: String) { socket?.send(message) }

    private fun connect() {
        if (!active || !session.isAlive()) return
        socket = client.newWebSocket(Request.Builder().url(endpoint).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                retryMs = 250L
                val page = JSONObject().put("id", "main").put("title", title).put("vm", "QuickJS")
                val payload = JSONObject().put("protocolVersion", 1).put("deviceId", deviceId)
                    .put("deviceName", Build.MODEL ?: "Android").put("appId", "com.rayact.app")
                    .put("platform", "android").put("pages", JSONArray().put(page))
                webSocket.send(JSONObject().put("event", "hello").put("payload", payload).toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val envelope = runCatching { JSONObject(text) }.getOrNull() ?: return
                val payload = envelope.optJSONObject("payload") ?: JSONObject()
                when (envelope.optString("event")) {
                    "connect" -> cdpSessionId = payload.optString("sessionId").takeIf { it.isNotEmpty() }
                    "disconnect" -> if (payload.optString("sessionId") == cdpSessionId) cdpSessionId = null
                    "wrappedEvent" -> if (payload.optString("sessionId") == cdpSessionId) {
                        payload.optString("message").takeIf { it.isNotEmpty() }?.let(session::receiveDevtoolsMessage)
                    }
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { reconnect(webSocket) }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { reconnect(webSocket) }
        })
    }

    @Synchronized private fun reconnect(failed: WebSocket) {
        if (socket !== failed) return
        socket = null
        cdpSessionId = null
        if (!active || !session.isAlive()) return
        val delay = retryMs
        retryMs = (retryMs * 2).coerceAtMost(5_000L)
        handler.postDelayed({ connect() }, delay)
    }
}
