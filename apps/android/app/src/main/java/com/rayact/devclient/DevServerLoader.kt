package com.rayact.devclient

import android.util.Log
import com.rayact.engine.RayactEngineSession
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import android.os.Handler
import android.os.Looper

object DevServerLoader {
    private const val TAG = "DevServerLoader"
    private val executor = Executors.newSingleThreadExecutor()

    data class BundlePayload(
        val baseUrl: String,
        val bundleFormat: String,
        val bytes: ByteArray
    )

    @Volatile
    var lastError: String? = null
        private set

    @Volatile
    var loading = false
        private set

    @Volatile
    var lastSuccessUrl: String? = null
        private set

    fun loadAsync(baseUrl: String, session: RayactEngineSession, onSuccess: (() -> Unit)? = null) {
        val normalized = baseUrl.trimEnd('/')
        loading = true
        lastError = null
        lastSuccessUrl = null
        executor.execute {
            try {
                val payload = fetchBundle(normalized)
                val ok = if (payload.bundleFormat == "qjsbc") {
                    session.loadBytecode(payload.bytes)
                } else {
                    session.loadSource(payload.bytes.toString(Charsets.UTF_8))
                }
                if (!ok) {
                    lastError = "Native engine rejected dev bundle"
                    Log.e(TAG, lastError!!)
                } else {
                    Log.i(TAG, "Queued dev bundle from ${payload.baseUrl} (${payload.bytes.size} bytes)")
                    lastSuccessUrl = payload.baseUrl
                    onSuccess?.let { Handler(Looper.getMainLooper()).post(it) }
                }
            } catch (e: Exception) {
                lastError = e.message ?: "Failed to load dev server"
                Log.e(TAG, "load failed for $normalized", e)
            } finally {
                loading = false
            }
        }
    }

    /** Ensure a scheme so java.net.URL doesn't throw "no protocol". */
    fun normalizeBase(baseUrl: String): String {
        var s = baseUrl.trim().replace("\\/", "/").trimEnd('/')
        if (!s.startsWith("http://", true) && !s.startsWith("https://", true)) s = "http://$s"
        return s
    }

    /**
     * Quick reachability + validity probe: returns true when the candidate serves
     * a parseable Rayact manifest within [timeoutMs]. Used to pick the fastest
     * reachable host from a multi-interface QR payload.
     */
    fun probeManifest(baseUrl: String, timeoutMs: Int = 2500): Boolean {
        val url = "${normalizeBase(baseUrl)}/rayact/manifest.json"
        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                instanceFollowRedirects = true
                requestMethod = "GET"
            }
            try {
                if (conn.responseCode !in 200..299) return false
                JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                true
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            false
        }
    }

    fun fetchBundle(baseUrl: String): BundlePayload {
        val normalized = normalizeBase(baseUrl)
        val manifest = JSONObject(httpGet("$normalized/rayact/manifest.json"))
        val bundleFormat = manifest.optString("bundleFormat", "js")
        val bundlePath = if (bundleFormat == "qjsbc") "/rayact/bundle.qjsbc" else "/rayact/bundle"
        val bytes = httpGetBytes("$normalized$bundlePath")
        return BundlePayload(normalized, bundleFormat, bytes)
    }

    private fun httpGet(url: String): String {
        val conn = open(url)
        return conn.inputStream.bufferedReader().use { it.readText() }
    }

    private fun httpGetBytes(url: String): ByteArray {
        val conn = open(url)
        return conn.inputStream.use { input ->
            val out = ByteArrayOutputStream()
            input.copyTo(out)
            out.toByteArray()
        }
    }

    private fun open(url: String): HttpURLConnection {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            requestMethod = "GET"
        }
        val code = conn.responseCode
        if (code !in 200..299) {
            val err = conn.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            conn.disconnect()
            throw IllegalStateException("HTTP $code from $url${if (err.isNotEmpty()) ": $err" else ""}")
        }
        return conn
    }
}
