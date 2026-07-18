import Foundation
import UIKit

final class RayactDevToolsTransport {
    private weak var session: RayactEngineSession?
    private let endpoint: URL
    private let title: String
    private let deviceId = UUID().uuidString
    private let lock = NSLock()
    private var task: URLSessionWebSocketTask?
    private var active = false
    private var sessionId: String?
    private var retryMs = 250
    private var retryWork: DispatchWorkItem?

    init(session: RayactEngineSession, serverUrl: String, title: String) {
        self.session = session; self.title = title
        var parts = URLComponents(string: serverUrl.trimmingCharacters(in: .whitespacesAndNewlines))!
        parts.scheme = parts.scheme == "https" ? "wss" : "ws"
        parts.path = "/rayact/devtools/device"; parts.query = nil
        endpoint = parts.url!
    }
    func start() { lock.withLock { active = true }; connect() }
    func stop() {
        let old = lock.withLock { () -> URLSessionWebSocketTask? in
            active = false; sessionId = nil; retryWork?.cancel(); retryWork = nil
            let value = task; task = nil; return value
        }
        old?.cancel(with: .normalClosure, reason: Data("Rayact session stopped".utf8))
    }
    func sendCDP(_ message: String) {
        let state = lock.withLock { (task, sessionId) }
        guard let socket = state.0, let id = state.1 else { return }
        send(["event":"wrappedEvent", "payload":["pageId":"main", "sessionId":id, "message":message]], on: socket)
    }
    func sendEnvelope(_ message:String) { lock.withLock { task }?.send(.string(message)) { _ in } }
    private func connect() {
        guard lock.withLock({ active }), session?.isAlive() == true else { return }
        let socket = URLSession.shared.webSocketTask(with: endpoint)
        lock.withLock { task = socket }; socket.resume()
        send(["event":"hello", "payload":["protocolVersion":1, "deviceId":deviceId,
            "deviceName":UIDevice.current.name, "appId":Bundle.main.bundleIdentifier ?? "com.rayact.app",
            "platform":"ios", "pages":[["id":"main", "title":title, "vm":"QuickJS"]]]], on: socket)
        receive(on: socket)
    }
    private func receive(on socket: URLSessionWebSocketTask) {
        socket.receive { [weak self, weak socket] result in
            guard let self, let socket else { return }
            switch result {
            case .success(.string(let text)): self.handle(text); self.receive(on: socket)
            case .success(.data(let data)): self.handle(String(data:data,encoding:.utf8) ?? ""); self.receive(on: socket)
            case .success: self.receive(on: socket)
            case .failure: self.reconnect(socket)
            }
        }
    }
    private func handle(_ text: String) {
        guard let data=text.data(using:.utf8), let object=try? JSONSerialization.jsonObject(with:data) as? [String:Any],
              let event=object["event"] as? String, let payload=object["payload"] as? [String:Any] else { return }
        let incoming=payload["sessionId"] as? String
        if event == "connect" { lock.withLock { sessionId=incoming; retryMs=250 } }
        else if event == "disconnect" { lock.withLock { if sessionId==incoming { sessionId=nil } } }
        else if event == "wrappedEvent", incoming == lock.withLock({sessionId}), let message=payload["message"] as? String {
            session?.receiveDevtoolsMessage(message)
        }
    }
    private func reconnect(_ socket: URLSessionWebSocketTask) {
        lock.withLock {
            guard task === socket, active else { return }
            task=nil; sessionId=nil; let delay=retryMs; retryMs=min(retryMs*2,5000)
            let item=DispatchWorkItem { [weak self] in self?.connect() }; retryWork=item
            DispatchQueue.global(qos:.utility).asyncAfter(deadline:.now() + .milliseconds(delay), execute:item)
        }
    }
    private func send(_ object:[String:Any], on socket:URLSessionWebSocketTask) {
        guard let data=try? JSONSerialization.data(withJSONObject:object), let text=String(data:data,encoding:.utf8) else { return }
        socket.send(.string(text)) { [weak self, weak socket] error in if error != nil, let socket { self?.reconnect(socket) } }
    }
}
private extension NSLock { func withLock<T>(_ body:()->T)->T { lock(); defer{unlock()}; return body() } }
