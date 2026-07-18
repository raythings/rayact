package com.rayact.devclient

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.app.Activity
import android.net.Uri
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import android.os.Debug
import android.os.SystemClock
import java.io.RandomAccessFile
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.rayact.app.BuildConfig
import com.rayact.engine.RayactEngineSession
import org.json.JSONArray
import org.json.JSONObject

object DevClientBridge {
    private const val TAG = "DevClientBridge"
    private const val PREFS = "rayact_dev_client"
    private const val KEY_URL = "dev_server_url"
    private const val KEY_RECENT = "recent_urls"
    private const val KEY_DEVTOOLS_ENABLED = "devtools_enabled"
    private const val SERVICE_TYPE = "_rayact._tcp."
    const val EXTRA_DEV_SERVER_URL = "RAYACT_DEV_SERVER"

    private var prefs: SharedPreferences? = null
    private var appContext: Context? = null
    @Volatile private var activeActivity: Activity? = null
    @Volatile private var activeSession: RayactEngineSession? = null
    @Volatile private var launcherSession: RayactEngineSession? = null
    @Volatile private var devHostActivity: Activity? = null
    @Volatile private var openProjectCallback: ((String) -> Unit)? = null
    @Volatile private var reloadProjectCallback: (() -> Unit)? = null
    @Volatile private var showLauncherCallback: (() -> Unit)? = null
    @Volatile private var projectDevtoolsSession: RayactEngineSession? = null
    @Volatile private var projectDevtoolsUrl = ""
    @Volatile private var projectBundleFormat = "js"
    private var nsdManager: NsdManager? = null

    private val discovered = mutableMapOf<String, JSONObject>()
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    @Volatile private var discoveryGeneration = 0
    private var lastCpuTicks = -1L
    private var lastCpuWallMs = -1L

    fun init(context: Context, session: RayactEngineSession? = null) {
        appContext = context.applicationContext
        if (session != null) launcherSession = session
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    }

    fun bundledNativeModuleNames(): Set<String> {
        val context = appContext ?: return emptySet()
        return runCatching {
            val text = context.assets.open("runtime/native-modules.json")
                .bufferedReader().use { it.readText() }
            val modules = JSONObject(text).optJSONArray("nativeModules") ?: JSONArray()
            buildSet {
                for (index in 0 until modules.length()) {
                    val item = modules.optJSONObject(index) ?: continue
                    item.optString("name").takeIf { it.isNotBlank() }?.let(::add)
                }
            }
        }.getOrElse {
            Log.w(TAG, "Unable to read bundled native module manifest", it)
            emptySet()
        }
    }

    fun registerDevHost(
        activity: Activity,
        openProject: (String) -> Unit,
        reloadProject: () -> Unit,
        showLauncher: () -> Unit
    ) {
        devHostActivity = activity
        openProjectCallback = openProject
        reloadProjectCallback = reloadProject
        showLauncherCallback = showLauncher
    }

    fun clearDevHost(activity: Activity) {
        if (devHostActivity === activity) {
            devHostActivity = null
            openProjectCallback = null
            reloadProjectCallback = null
            showLauncherCallback = null
        }
    }

    fun showLauncher() {
        val cb = showLauncherCallback
        if (cb != null) {
            devHostActivity?.runOnUiThread { cb() }
        } else {
            Log.w(TAG, "showLauncher: no dev host registered")
        }
    }

    /** Returns true when finishActivity should return to launcher instead of finishing the activity. */
    fun tryShowLauncherFromFinishActivity(): Boolean {
        if (showLauncherCallback == null) return false
        val launcher = launcherSession ?: return false
        val active = activeSession ?: return false
        if (active === launcher) return false
        showLauncher()
        return true
    }

    fun reloadCurrentProject() {
        val cb = reloadProjectCallback
        if (cb != null) {
            devHostActivity?.runOnUiThread { cb() }
        } else {
            Log.w(TAG, "reloadCurrentProject: no dev host registered")
        }
    }

    fun openProjectFromNative(url: String) {
        val cleaned = cleanUrl(url)
        if (cleaned.isEmpty()) return
        stopDiscovery()
        prefs?.edit()?.putString(KEY_URL, cleaned)?.apply()
        addRecent(cleaned)
        val cb = openProjectCallback
        if (cb != null) {
            devHostActivity?.runOnUiThread { cb(cleaned) }
        } else {
            Log.w(TAG, "openProjectFromNative: no dev host registered url=$cleaned")
        }
    }

    private fun validateAndOpenProject(url: String): JSONObject {
        val cleaned = DevServerLoader.normalizeBase(cleanUrl(url))
        if (cleaned.isEmpty() || !DevServerLoader.probeManifest(cleaned)) {
            return JSONObject()
                .put("ok", false)
                .put("error", "Invalid server URL")
        }
        openProjectFromNative(cleaned)
        return JSONObject()
            .put("ok", true)
            .put("url", cleaned)
    }

    fun attach(activity: Activity, session: RayactEngineSession) {
        activeActivity = activity
        activeSession = session
    }

    fun detach(activity: Activity, session: RayactEngineSession? = null) {
        if (activeActivity === activity) activeActivity = null
        if (session != null) {
            if (activeSession === session) activeSession = null
            if (launcherSession === session) launcherSession = null
            if (projectDevtoolsSession === session) {
                projectDevtoolsSession = null
                projectDevtoolsUrl = ""
                projectBundleFormat = "js"
            }
        }
    }

    fun configureProjectDevTools(session: RayactEngineSession, serverUrl: String, bundleFormat: String) {
        projectDevtoolsSession = session
        projectDevtoolsUrl = serverUrl
        projectBundleFormat = bundleFormat
        if (bundleFormat == "qjsbc") {
            session.disableDevtools()
        } else if (prefs?.getBoolean(KEY_DEVTOOLS_ENABLED, true) != false) {
            session.enableDevtools(serverUrl, "Rayact: $serverUrl")
        } else {
            session.disableDevtools()
        }
    }

    private fun devToolsState(): String {
        val forcedOff = projectBundleFormat == "qjsbc"
        return JSONObject()
            .put("enabled", !forcedOff && projectDevtoolsSession?.isDevtoolsEnabled() == true)
            .put("forcedOff", forcedOff)
            .put("bundleFormat", projectBundleFormat)
            .put("reason", if (forcedOff) "Rayact DevTools are disabled for bytecode projects to preserve performance." else "")
            .toString()
    }

    private fun liveActivity(): Activity? =
        activeActivity?.takeIf { !it.isFinishing && !it.isDestroyed }

    fun savedDevServerUrl(): String? = prefs?.getString(KEY_URL, null)?.let(::cleanUrl)

    private fun cleanUrl(url: String): String = url.replace("\\/", "/").trim()

    fun handle(method: String, data: JSONObject?): Any? {
        return when (method) {
            "setDevServerUrl" -> {
                val url = data?.optString("url")?.let(::cleanUrl) ?: return null
                Log.i(TAG, "setDevServerUrl url=$url")
                prefs?.edit()?.putString(KEY_URL, url)?.apply()
                addRecent(url)
                null
            }
            "toggleDevMenu" -> {
                (activeSession ?: launcherSession)?.takeIf { it.isAlive() }?.nativeToggleDevMenu()
                null
            }
            "getDevServerUrl" -> savedDevServerUrl() ?: ""
            "getRecentEntries" -> getRecentEntries()
            "removeRecentUrl" -> {
                val url = data?.optString("url") ?: return null
                val recent = getRecentList().filter { it != url }
                prefs?.edit()?.putString(KEY_RECENT, JSONArray(recent).toString())?.apply()
                null
            }
            "getDiscoveredServers" -> synchronized(discovered) {
                JSONArray(discovered.values.toList()).toString()
            }
            "startDiscovery" -> { startDiscovery(); null }
            "stopDiscovery" -> { stopDiscovery(); null }
            "openProjectDirect" -> {
                val url = data?.optString("url")?.let(::cleanUrl).orEmpty()
                if (url.isNotEmpty()) {
                    val manifestValidated = data?.optBoolean("manifestValidated", false) == true
                    Log.i(TAG, "openProjectDirect url=$url manifestValidated=$manifestValidated")
                    if (manifestValidated) {
                        val cleaned = DevServerLoader.normalizeBase(url)
                        openProjectFromNative(cleaned)
                        JSONObject().put("ok", true).put("url", cleaned)
                    } else {
                        validateAndOpenProject(url)
                    }
                } else {
                    JSONObject()
                        .put("ok", false)
                        .put("error", "Invalid server URL")
                }
            }
            "reloadWithProjectBundle" -> {
                val url = prefs?.getString(KEY_URL, null)
                if (!url.isNullOrEmpty()) {
                    Log.i(TAG, "reloadWithProjectBundle url=$url")
                    reloadCurrentProject()
                }
                null
            }
            "returnToLauncher" -> { showLauncher(); null }
            "getAppInfo" -> getAppInfo()
            "openExternalUrl" -> {
                val raw = data?.optString("url").orEmpty().trim()
                val uri = runCatching { Uri.parse(raw) }.getOrNull()
                val allowed = uri?.scheme?.lowercase() in setOf("http", "https", "mailto")
                val activity = liveActivity()
                if (!allowed || activity == null) false else {
                    activity.runOnUiThread {
                        runCatching {
                            activity.startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
                        }.onFailure { Log.w(TAG, "Unable to open external URL", it) }
                    }
                    true
                }
            }
            "getPerformanceMetrics" -> getPerformanceMetrics()
            "setPerformanceSampling" -> {
                DisplayPerfSampler.setActive(liveActivity(), data?.optBoolean("active") == true)
                null
            }
            "getDevToolsState" -> devToolsState()
            "setDevToolsEnabled" -> {
                val requested = data?.optBoolean("enabled") == true
                if (projectBundleFormat != "qjsbc") {
                    prefs?.edit()?.putBoolean(KEY_DEVTOOLS_ENABLED, requested)?.apply()
                    projectDevtoolsSession?.takeIf { it.isAlive() }?.let { session ->
                        if (requested) session.enableDevtools(projectDevtoolsUrl, "Rayact: $projectDevtoolsUrl")
                        else session.disableDevtools()
                    }
                }
                devToolsState()
            }
            "getConnectError" -> DevServerLoader.lastError ?: ""
            "isConnectLoading" -> DevServerLoader.loading
            "scanQR" -> { startQrScan(); null }
            else -> null
        }
    }

    private fun getAppInfo(): String {
        val ctx = appContext
        return JSONObject()
            .put("bundleId", ctx?.packageName ?: "com.rayact.app")
            .put("nativeAppVersion", BuildConfig.VERSION_NAME ?: "0.0.3")
            .put("rayactVersion", "0.0.3")
            .toString()
    }

    @Synchronized
    private fun getPerformanceMetrics(): String {
        val now = SystemClock.elapsedRealtime()
        val ticks = readProcessCpuTicks()
        val cpu = if (ticks == null || lastCpuTicks < 0 || lastCpuWallMs < 0) {
            0.0
        } else {
            val tickDelta = (ticks - lastCpuTicks).coerceAtLeast(0)
            val wallSeconds = (now - lastCpuWallMs).coerceAtLeast(1) / 1000.0
            val cores = Runtime.getRuntime().availableProcessors().coerceAtLeast(1)
            // Linux/Android USER_HZ is 100 for /proc stat accounting.
            (tickDelta / 100.0 / wallSeconds / cores * 100.0).coerceIn(0.0, 100.0)
        }
        if (ticks != null) lastCpuTicks = ticks
        lastCpuWallMs = now
        val memoryMb = Debug.getPss().toDouble() / 1024.0
        val json = JSONObject().put("cpuPercent", cpu).put("memoryMb", memoryMb)
            .put("gpuBackend", "Vulkan")
        // rlvk (Vulkan) reports -1 until the first frame's timestamp query
        // pair completes, or if the device/driver doesn't support timestamp
        // queries at all — omit the field rather than report a bogus value,
        // so the JS side's "unavailable" reason is shown instead of "0ms".
        (activeSession ?: launcherSession)?.let { session ->
            val gpuMs = session.nativeGetGpuFrameTimeMs()
            if (gpuMs >= 0.0) json.put("gpuFrameTimeMs", gpuMs)
            val deviceName = session.nativeGetGpuDeviceName()
            if (deviceName.isNotEmpty()) json.put("gpuDeviceName", deviceName)
        }
        return json.also(DisplayPerfSampler::appendTo).toString()
    }

    private fun readProcessCpuTicks(): Long? = try {
        RandomAccessFile("/proc/self/stat", "r").use { file ->
            val line = file.readLine() ?: return null
            val tail = line.substring(line.lastIndexOf(')') + 1).trim().split(' ')
            if (tail.size < 13) null else tail[11].toLong() + tail[12].toLong()
        }
    } catch (_: Throwable) { null }

    private fun getRecentList(): List<String> {
        val raw = prefs?.getString(KEY_RECENT, "[]") ?: "[]"
        val arr = runCatching { JSONArray(raw) }.getOrElse {
            prefs?.edit()?.remove(KEY_RECENT)?.apply()
            JSONArray()
        }
        return (0 until arr.length()).map { cleanUrl(arr.getString(it)) }.distinct()
    }

    private fun getRecentEntries(): String {
        val arr = JSONArray()
        for (url in getRecentList()) {
            arr.put(JSONObject().put("url", url))
        }
        return arr.toString()
    }

    private fun addRecent(url: String) {
        val list = getRecentList().filter { it != url }.toMutableList()
        list.add(0, url)
        while (list.size > 10) list.removeAt(list.lastIndex)
        prefs?.edit()?.putString(KEY_RECENT, JSONArray(list).toString())?.apply()
    }

    private fun startDiscovery() {
        stopDiscovery()
        val generation = ++discoveryGeneration
        synchronized(discovered) { discovered.clear() }
        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onServiceFound(service: NsdServiceInfo) {
                if (generation != discoveryGeneration) return
                nsdManager?.resolveService(service, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(si: NsdServiceInfo, code: Int) {}
                    override fun onServiceResolved(si: NsdServiceInfo) {
                        if (generation != discoveryGeneration) return
                        val host = si.host ?: return
                        if (host is java.net.Inet6Address) return
                        val addr = host.hostAddress ?: return
                        val entry = JSONObject()
                            .put("url", "http://$addr:${si.port}")
                            .put("name", si.serviceName)
                            .put("appKey", si.attributes["appKey"]?.let { String(it) } ?: "")
                        synchronized(discovered) { discovered[si.serviceName] = entry }
                        DevServerLoader.prefetch(entry.getString("url"))
                    }
                })
            }
            override fun onServiceLost(service: NsdServiceInfo) {
                if (generation != discoveryGeneration) return
                synchronized(discovered) { discovered.remove(service.serviceName) }
            }
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, code: Int) {}
            override fun onStopDiscoveryFailed(serviceType: String, code: Int) {}
        }
        nsdManager?.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
    }

    private fun stopDiscovery() {
        discoveryGeneration++
        discoveryListener?.let { listener ->
            runCatching { nsdManager?.stopServiceDiscovery(listener) }
        }
        discoveryListener = null
    }

    private fun startQrScan() {
        val activity = liveActivity()
        if (activity == null) {
            Log.w(TAG, "scanQR: no live activity")
            return
        }
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        activity.runOnUiThread {
            GmsBarcodeScanning.getClient(activity, options).startScan()
                .addOnSuccessListener { code ->
                    val raw = code.rawValue.orEmpty()
                    if (raw.isEmpty()) {
                        Log.w(TAG, "scanQR: empty rawValue")
                        return@addOnSuccessListener
                    }
                    Thread {
                        val candidates = parseQrCandidates(raw)
                        val best = pickBestServer(candidates) ?: candidates.firstOrNull()
                        if (best == null) {
                            Log.w(TAG, "scanQR: no candidates in '$raw'")
                            return@Thread
                        }
                        Log.i(TAG, "scanQR chose $best from $candidates")
                        openProjectFromNative(best)
                    }.start()
                }
                .addOnCanceledListener { Log.i(TAG, "scanQR canceled") }
                .addOnFailureListener { e -> Log.e(TAG, "scanQR failed", e) }
        }
    }

    private fun parseQrCandidates(raw: String): List<String> {
        val trimmed = raw.trim().replace("\\/", "/")
        if (trimmed.startsWith("[")) {
            runCatching {
                val arr = JSONArray(trimmed)
                val out = ArrayList<String>(arr.length())
                for (i in 0 until arr.length()) {
                    val s = arr.optString(i).trim()
                    if (s.isNotEmpty()) out.add(DevServerLoader.normalizeBase(s))
                }
                if (out.isNotEmpty()) return out.distinct()
            }
        }
        return listOf(DevServerLoader.normalizeBase(trimmed))
    }

    private fun pickBestServer(candidates: List<String>): String? {
        if (candidates.size <= 1) {
            val only = candidates.firstOrNull() ?: return null
            return if (DevServerLoader.probeManifest(only)) only else null
        }
        val pool = java.util.concurrent.Executors.newFixedThreadPool(candidates.size)
        try {
            val ecs = java.util.concurrent.ExecutorCompletionService<String?>(pool)
            for (c in candidates) ecs.submit { if (DevServerLoader.probeManifest(c)) c else null }
            repeat(candidates.size) {
                val winner = runCatching { ecs.take().get() }.getOrNull()
                if (winner != null) return winner
            }
            return null
        } finally {
            pool.shutdownNow()
        }
    }
}

fun devCallFromNative(method: String, dataJson: String?): String {
    val data = dataJson?.takeIf { it.isNotEmpty() }?.let { raw ->
        runCatching { JSONObject(raw) }.getOrNull()
    }
    return when (val result = DevClientBridge.handle(method, data)) {
        null -> "null"
        is String -> if (result.startsWith("[") || result.startsWith("{")) result else JSONObject.quote(result)
        else -> JSONObject.wrap(result)?.toString() ?: "null"
    }
}
