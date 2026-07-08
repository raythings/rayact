package com.rayact.devclient

import android.os.StrictMode
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
    private const val PLATFORM_QUERY = "platform=android"
    private val executor = Executors.newSingleThreadExecutor()

    data class BundlePayload(
        val baseUrl: String,
        val bundleFormat: String,
        val bytes: ByteArray,
        val hmrMode: String = "module"
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

    /**
     * Called synchronously from the JS engine (rayactDevFetch) on the render
     * thread while the module-HMR runtime loads modules. That thread is the
     * main thread for the surface, so the default policy throws
     * NetworkOnMainThreadException and androidDevFetch swallows it → empty
     * module source → black project pane. Blocking module loads are by design
     * here (the desktop client fetches synchronously too), so relax the network
     * policy for the duration of the dev fetch only.
     */
    @JvmStatic
    fun devFetchFromNative(url: String): String {
        val previous = StrictMode.getThreadPolicy()
        StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder(previous).permitAll().build())
        return try {
            httpGetText(url)
        } finally {
            StrictMode.setThreadPolicy(previous)
        }
    }

    fun loadAsync(baseUrl: String, session: RayactEngineSession, onSuccess: (() -> Unit)? = null) {
        val normalized = baseUrl.trimEnd('/')
        loading = true
        lastError = null
        lastSuccessUrl = null
        executor.execute {
            try {
                val payload = fetchBootstrap(normalized)
                val ok = if (payload.bundleFormat == "qjsbc") {
                    session.loadBytecode(payload.bytes)
                } else {
                    session.loadDevBootstrap(normalized, payload.bytes.toString(Charsets.UTF_8))
                }
                if (!ok) {
                    lastError = "Native engine rejected dev bundle"
                    Log.e(TAG, lastError!!)
                } else {
                    Log.i(TAG, "Queued dev bootstrap from ${payload.baseUrl} (${payload.bytes.size} bytes)")
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

    fun normalizeBase(baseUrl: String): String {
        var s = baseUrl.trim().replace("\\/", "/").trimEnd('/')
        if (!s.startsWith("http://", true) && !s.startsWith("https://", true)) s = "http://$s"
        return s
    }

    fun probeManifest(baseUrl: String, timeoutMs: Int = 2500): Boolean {
        val url = "${normalizeBase(baseUrl)}/rayact/manifest.json?$PLATFORM_QUERY"
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

    fun fetchManifest(baseUrl: String): JSONObject {
        return JSONObject(httpGetText("${normalizeBase(baseUrl)}/rayact/manifest.json?$PLATFORM_QUERY"))
    }

    fun fetchBootstrap(baseUrl: String): BundlePayload {
        val normalized = normalizeBase(baseUrl)
        val manifest = fetchManifest(normalized)
        val hmrMode = manifest.optString("hmrMode", "module")
        val bundleFormat = manifest.optString("bundleFormat", "js")
        val path = when {
            bundleFormat == "qjsbc" -> "/rayact/bundle.qjsbc"
            hmrMode == "module" -> "/rayact/bootstrap.js"
            else -> "/rayact/bundle"
        }
        val bytes = httpGetBytes("$normalized$path?$PLATFORM_QUERY")
        return BundlePayload(normalized, bundleFormat, bytes, hmrMode)
    }

    /** @deprecated Use [fetchBootstrap] for module HMR dev servers. */
    fun fetchBundle(baseUrl: String): BundlePayload = fetchBootstrap(baseUrl)

    fun httpGetText(url: String): String {
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
