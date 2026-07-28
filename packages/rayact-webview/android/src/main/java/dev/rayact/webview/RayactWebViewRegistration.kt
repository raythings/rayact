package dev.rayact.webview

import android.content.Context
import android.graphics.Color
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
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
    private val properties = mutableMapOf<String, String>()
    private var disposed = false

    init {
        view.setBackgroundColor(Color.TRANSPARENT)
        view.settings.javaScriptEnabled = true
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
                properties["injectedJavaScriptBeforeContentLoaded"]
                    ?.takeIf(String::isNotEmpty)
                    ?.let { view?.evaluateJavascript(it, null) }
                emit("loadStart", url.orEmpty())
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                properties["injectedJavaScript"]
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
    }

    private fun emit(type: String, data: String = "") {
        if (disposed) return
        host.emit(JSONObject().put("type", type).put("data", data).toString())
    }

    private fun loadSource() {
        if (disposed) return
        properties["sourceHtml"]?.let {
            view.loadDataWithBaseURL(properties["baseUrl"], it, "text/html", "UTF-8", null)
            return
        }
        properties["sourceUri"]?.takeIf(String::isNotEmpty)?.let(view::loadUrl)
    }

    override fun setProperty(key: String, value: String) {
        properties[key] = value
        when (key) {
            "sourceUri", "sourceHtml", "baseUrl" -> view.post(::loadSource)
            "javaScriptEnabled" -> view.settings.javaScriptEnabled = value != "false"
            "scrollEnabled" -> {
                view.isVerticalScrollBarEnabled = value != "false"
                view.isHorizontalScrollBarEnabled = value != "false"
            }
            "command" -> runCommand(value)
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
        view.removeJavascriptInterface("RayactWebView")
        view.stopLoading()
        view.destroy()
    }
}
