import Foundation
import WebKit

final class RayactWebViewRegistration: RayactPlatformModuleRegistration {
    func register(with registry: RayactPlatformRegistry) {
        registry.registerViewFactory("webview") { context in
            RayactWebViewController(context: context)
        }
    }
}

private final class RayactWebViewController: NSObject, RayactPlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {
    let view: UIView

    private let context: RayactPlatformViewContext
    private let webView: WKWebView
    private var properties: [String: Any] = [:]
    private var disposed = false

    init(context: RayactPlatformViewContext) {
        self.context = context
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(WKUserScript(
            source: """
            window.RayactWebView = window.RayactWebView || {};
            window.RayactWebView.postMessage = function(message) {
              window.webkit.messageHandlers.RayactWebView.postMessage(String(message));
            };
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        ))
        webView = WKWebView(frame: .zero, configuration: configuration)
        view = webView
        super.init()

        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        if #available(iOS 15.0, *) {
            webView.underPageBackgroundColor = .clear
        }
        webView.navigationDelegate = self
        configuration.userContentController.add(self, name: "RayactWebView")
        applyProperties(context.initialProperties.mapValues(Optional.some))
    }

    func setProperties(_ properties: [String: Any?]) {
        applyProperties(properties)
    }

    private func applyProperties(_ changes: [String: Any?]) {
        guard !disposed else { return }
        for (key, value) in changes {
            if let value {
                properties[key] = value
            } else {
                properties.removeValue(forKey: key)
            }
        }
        // Keep the two source variants exclusive even if a producer does not
        // include the expected null tombstone in its patch.
        if changes["sourceHtml"] is String {
            properties.removeValue(forKey: "sourceUri")
        } else if changes["sourceUri"] is String {
            properties.removeValue(forKey: "sourceHtml")
            properties.removeValue(forKey: "baseUrl")
        }

        if changes.keys.contains("javaScriptEnabled") {
            webView.configuration.defaultWebpagePreferences.allowsContentJavaScript =
                boolProperty("javaScriptEnabled", fallback: true)
        }
        if changes.keys.contains("scrollEnabled") {
            webView.scrollView.isScrollEnabled = boolProperty("scrollEnabled", fallback: true)
        }
        if changes.keys.contains("injectedJavaScriptBeforeContentLoaded") {
            rebuildDocumentStartScripts()
        }
        if changes.keys.contains(where: {
            $0 == "sourceUri" || $0 == "sourceHtml" || $0 == "baseUrl"
        }) {
            loadSource()
        }
        if let command = changes["command"] as? String, !command.isEmpty {
            runCommand(command)
        }
    }

    private func rebuildDocumentStartScripts() {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(
            source: """
            window.RayactWebView = window.RayactWebView || {};
            window.RayactWebView.postMessage = function(message) {
              window.webkit.messageHandlers.RayactWebView.postMessage(String(message));
            };
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        ))
        if let script = properties["injectedJavaScriptBeforeContentLoaded"] as? String,
           !script.isEmpty {
            controller.addUserScript(WKUserScript(
                source: script,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            ))
        }
    }

    private func loadSource() {
        if let html = properties["sourceHtml"] as? String {
            let baseURL = (properties["baseUrl"] as? String).flatMap(URL.init(string:))
            webView.loadHTMLString(html, baseURL: baseURL)
            return
        }
        if let raw = properties["sourceUri"] as? String, let url = URL(string: raw) {
            webView.load(URLRequest(url: url))
        } else {
            webView.loadHTMLString("", baseURL: nil)
        }
    }

    private func boolProperty(_ key: String, fallback: Bool) -> Bool {
        switch properties[key] {
        case let value as Bool:
            return value
        case let value as NSNumber:
            return value.boolValue
        case let value as String:
            return value != "false" && value != "0"
        default:
            return fallback
        }
    }

    private func runCommand(_ raw: String) {
        let value = raw.replacingOccurrences(
            of: #"#[0-9]+$"#,
            with: "",
            options: .regularExpression
        )
        switch value {
        case "reload":
            // WKWebView.reload() re-requests the current URL. Inline HTML
            // loaded with loadHTMLString has no real URL (about:blank unless a
            // baseURL was given), so reload() would blank the page — Android's
            // WebView re-renders its data URL instead. Re-run the source load
            // for inline HTML so reload means the same thing on both platforms.
            if properties["sourceHtml"] is String {
                loadSource()
            } else {
                webView.reload()
            }
        case "goBack":
            webView.goBack()
        case "goForward":
            webView.goForward()
        case "stopLoading":
            webView.stopLoading()
        default:
            if value.hasPrefix("inject:") {
                webView.evaluateJavaScript(String(value.dropFirst("inject:".count)))
            } else if value.hasPrefix("post:") {
                let message = String(value.dropFirst("post:".count))
                let quoted = (try? JSONSerialization.data(withJSONObject: [message]))
                    .flatMap { String(data: $0, encoding: .utf8) }
                    .map { String($0.dropFirst().dropLast()) } ?? "\"\""
                webView.evaluateJavaScript(
                    "window.dispatchEvent(new MessageEvent('message',{data:\(quoted)}));"
                )
            }
        }
    }

    private func emit(_ type: String, data: String = "") {
        guard !disposed,
              let encoded = try? JSONSerialization.data(withJSONObject: [
                  "type": type,
                  "data": data,
              ]),
              let string = String(data: encoded, encoding: .utf8) else {
            return
        }
        context.emit(string)
    }

    func dispose() {
        guard !disposed else { return }
        disposed = true
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.configuration.userContentController.removeScriptMessageHandler(
            forName: "RayactWebView"
        )
        webView.removeFromSuperview()
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        emit("message", data: String(describing: message.body))
    }

    func webView(
        _ webView: WKWebView,
        didStartProvisionalNavigation navigation: WKNavigation?
    ) {
        emit("loadStart", data: webView.url?.absoluteString ?? "")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
        if let script = properties["injectedJavaScript"] as? String, !script.isEmpty {
            webView.evaluateJavaScript(script)
        }
        emit("loadEnd", data: webView.url?.absoluteString ?? "")
        let state: [String: Any] = [
            "url": webView.url?.absoluteString ?? "",
            "canGoBack": webView.canGoBack,
            "canGoForward": webView.canGoForward,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: state),
           let string = String(data: data, encoding: .utf8) {
            emit("navigationStateChange", data: string)
        }
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation?,
        withError error: Error
    ) {
        emit("error", data: error.localizedDescription)
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation?,
        withError error: Error
    ) {
        emit("error", data: error.localizedDescription)
    }
}
