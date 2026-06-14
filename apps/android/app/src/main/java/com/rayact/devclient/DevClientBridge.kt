package com.rayact.devclient

import android.content.Context
import android.content.SharedPreferences
import android.app.Activity
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
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
    private var nsdManager: NsdManager? = null

    private val discovered = mutableMapOf<String, JSONObject>()
    private var discoveryListener: NsdManager.DiscoveryListener? = null

    fun init(context: Context, session: RayactEngineSession? = null) {
        appContext = context.applicationContext
        if (session != null) launcherSession = session
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
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
        }
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
                    Log.i(TAG, "openProjectDirect url=$url")
                    validateAndOpenProject(url)
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
            "getAppInfo" -> getAppInfo()
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
            .put("nativeAppVersion", BuildConfig.VERSION_NAME ?: "0.1.0")
            .put("rayactVersion", "0.1.0")
            .toString()
    }

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
        synchronized(discovered) { discovered.clear() }
        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onServiceFound(service: NsdServiceInfo) {
                nsdManager?.resolveService(service, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(si: NsdServiceInfo, code: Int) {}
                    override fun onServiceResolved(si: NsdServiceInfo) {
                        val host = si.host ?: return
                        if (host is java.net.Inet6Address) return
                        val addr = host.hostAddress ?: return
                        val entry = JSONObject()
                            .put("url", "http://$addr:${si.port}")
                            .put("name", si.serviceName)
                            .put("appKey", si.attributes["appKey"]?.let { String(it) } ?: "")
                        synchronized(discovered) { discovered[si.serviceName] = entry }
                    }
                })
            }
            override fun onServiceLost(service: NsdServiceInfo) {
                synchronized(discovered) { discovered.remove(service.serviceName) }
            }
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, code: Int) {}
            override fun onStopDiscoveryFailed(serviceType: String, code: Int) {}
        }
        nsdManager?.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
    }

    private fun stopDiscovery() {
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
