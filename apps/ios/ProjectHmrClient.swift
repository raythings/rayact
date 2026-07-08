import Foundation

enum ProjectHmrClient {
    private static let queue = DispatchQueue(label: "com.rayact.hmr", qos: .userInitiated)
    private static var generation = 0
    private static var running = false
    private static var webSocketTask: URLSessionWebSocketTask?
    private static var receiveTask: Task<Void, Never>?
    private static var baseUrl: String?
    private static weak var session: RayactEngineSession?

    static func start(serverUrl: String, engineSession: RayactEngineSession) {
        stop()
        let normalized = DevServerLoader.normalizeBase(serverUrl)
        generation += 1
        let gen = generation
        baseUrl = normalized
        session = engineSession
        running = true

        queue.async {
            guard running, gen == generation else { return }
            let manifest: [String: Any]
            do {
                manifest = try DevServerLoader.fetchManifest(baseUrl: normalized)
            } catch {
                print("[ProjectHmrClient] hmr manifest fetch failed: \(error.localizedDescription)")
                return
            }
            guard running, gen == generation else { return }

            let wsUrlString: String
            if let hmrUrl = manifest["hmrUrl"] as? String, !hmrUrl.isEmpty {
                wsUrlString = hmrUrl
            } else {
                wsUrlString = normalized
                    .replacingOccurrences(of: "http://", with: "ws://")
                    .replacingOccurrences(of: "https://", with: "wss://") + "/rayact/hmr"
            }
            guard let wsUrl = URL(string: wsUrlString) else { return }

            print("[ProjectHmrClient] connecting hmr ws=\(wsUrlString) gen=\(gen)")
            let task = URLSession.shared.webSocketTask(with: wsUrl)
            webSocketTask = task
            task.resume()
            listen(task: task, gen: gen, base: normalized, engineSession: engineSession)
        }
    }

    static func stop() {
        running = false
        generation += 1
        receiveTask?.cancel()
        receiveTask = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        session = nil
        baseUrl = nil
    }

    private static func listen(task: URLSessionWebSocketTask, gen: Int, base: String, engineSession: RayactEngineSession) {
        receiveTask = Task {
            while running, gen == generation, !Task.isCancelled {
                do {
                    let message = try await task.receive()
                    guard running, gen == generation else { return }
                    switch message {
                    case .string(let text):
                        handleMessage(base: base, engineSession: engineSession, raw: text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            handleMessage(base: base, engineSession: engineSession, raw: text)
                        }
                    @unknown default:
                        break
                    }
                } catch {
                    print("[ProjectHmrClient] hmr ws failure: \(error.localizedDescription)")
                    return
                }
            }
        }
    }

    private static func handleMessage(base: String, engineSession: RayactEngineSession, raw: String) {
        guard let data = raw.data(using: .utf8),
              let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = message["type"] as? String else { return }

        switch type {
        case "update":
            guard let updates = message["updates"] as? [[String: Any]] else { return }
            for update in updates {
                guard (update["type"] as? String) == "js-update",
                      let path = update["path"] as? String, !path.isEmpty else { continue }
                let timestamp = update["timestamp"] as? Int64 ?? 0
                applyModuleUpdate(base: base, engineSession: engineSession, path: path, timestamp: timestamp)
            }
        case "full-reload", "reload":
            print("[ProjectHmrClient] full-reload requested")
            DevClientBridge.reloadCurrentProject()
        default:
            break
        }
    }

    private static func applyModuleUpdate(base: String, engineSession: RayactEngineSession, path: String, timestamp: Int64) {
        let canonicalPath = path.split(whereSeparator: { $0 == "?" || $0 == "#" }).first.map(String.init) ?? ""
        guard !canonicalPath.isEmpty else { return }
        let query = timestamp > 0 ? "?t=\(timestamp)&platform=ios" : "?platform=ios"
        let moduleUrl = "\(base)/rayact/m\(canonicalPath)\(query)"
        do {
            let source = try DevServerLoader.httpGetText(moduleUrl)
            let ok = engineSession.applyModuleUpdate(path: canonicalPath, source: source)
            print("[ProjectHmrClient] module update path=\(canonicalPath) ok=\(ok) bytes=\(source.count)")
        } catch {
            print("[ProjectHmrClient] module update failed path=\(canonicalPath): \(error)")
        }
    }
}
