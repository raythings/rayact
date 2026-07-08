import Foundation

enum DevServerLoader {
    private static let platformQuery = "platform=ios"
    struct BundlePayload {
        let baseUrl: String
        let bundleFormat: String
        let bytes: Data
        let hmrMode: String
    }

    private static let queue = DispatchQueue(label: "com.rayact.devserver.loader", qos: .userInitiated)

    private(set) static var lastError: String?
    private(set) static var loading = false
    private(set) static var lastSuccessUrl: String?

    private static var fetchResultStorage: [CChar] = [0]

    static let devFetchCallback: RayactNativeBridge.DevFetchFn = { urlPtr in
        let url = urlPtr.map { String(cString: $0) } ?? ""
        let result = devFetchFromNative(url: url)
        fetchResultStorage = Array(result.utf8CString)
        return fetchResultStorage.withUnsafeBufferPointer { $0.baseAddress }
    }

    static func devFetchFromNative(url: String) -> String {
        (try? httpGetText(url)) ?? ""
    }

    static func loadAsync(baseUrl: String, session: RayactEngineSession, onSuccess: (() -> Void)? = nil) {
        let normalized = normalizeBase(baseUrl)
        loading = true
        lastError = nil
        lastSuccessUrl = nil
        queue.async {
            defer { loading = false }
            do {
                let payload = try fetchBootstrap(baseUrl: normalized)
                let ok: Bool
                if payload.bundleFormat == "qjsbc" {
                    ok = session.loadBytecode(payload.bytes)
                } else if let source = String(data: payload.bytes, encoding: .utf8) {
                    ok = session.loadDevBootstrap(serverUrl: normalized, source: source)
                } else {
                    ok = false
                }
                if !ok {
                    lastError = "Native engine rejected dev bundle"
                    print("[DevServerLoader] \(lastError!)")
                } else {
                    print("[DevServerLoader] Queued dev bootstrap from \(payload.baseUrl) (\(payload.bytes.count) bytes)")
                    lastSuccessUrl = payload.baseUrl
                    if let onSuccess {
                        DispatchQueue.main.async { onSuccess() }
                    }
                }
            } catch {
                lastError = error.localizedDescription
                print("[DevServerLoader] load failed for \(normalized): \(error)")
            }
        }
    }

    static func normalizeBase(_ baseUrl: String) -> String {
        var s = baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\/", with: "/")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if !s.lowercased().hasPrefix("http://"), !s.lowercased().hasPrefix("https://") {
            s = "http://\(s)"
        }
        return s
    }

    static func probeManifest(baseUrl: String, timeoutMs: Int = 2500) -> Bool {
        let url = URL(string: "\(normalizeBase(baseUrl))/rayact/manifest.json?\(platformQuery)")!
        var request = URLRequest(url: url, timeoutInterval: TimeInterval(timeoutMs) / 1000)
        request.httpMethod = "GET"
        let sem = DispatchSemaphore(value: 0)
        var ok = false
        URLSession.shared.dataTask(with: request) { data, response, _ in
            defer { sem.signal() }
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
                  let data, (try? JSONSerialization.jsonObject(with: data)) != nil else { return }
            ok = true
        }.resume()
        _ = sem.wait(timeout: .now() + .milliseconds(timeoutMs + 500))
        return ok
    }

    static func fetchManifest(baseUrl: String) throws -> [String: Any] {
        let text = try httpGetText("\(normalizeBase(baseUrl))/rayact/manifest.json?\(platformQuery)")
        guard let data = text.data(using: .utf8),
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw URLError(.cannotParseResponse)
        }
        return json
    }

    static func fetchBootstrap(baseUrl: String) throws -> BundlePayload {
        let normalized = normalizeBase(baseUrl)
        let manifest = try fetchManifest(baseUrl: normalized)
        let hmrMode = manifest["hmrMode"] as? String ?? "module"
        let bundleFormat = manifest["bundleFormat"] as? String ?? "js"
        let path: String
        if bundleFormat == "qjsbc" {
            path = "/rayact/bundle.qjsbc"
        } else if hmrMode == "module" {
            path = "/rayact/bootstrap.js"
        } else {
            path = "/rayact/bundle"
        }
        let bytes = try httpGetBytes("\(normalized)\(path)?\(platformQuery)")
        return BundlePayload(baseUrl: normalized, bundleFormat: bundleFormat, bytes: bytes, hmrMode: hmrMode)
    }

    static func httpGetText(_ urlString: String) throws -> String {
        let data = try httpGetBytes(urlString)
        guard let text = String(data: data, encoding: .utf8) else {
            throw URLError(.cannotDecodeContentData)
        }
        return text
    }

    private static func httpGetBytes(_ urlString: String) throws -> Data {
        guard let url = URL(string: urlString) else { throw URLError(.badURL) }
        var request = URLRequest(url: url, timeoutInterval: 60)
        request.httpMethod = "GET"
        let sem = DispatchSemaphore(value: 0)
        var result: Result<Data, Error> = .failure(URLError(.unknown))
        URLSession.shared.dataTask(with: request) { data, response, error in
            defer { sem.signal() }
            if let error {
                result = .failure(error)
                return
            }
            guard let http = response as? HTTPURLResponse else {
                result = .failure(URLError(.badServerResponse))
                return
            }
            guard (200...299).contains(http.statusCode) else {
                let errBody = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                let suffix = errBody.isEmpty ? "" : ": \(errBody)"
                result = .failure(NSError(
                    domain: "DevServerLoader",
                    code: http.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode) from \(urlString)\(suffix)"]
                ))
                return
            }
            result = .success(data ?? Data())
        }.resume()
        _ = sem.wait(timeout: .now() + 75)
        return try result.get()
    }
}
