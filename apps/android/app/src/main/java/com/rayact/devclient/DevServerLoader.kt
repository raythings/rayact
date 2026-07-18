package com.rayact.devclient

import android.os.StrictMode
import android.util.Log
import com.rayact.engine.RayactEngineSession
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import android.os.Handler
import android.os.Looper

object DevServerLoader {
    private const val TAG = "DevServerLoader"
    private const val PLATFORM_QUERY = "platform=android"
    private const val MAX_PREFETCH_ASSET_BYTES = 4 * 1024 * 1024L
    private const val MAX_PREFETCH_TOTAL_BYTES = 16 * 1024 * 1024L
    private const val MAX_PREFETCH_ASSETS = 32
    private val executor = Executors.newSingleThreadExecutor()
    private val prefetchExecutor = Executors.newFixedThreadPool(2)
    @Volatile private var activeModuleBaseUrl: String? = null

    private data class WarmBootstrap(val payload: BundlePayload, val revision: Long)
    private val warmBootstraps = ConcurrentHashMap<String, WarmBootstrap>()
    private val prefetchedResources = ConcurrentHashMap<String, ByteArray>()
    private val warming = ConcurrentHashMap.newKeySet<String>()

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
        val effectiveUrl = rebaseRayactUrl(url)
        val previous = StrictMode.getThreadPolicy()
        StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder(previous).permitAll().build())
        val startedAt = android.os.SystemClock.elapsedRealtime()
        Log.i(TAG, "module.fetch.start $effectiveUrl")
        return try {
            (takePrefetchedResource(effectiveUrl)?.toString(Charsets.UTF_8) ?: httpGetText(effectiveUrl))
                .also { Log.i(TAG, "module.fetch.end ${android.os.SystemClock.elapsedRealtime() - startedAt}ms $effectiveUrl") }
        } catch (error: Exception) {
            Log.e(TAG, "module.fetch.failed ${android.os.SystemClock.elapsedRealtime() - startedAt}ms $effectiveUrl", error)
            throw error
        } finally {
            StrictMode.setThreadPolicy(previous)
        }
    }

    @JvmStatic
    fun devFetchBytesFromNative(url: String): ByteArray {
        val effectiveUrl = rebaseRayactUrl(url)
        val previous = StrictMode.getThreadPolicy()
        StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder(previous).permitAll().build())
        return try {
            takePrefetchedResource(effectiveUrl) ?: httpGetBytes(effectiveUrl)
        } catch (_: Exception) {
            ByteArray(0)
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
        for (candidate in connectionCandidates(normalizeBase(baseUrl))) {
            val url = "$candidate/rayact/manifest.json?$PLATFORM_QUERY"
            try {
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = timeoutMs
                    readTimeout = timeoutMs
                    instanceFollowRedirects = true
                    requestMethod = "GET"
                }
                try {
                    if (conn.responseCode !in 200..299) continue
                    JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                    return true
                } finally {
                    conn.disconnect()
                }
            } catch (_: Exception) {
                // Try the LAN address after the ADB-reversed loopback route.
            }
        }
        return false
    }

    fun fetchManifest(baseUrl: String): JSONObject {
        return JSONObject(httpGetText("${normalizeBase(baseUrl)}/rayact/manifest.json?$PLATFORM_QUERY"))
    }

    private fun requireCompatibleModules(manifest: JSONObject) {
        val bundled = DevClientBridge.bundledNativeModuleNames()
        val required = manifest.optJSONArray("nativeModules") ?: return
        val missing = mutableListOf<String>()
        for (index in 0 until required.length()) {
            val item = required.optJSONObject(index) ?: continue
            val name = item.optString("name")
            if (name.isNotBlank() && name !in bundled) missing.add(name)
        }
        if (missing.isNotEmpty()) {
            throw IllegalStateException(
                "Incompatible server: missing bundled native modules: ${missing.distinct().joinToString(", ")}"
            )
        }
    }

    fun fetchBootstrap(baseUrl: String): BundlePayload {
        val normalized = normalizeBase(baseUrl)
        var lastError: Exception? = null
        for (candidate in connectionCandidates(normalized)) {
            try {
                activeModuleBaseUrl = candidate
                val manifest = fetchManifest(candidate)
                requireCompatibleModules(manifest)
                val hmrMode = manifest.optString("hmrMode", "module")
                val bundleFormat = manifest.optString("bundleFormat", "js")
                val revision = manifest.optLong("revision", -1L)
                val warm = takeWarmBootstrap(normalized, candidate, revision)
                val payload = if (warm != null) {
                    Log.i(TAG, "using prefetched dev bootstrap for $candidate")
                    warm
                } else {
                    val path = bundlePath(bundleFormat, hmrMode)
                    BundlePayload(candidate, bundleFormat, httpGetBytes("$candidate$path?$PLATFORM_QUERY"), hmrMode)
                }
                if (candidate != normalized) {
                    Log.i(TAG, "using adb-reversed dev server $candidate instead of $normalized")
                }
                return payload
            } catch (error: Exception) {
                lastError = error
                Log.i(TAG, "dev server candidate unavailable: $candidate (${error.message})")
            }
        }
        activeModuleBaseUrl = normalized
        throw lastError ?: IllegalStateException("Failed to load dev server")
    }

    /**
     * Warm the files needed before the first project frame as soon as mDNS
     * resolves a server. Bootstrap reuse is guarded by the manifest revision;
     * module and asset entries are consumed once so HMR can never observe a
     * stale discovery-time response later in the session.
     */
    fun prefetch(baseUrl: String) {
        val normalized = normalizeBase(baseUrl)
        if (warmBootstraps.containsKey(normalized)) return
        if (!warming.add(normalized)) return
        prefetchExecutor.execute {
            try {
                for (candidate in connectionCandidates(normalized)) {
                    try {
                        val manifest = fetchManifest(candidate)
                        requireCompatibleModules(manifest)
                        val hmrMode = manifest.optString("hmrMode", "module")
                        val bundleFormat = manifest.optString("bundleFormat", "js")
                        val path = bundlePath(bundleFormat, hmrMode)
                        val payload = BundlePayload(
                            candidate,
                            bundleFormat,
                            httpGetBytes("$candidate$path?$PLATFORM_QUERY"),
                            hmrMode
                        )
                        val warm = WarmBootstrap(payload, manifest.optLong("revision", -1L))
                        warmBootstraps[normalized] = warm
                        warmBootstraps[candidate] = warm
                        val resourceCount = prefetchInitialResources(candidate, manifest)
                        Log.i(TAG, "prefetched bootstrap + $resourceCount startup resources from $candidate")
                        return@execute
                    } catch (error: Exception) {
                        Log.i(TAG, "prefetch candidate unavailable: $candidate (${error.message})")
                    }
                }
            } finally {
                warming.remove(normalized)
            }
        }
    }

    private fun bundlePath(bundleFormat: String, hmrMode: String): String = when {
        bundleFormat == "qjsbc" -> "/rayact/bundle.qjsbc"
        hmrMode == "module" -> "/rayact/bootstrap.js"
        else -> "/rayact/bundle"
    }

    private fun takeWarmBootstrap(normalized: String, candidate: String, revision: Long): BundlePayload? {
        for (key in listOf(candidate, normalized).distinct()) {
            val warm = warmBootstraps.remove(key) ?: continue
            if (warm.revision == revision) {
                warmBootstraps.entries.removeIf { it.value === warm }
                return warm.payload
            }
        }
        return null
    }

    private fun prefetchInitialResources(baseUrl: String, manifest: JSONObject): Int {
        val urls = ArrayList<Pair<String, Long>>()
        manifest.optString("entryModuleUrl").takeIf { it.isNotBlank() }?.let { urls.add(it to 0L) }
        val assets = manifest.optJSONArray("assets")
        if (assets != null) {
            for (index in 0 until minOf(assets.length(), MAX_PREFETCH_ASSETS)) {
                val asset = assets.optJSONObject(index) ?: continue
                val size = asset.optLong("size", 0L)
                if (size in 0..MAX_PREFETCH_ASSET_BYTES) {
                    asset.optString("url").takeIf { it.isNotBlank() }?.let { urls.add(it to size) }
                }
            }
        }
        var total = 0L
        var count = 0
        for ((advertisedUrl, declaredSize) in urls) {
            if (declaredSize > 0 && total + declaredSize > MAX_PREFETCH_TOTAL_BYTES) continue
            val url = rebaseToBase(advertisedUrl, baseUrl)
            try {
                val bytes = httpGetBytes(url)
                if (total + bytes.size > MAX_PREFETCH_TOTAL_BYTES) continue
                prefetchedResources[url] = bytes
                total += bytes.size
                count++
            } catch (error: Exception) {
                Log.i(TAG, "startup resource prefetch unavailable: $url (${error.message})")
            }
        }
        return count
    }

    private fun takePrefetchedResource(url: String): ByteArray? = prefetchedResources.remove(url)

    private fun rebaseToBase(url: String, baseUrl: String): String = runCatching {
        val requested = URL(url)
        if (!requested.path.startsWith("/rayact/")) return@runCatching url
        val selected = URL(baseUrl)
        URL(selected.protocol, selected.host, selected.port, requested.file).toString()
    }.getOrDefault(url)

    /** @deprecated Use [fetchBootstrap] for module HMR dev servers. */
    fun fetchBundle(baseUrl: String): BundlePayload = fetchBootstrap(baseUrl)

    private fun rebaseRayactUrl(url: String): String {
        val base = activeModuleBaseUrl ?: return url
        return runCatching {
            val requested = URL(url)
            if (!requested.path.startsWith("/rayact/")) return@runCatching url
            val selected = URL(base)
            URL(selected.protocol, selected.host, selected.port, requested.file).toString()
        }.getOrDefault(url)
    }

    /**
     * `rayact dev` configures adb reverse for the HTTP port. Prefer that USB
     * route on Android: a discovered LAN address can become unreachable when
     * the phone changes Wi-Fi/VPN state, otherwise leaving the project pane on
     * its neutral background until the long network timeout expires. The LAN
     * URL remains the fallback for devices that are not connected over ADB.
     */
    private fun connectionCandidates(baseUrl: String): List<String> {
        val normalized = normalizeBase(baseUrl)
        val loopback = runCatching {
            val parsed = URL(normalized)
            if (!parsed.protocol.equals("http", ignoreCase = true)) return@runCatching null
            if (parsed.host.equals("localhost", ignoreCase = true) ||
                parsed.host == "127.0.0.1" || parsed.host == "::1") return@runCatching null
            val port = if (parsed.port >= 0) parsed.port else parsed.defaultPort
            URL(parsed.protocol, "127.0.0.1", port, parsed.file).toString().trimEnd('/')
        }.getOrNull()
        return if (loopback.isNullOrEmpty() || loopback == normalized) {
            listOf(normalized)
        } else {
            listOf(loopback, normalized)
        }
    }

    fun httpGetText(url: String): String {
        val conn = open(url)
        return try {
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun httpGetBytes(url: String): ByteArray {
        val conn = open(url)
        return try {
            conn.inputStream.use { input ->
                val out = ByteArrayOutputStream()
                input.copyTo(out)
                out.toByteArray()
            }
        } finally {
            conn.disconnect()
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
