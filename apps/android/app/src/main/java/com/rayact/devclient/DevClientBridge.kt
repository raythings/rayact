package com.rayact.devclient

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.app.Activity
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import com.rayact.engine.RayactEngine
import org.json.JSONArray
import org.json.JSONObject

object DevClientBridge {
    private const val TAG = "DevClientBridge"
    private const val PREFS = "rayact_dev_client"
    private const val KEY_URL = "dev_server_url"
    private const val KEY_RECENT = "recent_urls"
    private const val SERVICE_TYPE = "_rayact._tcp."
    private const val EXTRA_DEV_SERVER_URL = "RAYACT_DEV_SERVER"

    private var prefs: SharedPreferences? = null
    private var appContext: Context? = null
    private var hostActivity: Activity? = null
    private var nsdManager: NsdManager? = null
    private val discovered = mutableListOf<JSONObject>()
    private var discoveryListener: NsdManager.DiscoveryListener? = null

    fun init(context: Context) {
        appContext = context.applicationContext
        hostActivity = context as? Activity
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    }

    fun savedDevServerUrl(): String? = prefs?.getString(KEY_URL, null)

    fun handle(method: String, data: JSONObject?): Any? {
        return when (method) {
            "setDevServerUrl" -> {
                val url = data?.optString("url") ?: return null
                Log.i(TAG, "setDevServerUrl url=$url")
                prefs?.edit()?.putString(KEY_URL, url)?.apply()
                addRecent(url)
                null
            }
            "toggleDevMenu" -> {
                RayactEngine.nativeToggleDevMenu()
                null
            }
            "getDevServerUrl" -> prefs?.getString(KEY_URL, "") ?: ""
            "getRecentEntries" -> getRecentEntries()
            "removeRecentUrl" -> {
                val url = data?.optString("url") ?: return null
                val recent = getRecentList().filter { it != url }
                prefs?.edit()?.putString(KEY_RECENT, JSONArray(recent).toString())?.apply()
                null
            }
            "getDiscoveredServers" -> JSONArray(discovered).toString()
            "startDiscovery" -> { startDiscovery(); null }
            "stopDiscovery" -> { stopDiscovery(); null }
            "reloadWithProjectBundle" -> {
                val url = prefs?.getString(KEY_URL, null)
                if (!url.isNullOrEmpty()) {
                    Log.i(TAG, "reloadWithProjectBundle url=$url")
                    startProjectActivity(url)
                }
                null
            }
            "getConnectError" -> DevServerLoader.lastError ?: ""
            "isConnectLoading" -> DevServerLoader.loading
            "scanQR" -> null
            else -> null
        }
    }

    private fun getRecentList(): List<String> {
        val raw = prefs?.getString(KEY_RECENT, "[]") ?: "[]"
        val arr = runCatching { JSONArray(raw) }.getOrElse {
            prefs?.edit()?.remove(KEY_RECENT)?.apply()
            JSONArray()
        }
        return (0 until arr.length()).map { arr.getString(it) }
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
        discovered.clear()
        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onServiceFound(service: NsdServiceInfo) {
                nsdManager?.resolveService(service, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(si: NsdServiceInfo, code: Int) {}
                    override fun onServiceResolved(si: NsdServiceInfo) {
                        val host = si.host?.hostAddress ?: return
                        val port = si.port
                        val url = "http://$host:$port"
                        discovered.add(JSONObject()
                            .put("url", url)
                            .put("name", si.serviceName)
                            .put("appKey", si.attributes["appKey"]?.let { String(it) } ?: ""))
                    }
                })
            }
            override fun onServiceLost(service: NsdServiceInfo) {}
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

    private fun startProjectActivity(url: String) {
        val ctx = appContext ?: return
        val intent = Intent(ctx, com.rayact.app.MainActivity::class.java)
            .putExtra(EXTRA_DEV_SERVER_URL, url)
        runCatching {
            Log.i(TAG, "startProjectActivity url=$url activity=${hostActivity?.javaClass?.simpleName ?: "<none>"}")
            hostActivity?.runOnUiThread {
                hostActivity?.startActivity(intent)
            } ?: run {
                ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
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
