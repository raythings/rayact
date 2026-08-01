package dev.rayact.webview

import android.content.Context
import android.graphics.Color
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.rayact.engine.RayactPlatformModuleRegistration
import com.rayact.engine.RayactPlatformRegistry
import com.rayact.engine.RayactPlatformViewContext
import com.rayact.engine.RayactPlatformViewController
import org.json.JSONObject

class RayactWebViewRegistration : RayactPlatformModuleRegistration {
    override fun register(context: Context, registry: RayactPlatformRegistry) {
        registry.registerViewFactory("webview") { viewContext ->
            RayactWebViewController(viewContext)
        }
    }
}

private class RayactWebViewController(
    private val host: RayactPlatformViewContext,
) : RayactPlatformViewController {
    override val view = WebView(host.context)
    private val properties = mutableMapOf<String, Any?>()
    private var disposed = false
    private var documentStartHandler: ScriptHandler? = null
    private var documentStartFallback: String? = null

    init {
        // Android WebView otherwise paints its own opaque default canvas even
        // when the loaded document has no CSS background. Keep the native
        // surface clear so Rayact content underneath remains visible; an
        // explicit background supplied by the document still paints normally.
        view.setBackgroundColor(Color.TRANSPARENT)
        view.background?.alpha = 0
        view.settings.javaScriptEnabled = true
        view.settings.blockNetworkLoads = false
        view.addJavascriptInterface(object {
            @JavascriptInterface
            fun postMessage(message: String) {
                emit("message", message)
            }
        }, "RayactWebView")
        view.webViewClient = object : WebViewClient() {
            override fun onPageStarted(
                view: WebView?,
                url: String?,
                favicon: android.graphics.Bitmap?,
            ) {
                documentStartFallback?.let { view?.evaluateJavascript(it, null) }
                emit("loadStart", url.orEmpty())
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                (properties["injectedJavaScript"] as? String)
                    ?.takeIf(String::isNotEmpty)
                    ?.let { view?.evaluateJavascript(it, null) }
                emit("loadEnd", url.orEmpty())
                emit(
                    "navigationStateChange",
                    JSONObject()
                        .put("url", url.orEmpty())
                        .put("canGoBack", view?.canGoBack() == true)
                        .put("canGoForward", view?.canGoForward() == true)
                        .toString(),
                )
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                if (request?.isForMainFrame != false) {
                    emit("error", error?.description?.toString().orEmpty())
                }
            }
        }
        applyProperties(host.initialProperties)
    }

    private fun emit(type: String, data: String = "") {
        if (disposed) return
        host.emit(JSONObject().put("type", type).put("data", data).toString())
    }

    private fun loadSource() {
        if (disposed) return
        (properties["sourceHtml"] as? String)?.let {
            view.loadDataWithBaseURL(
                properties["baseUrl"] as? String,
                it,
                "text/html",
                "UTF-8",
                null,
            )
            return
        }
        (properties["sourceUri"] as? String)?.takeIf(String::isNotEmpty)?.let(view::loadUrl)
    }

    override fun setProperties(properties: Map<String, Any?>) {
        applyProperties(properties)
    }

    private fun applyProperties(changes: Map<String, Any?>) {
        if (disposed) return
        for ((key, value) in changes) {
            if (value == null) properties.remove(key) else properties[key] = value
        }
        // Source variants are mutually exclusive even when a producer omits the
        // null tombstone. This prevents a previous HTML value from shadowing a
        // later URI (and vice versa).
        if (changes["sourceHtml"] is String) {
            properties.remove("sourceUri")
        } else if (changes["sourceUri"] is String) {
            properties.remove("sourceHtml")
            properties.remove("baseUrl")
        }

        // Configuration is committed before a changed source begins loading.
        if ("javaScriptEnabled" in changes) {
            view.settings.javaScriptEnabled = booleanProperty("javaScriptEnabled", true)
        }
        if ("scrollEnabled" in changes) {
            val enabled = booleanProperty("scrollEnabled", true)
            view.isVerticalScrollBarEnabled = enabled
            view.isHorizontalScrollBarEnabled = enabled
        }
        if ("injectedJavaScriptBeforeContentLoaded" in changes) {
            rebuildDocumentStartScript()
        }
        if (changes.keys.any { it == "sourceUri" || it == "sourceHtml" || it == "baseUrl" }) {
            view.post(::loadSource)
        }

        // Commands are deliberately applied after configuration and source.
        (changes["command"] as? String)?.takeIf(String::isNotEmpty)?.let(::runCommand)
    }

    private fun booleanProperty(key: String, fallback: Boolean): Boolean {
        return when (val value = properties[key]) {
            is Boolean -> value
            is Number -> value.toInt() != 0
            is String -> value != "false" && value != "0"
            else -> fallback
        }
    }

    private fun rebuildDocumentStartScript() {
        documentStartHandler?.remove()
        documentStartHandler = null
        documentStartFallback = null
        val script = (properties["injectedJavaScriptBeforeContentLoaded"] as? String)
            ?.takeIf(String::isNotEmpty)
            ?: return
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            documentStartHandler =
                WebViewCompat.addDocumentStartJavaScript(view, script, setOf("*"))
        } else {
            // Older WebView providers have no document-start hook. Preserve
            // the previous best-effort behavior instead of dropping the prop.
            documentStartFallback = script
        }
    }

    private fun runCommand(raw: String) {
        val value = raw.replace(Regex("#\\d+$"), "")
        when {
            value == "reload" -> view.reload()
            value == "goBack" -> view.goBack()
            value == "goForward" -> view.goForward()
            value == "stopLoading" -> view.stopLoading()
            value.startsWith("inject:") ->
                view.evaluateJavascript(value.removePrefix("inject:"), null)
            value.startsWith("post:") -> {
                val message = JSONObject.quote(value.removePrefix("post:"))
                view.evaluateJavascript(
                    "window.dispatchEvent(new MessageEvent('message',{data:$message}));",
                    null,
                )
            }
        }
    }

    override fun dispose() {
        if (disposed) return
        disposed = true
        documentStartHandler?.remove()
        documentStartHandler = null
        documentStartFallback = null
        view.removeJavascriptInterface("RayactWebView")
        view.stopLoading()
        view.destroy()
    }
}
