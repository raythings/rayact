import Foundation

enum DevServerLoader {
    private static let platformQuery = "platform=ios"
    private static let maxPrefetchAssetBytes = 4 * 1024 * 1024
    private static let maxPrefetchTotalBytes = 16 * 1024 * 1024
    private static let maxPrefetchAssets = 32

    struct BundlePayload {
        let baseUrl: String
        let bundleFormat: String
        let bytes: Data
        let hmrMode: String
    }

    private static let queue = DispatchQueue(label: "com.rayact.devserver.loader", qos: .userInitiated)
    private static let prefetchQueue = DispatchQueue(
        label: "com.rayact.devserver.prefetch",
        qos: .utility,
        attributes: .concurrent
    )
    private static let prefetchLock = NSLock()

    private struct WarmBootstrap {
        let payload: BundlePayload
        let revision: Int64
    }

    private static var warmBootstraps: [String: WarmBootstrap] = [:]
    private static var prefetchedResources: [String: Data] = [:]
    private static var warming: Set<String> = []

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
        let data = takePrefetchedResource(url: url) ?? (try? httpGetBytes(url)) ?? Data()
        return String(data: data, encoding: .utf8) ?? ""
    }

    private static var devFetchBytesStorage: [UInt8] = []

    static let devFetchBytesCallback: RayactNativeBridge.DevFetchBytesFn = { urlPtr, outLenPtr in
        let url = urlPtr.map { String(cString: $0) } ?? ""
        let data = takePrefetchedResource(url: url) ?? (try? httpGetBytes(url)) ?? Data()
        devFetchBytesStorage = Array(data)
        outLenPtr?.pointee = UInt32(devFetchBytesStorage.count)
        return devFetchBytesStorage.withUnsafeBufferPointer { $0.baseAddress }
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

    private static func requireCompatibleModules(_ manifest: [String: Any]) throws {
        let bundled = DevClientBridge.bundledNativeModuleNames()
        let required = manifest["nativeModules"] as? [[String: Any]] ?? []
        let missing = required.compactMap { item -> String? in
            guard let name = item["name"] as? String, !name.isEmpty, !bundled.contains(name) else { return nil }
            return name
        }
        if !missing.isEmpty {
            throw NSError(
                domain: "RayactDevClientCompatibility",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey:
                    "Incompatible server: missing bundled native modules: \(Array(Set(missing)).sorted().joined(separator: ", "))"]
            )
        }
    }

    static func fetchBootstrap(baseUrl: String) throws -> BundlePayload {
        let normalized = normalizeBase(baseUrl)
        let manifest = try fetchManifest(baseUrl: normalized)
        try requireCompatibleModules(manifest)
        let hmrMode = manifest["hmrMode"] as? String ?? "module"
        let bundleFormat = manifest["bundleFormat"] as? String ?? "js"
        let revision = (manifest["revision"] as? NSNumber)?.int64Value ?? -1
        if let warm = takeWarmBootstrap(baseUrl: normalized, revision: revision) {
            print("[DevServerLoader] using prefetched dev bootstrap for \(normalized)")
            return warm
        }
        let path = bundlePath(bundleFormat: bundleFormat, hmrMode: hmrMode)
        let bytes = try httpGetBytes("\(normalized)\(path)?\(platformQuery)")
        return BundlePayload(baseUrl: normalized, bundleFormat: bundleFormat, bytes: bytes, hmrMode: hmrMode)
    }

    /// Warm the data needed before the first project frame as soon as Bonjour
    /// resolves a server. Bootstrap reuse is revision-checked; modules and
    /// assets are consumed once so HMR cannot observe stale discovery data.
    static func prefetch(baseUrl: String) {
        let normalized = normalizeBase(baseUrl)
        prefetchLock.lock()
        let alreadyWarm = warmBootstraps[normalized] != nil
        let started = alreadyWarm ? false : warming.insert(normalized).inserted
        prefetchLock.unlock()
        guard !alreadyWarm, started else { return }

        prefetchQueue.async {
            defer {
                prefetchLock.lock()
                warming.remove(normalized)
                prefetchLock.unlock()
            }
            do {
                let manifest = try fetchManifest(baseUrl: normalized)
                try requireCompatibleModules(manifest)
                let hmrMode = manifest["hmrMode"] as? String ?? "module"
                let bundleFormat = manifest["bundleFormat"] as? String ?? "js"
                let path = bundlePath(bundleFormat: bundleFormat, hmrMode: hmrMode)
                let payload = BundlePayload(
                    baseUrl: normalized,
                    bundleFormat: bundleFormat,
                    bytes: try httpGetBytes("\(normalized)\(path)?\(platformQuery)"),
                    hmrMode: hmrMode
                )
                let warm = WarmBootstrap(
                    payload: payload,
                    revision: (manifest["revision"] as? NSNumber)?.int64Value ?? -1
                )
                prefetchLock.lock()
                warmBootstraps[normalized] = warm
                prefetchLock.unlock()

                let resourceCount = prefetchInitialResources(baseUrl: normalized, manifest: manifest)
                print("[DevServerLoader] prefetched bootstrap + \(resourceCount) startup resources from \(normalized)")
            } catch {
                print("[DevServerLoader] prefetch unavailable for \(normalized): \(error.localizedDescription)")
            }
        }
    }

    private static func bundlePath(bundleFormat: String, hmrMode: String) -> String {
        if bundleFormat == "qjsbc" { return "/rayact/bundle.qjsbc" }
        if hmrMode == "module" { return "/rayact/bootstrap.js" }
        return "/rayact/bundle"
    }

    private static func takeWarmBootstrap(baseUrl: String, revision: Int64) -> BundlePayload? {
        prefetchLock.lock()
        defer { prefetchLock.unlock() }
        guard let warm = warmBootstraps.removeValue(forKey: baseUrl), warm.revision == revision else {
            return nil
        }
        return warm.payload
    }

    private static func prefetchInitialResources(baseUrl: String, manifest: [String: Any]) -> Int {
        var urls: [(url: String, declaredSize: Int)] = []
        if let entryUrl = manifest["entryModuleUrl"] as? String, !entryUrl.isEmpty {
            urls.append((entryUrl, 0))
        }
        if let assets = manifest["assets"] as? [[String: Any]] {
            for asset in assets.prefix(maxPrefetchAssets) {
                let size = (asset["size"] as? NSNumber)?.intValue ?? 0
                guard size >= 0, size <= maxPrefetchAssetBytes,
                      let url = asset["url"] as? String, !url.isEmpty else { continue }
                urls.append((url, size))
            }
        }

        var total = 0
        var count = 0
        for item in urls {
            if item.declaredSize > 0, total + item.declaredSize > maxPrefetchTotalBytes { continue }
            let url = rebaseToBase(url: item.url, baseUrl: baseUrl)
            do {
                let bytes = try httpGetBytes(url)
                guard total + bytes.count <= maxPrefetchTotalBytes else { continue }
                prefetchLock.lock()
                prefetchedResources[url] = bytes
                prefetchLock.unlock()
                total += bytes.count
                count += 1
            } catch {
                print("[DevServerLoader] startup resource prefetch unavailable for \(url): \(error.localizedDescription)")
            }
        }
        return count
    }

    private static func takePrefetchedResource(url: String) -> Data? {
        prefetchLock.lock()
        defer { prefetchLock.unlock() }
        return prefetchedResources.removeValue(forKey: url)
    }

    private static func rebaseToBase(url: String, baseUrl: String) -> String {
        guard let requested = URL(string: url), requested.path.hasPrefix("/rayact/"),
              let selected = URL(string: baseUrl),
              var components = URLComponents(url: requested, resolvingAgainstBaseURL: false) else {
            return url
        }
        components.scheme = selected.scheme
        components.host = selected.host
        components.port = selected.port
        return components.url?.absoluteString ?? url
    }

    static func httpGetText(_ urlString: String) throws -> String {
        try RayactHTTP.getText(urlString)
    }

    private static func httpGetBytes(_ urlString: String) throws -> Data {
        try RayactHTTP.getBytes(urlString)
    }
}
