package com.rayact.engine

import android.os.StrictMode
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.io.ByteArrayOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

object RayactMobileNetwork {
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    // Separate client for JS `fetch()`: bounded timeouts (unlike the WebSocket
    // client's infinite read) and, crucially, all requests run on OkHttp's
    // dispatcher threads — never on the render/JS thread. The old synchronous
    // fetchTextFromNative/fetchBytesFromNative shims blocked the render thread
    // for up to the connect timeout, which froze the dev launcher whenever it
    // probed unreachable recent servers.
    private val fetchClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .callTimeout(15, TimeUnit.SECONDS)
        .build()
    private val nextSocketId = AtomicInteger(1)
    private data class SocketRecord(val owner: Long, val socket: WebSocket)
    private val sockets = ConcurrentHashMap<Int, SocketRecord>()
    private val events = ConcurrentHashMap<Long, ConcurrentLinkedQueue<String>>()

    @JvmStatic
    fun fetchTextFromNative(url: String): String {
        val previous = StrictMode.getThreadPolicy()
        StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder(previous).permitAll().build())
        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 60_000
                instanceFollowRedirects = true
                requestMethod = "GET"
            }
            try {
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            ""
        } finally {
            StrictMode.setThreadPolicy(previous)
        }
    }

    @JvmStatic
    fun fetchBytesFromNative(url: String): ByteArray {
        val previous = StrictMode.getThreadPolicy()
        StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder(previous).permitAll().build())
        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 60_000
                instanceFollowRedirects = true
                requestMethod = "GET"
            }
            try {
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                stream?.use { input ->
                    val out = ByteArrayOutputStream()
                    input.copyTo(out)
                    out.toByteArray()
                } ?: ByteArray(0)
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            ByteArray(0)
        } finally {
            StrictMode.setThreadPolicy(previous)
        }
    }

    // Asynchronous fetch backing the JS `fetch()` polyfill. Returns immediately;
    // the response (or error) is delivered later via the per-owner event queue
    // and drained on the render thread, exactly like WebSocket events. Never
    // touches the render/JS thread with network I/O.
    @JvmStatic
    fun fetchStart(owner: Long, requestId: Int, url: String) {
        fetchCandidate(owner, requestId, devServerFetchCandidates(url), 0)
    }

    private fun fetchCandidate(owner: Long, requestId: Int, candidates: List<String>, index: Int) {
        val url = candidates[index]
        val request = try {
            Request.Builder().url(url).build()
        } catch (e: Exception) {
            enqueueFetch(owner, requestId, 0, "", e.message ?: "Invalid URL")
            return
        }
        fetchClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (index + 1 < candidates.size) {
                    fetchCandidate(owner, requestId, candidates, index + 1)
                    return
                }
                enqueueFetch(owner, requestId, 0, "", e.message ?: "Network request failed")
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val responseBody = it.body
                    val mimeType = responseBody?.contentType()?.toString().orEmpty()
                    val bytes = responseBody?.bytes() ?: ByteArray(0)
                    // Map each byte to a char 0..255 so the body round-trips
                    // through JSON unchanged; the JS side rebuilds the exact byte
                    // array via charCodeAt & 0xff (and UTF-8-decodes for text()).
                    val sb = StringBuilder(bytes.size)
                    for (b in bytes) sb.append((b.toInt() and 0xff).toChar())
                    enqueueFetch(
                        owner, requestId, it.code, sb.toString(), "",
                        it.message, headersJson(it), mimeType, it.protocol.toString()
                    )
                }
            }
        })
    }

    /** Prefer the adb-reversed route for Rayact endpoints, with LAN fallback. */
    private fun devServerFetchCandidates(rawUrl: String): List<String> {
        val loopback = runCatching {
            val parsed = URL(rawUrl)
            if (!parsed.protocol.equals("http", ignoreCase = true) ||
                !parsed.path.startsWith("/rayact/") ||
                parsed.host.equals("localhost", ignoreCase = true) ||
                parsed.host == "127.0.0.1" || parsed.host == "::1") {
                return@runCatching null
            }
            val port = if (parsed.port >= 0) parsed.port else parsed.defaultPort
            URL(parsed.protocol, "127.0.0.1", port, parsed.file).toString()
        }.getOrNull()
        return if (loopback.isNullOrEmpty() || loopback == rawUrl) listOf(rawUrl)
        else listOf(loopback, rawUrl)
    }

    private fun enqueueFetch(
        owner: Long,
        requestId: Int,
        status: Int,
        body: String,
        error: String,
        statusText: String = "",
        headers: JSONObject = JSONObject(),
        mimeType: String = "",
        protocol: String = ""
    ) {
        val obj = JSONObject()
            .put("type", "fetch")
            .put("req", requestId)
            .put("status", status)
            .put("body", body)
            .put("statusText", statusText)
            .put("headers", headers)
            .put("mimeType", mimeType)
            .put("protocol", protocol)
        if (error.isNotEmpty()) obj.put("error", error)
        events.computeIfAbsent(owner) { ConcurrentLinkedQueue() }.add(obj.toString())
        wakeRenderFrame(owner)
    }

    @JvmStatic
    fun wsOpen(owner: Long, url: String): Int {
        val id = nextSocketId.getAndIncrement()
        val request = Request.Builder().url(url).build()
        val socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                enqueue(owner, id, "open") {
                    put("status", response.code)
                    put("statusText", response.message)
                    put("headers", headersJson(response))
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                enqueue(owner, id, "message") { put("data", text) }
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                enqueue(owner, id, "message") {
                    put("data", bytes.base64())
                    put("binary", true)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                enqueue(owner, id, "close") {
                    put("code", code)
                    put("reason", reason)
                }
                sockets.remove(id)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                enqueue(owner, id, "close") {
                    put("code", code)
                    put("reason", reason)
                }
                sockets.remove(id)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                enqueue(owner, id, "error") { put("message", t.message ?: "WebSocket failure") }
                sockets.remove(id)
            }
        })
        sockets[id] = SocketRecord(owner, socket)
        return id
    }

    @JvmStatic
    fun wsSend(owner: Long, id: Int, data: String): Boolean = sockets[id]?.takeIf { it.owner == owner }?.socket?.send(data) == true

    @JvmStatic
    fun wsClose(owner: Long, id: Int, code: Int, reason: String): Boolean {
        val record = sockets[id]?.takeIf { it.owner == owner } ?: return false
        sockets.remove(id, record)
        return record.socket.close(code, reason)
    }

    @JvmStatic
    fun wsPollEvents(owner: Long): String {
        val arr = JSONArray()
        val queue = events[owner] ?: return arr.toString()
        while (true) {
            val ev = queue.poll() ?: break
            arr.put(JSONObject(ev))
        }
        return arr.toString()
    }

    // Wake the render loop from this OkHttp callback thread so an idle app
    // schedules a frame to drain the event (drained per-frame via
    // __rayactNativeNetworkDrain). Without this, incoming WebSocket messages —
    // including Chrome DevTools (CDP) traffic over /rayact/debugger — would only
    // be delivered on the next unrelated frame (up to the ~5s poll interval).
    @JvmStatic external fun nativeWakeRenderFrame(owner: Long)

    private fun wakeRenderFrame(owner: Long) {
        try {
            nativeWakeRenderFrame(owner)
        } catch (_: UnsatisfiedLinkError) {
            // Native engine not loaded yet; the periodic frame will still drain.
        }
    }

    private inline fun enqueue(owner: Long, id: Int, type: String, block: JSONObject.() -> Unit = {}) {
        val obj = JSONObject()
            .put("id", id)
            .put("type", type)
        obj.block()
        events.computeIfAbsent(owner) { ConcurrentLinkedQueue() }.add(obj.toString())
        wakeRenderFrame(owner)
    }

    @JvmStatic fun closeAll(owner: Long) {
        sockets.entries.filter { it.value.owner == owner }.forEach { (id, record) ->
            if (sockets.remove(id, record)) record.socket.cancel()
        }
        events.remove(owner)
    }

    private fun headersJson(response: Response): JSONObject = JSONObject().also { json ->
        for (name in response.headers.names()) {
            json.put(name, response.headers.values(name).joinToString("\n"))
        }
    }
}
