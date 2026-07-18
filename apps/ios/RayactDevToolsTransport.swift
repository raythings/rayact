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
        self.session = session
        self.title = title
        var components = URLComponents(string: serverUrl.trimmingCharacters(in: .whitespacesAndNewlines))!
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.path = "/rayact/devtools/device"
        components.query = nil
        endpoint = components.url!
    }

    func start() { lock.withLock { active = true }; connect() }

    func stop() {
        let old: URLSessionWebSocketTask? = lock.withLock {
            active = false; sessionId = nil; retryWork?.cancel(); retryWork = nil
            let value = task; task = nil; return value
        }
        old?.cancel(with: .normalClosure, reason: Data("Rayact session stopped".utf8))
    }

    func sendCDP(_ message: String) {
        let state = lock.withLock { (task, sessionId) }
        guard let task = state.0, let sessionId = state.1 else { return }
        send(["event": "wrappedEvent", "payload": ["pageId": "main", "sessionId": sessionId, "message": message]], on: task)
    }
    func sendEnvelope(_ message: String) { lock.withLock { task }?.send(.string(message)) { _ in } }

    private func connect() {
        guard lock.withLock({ active }), session?.isAlive() == true else { return }
        let socket = URLSession.shared.webSocketTask(with: endpoint)
        lock.withLock { task = socket }
        socket.resume()
        send(["event": "hello", "payload": [
            "protocolVersion": 1, "deviceId": deviceId, "deviceName": UIDevice.current.name,
            "appId": Bundle.main.bundleIdentifier ?? "com.rayact.app", "platform": "ios",
            "pages": [["id": "main", "title": title, "vm": "QuickJS"]]
        ]], on: socket)
        receive(on: socket)
    }

    private func receive(on socket: URLSessionWebSocketTask) {
        socket.receive { [weak self, weak socket] result in
            guard let self, let socket else { return }
            switch result {
            case .success(.string(let text)):
                self.handle(text); self.receive(on: socket)
            case .success(.data(let data)):
                self.handle(String(data: data, encoding: .utf8) ?? ""); self.receive(on: socket)
            case .success:
                self.receive(on: socket)
            case .failure:
                self.reconnect(socket)
            }
        }
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let event = object["event"] as? String,
              let payload = object["payload"] as? [String: Any] else { return }
        let incomingId = payload["sessionId"] as? String
        switch event {
        case "connect": lock.withLock { sessionId = incomingId; retryMs = 250 }
        case "disconnect": lock.withLock { if sessionId == incomingId { sessionId = nil } }
        case "wrappedEvent":
            let current = lock.withLock { sessionId }
            if incomingId == current, let message = payload["message"] as? String { session?.receiveDevtoolsMessage(message) }
        default: break
        }
    }

    private func reconnect(_ socket: URLSessionWebSocketTask) {
        let work: DispatchWorkItem? = lock.withLock {
            guard task === socket, active else { return nil }
            task = nil; sessionId = nil
            let delay = retryMs; retryMs = min(retryMs * 2, 5_000)
            let item = DispatchWorkItem { [weak self] in self?.connect() }
            retryWork = item
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + .milliseconds(delay), execute: item)
            return item
        }
        _ = work
    }

    private func send(_ object: [String: Any], on socket: URLSessionWebSocketTask) {
        guard let data = try? JSONSerialization.data(withJSONObject: object), let text = String(data: data, encoding: .utf8) else { return }
        socket.send(.string(text)) { [weak self, weak socket] error in if error != nil, let socket { self?.reconnect(socket) } }
    }
}

private extension NSLock {
    func withLock<T>(_ body: () -> T) -> T { lock(); defer { unlock() }; return body() }
}
