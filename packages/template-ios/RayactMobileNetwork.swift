import Foundation

enum RayactMobileNetwork {
    private static let lock = NSLock()
    private static var fetchStorage: [CChar] = [0]
    private static var pollStorage: [CChar] = Array("[]".utf8CString)
    private static var nextSocketId: Int32 = 1
    private struct SocketRecord { let owner: Int64; let task: URLSessionWebSocketTask }
    private static var sockets: [Int32: SocketRecord] = [:]
    private static var events: [Int64: [[String: Any]]] = [:]

    // In-flight fetches, keyed by owner + the JS-side request id, so AbortSignal
    // can reach the actual URLSessionDataTask. Entries are removed on every
    // terminal path (completion, abort, engine teardown).
    private struct FetchKey: Hashable { let owner: Int64; let requestId: Int32 }
    private static var fetchTasks: [FetchKey: URLSessionDataTask] = [:]

    static let fetchTextCallback: RayactNativeBridge.NetworkFetchFn = { urlPtr in
        let url = urlPtr.map { String(cString: $0) } ?? ""
        let text = (try? RayactHTTP.getText(url)) ?? ""
        lock.lock()
        fetchStorage = Array(text.utf8CString)
        let ptr = fetchStorage.withUnsafeBufferPointer { $0.baseAddress }
        lock.unlock()
        return ptr
    }

    private static var networkFetchBytesStorage: [UInt8] = []

    static let fetchBytesCallback: RayactNativeBridge.NetworkFetchBytesFn = { urlPtr, outLenPtr in
        let url = urlPtr.map { String(cString: $0) } ?? ""
        let data = (try? RayactHTTP.getBytes(url)) ?? Data()
        lock.lock()
        networkFetchBytesStorage = Array(data)
        outLenPtr?.pointee = UInt32(networkFetchBytesStorage.count)
        let ptr = networkFetchBytesStorage.withUnsafeBufferPointer { $0.baseAddress }
        lock.unlock()
        return ptr
    }

    // Asynchronous fetch backing the JS `fetch()` polyfill. Returns immediately;
    // the response is delivered later via the per-owner event queue and drained
    // on the render thread. Replaces the old synchronous httpGetText/Bytes shims
    // that blocked the render thread (froze the dev launcher on unreachable
    // server probes).
    static let fetchStartCallback: RayactNativeBridge.NetworkFetchStartFn = { owner, requestId, urlPtr, methodPtr, headersPtr, bodyPtr in
        let urlString = urlPtr.map { String(cString: $0) } ?? ""
        guard let url = URL(string: urlString) else {
            enqueueFetch(owner: owner, requestId: requestId, status: 0, body: "", error: "Invalid URL")
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        request.httpMethod = (methodPtr.map { String(cString: $0) } ?? "GET").uppercased()
        if let headersPtr,
           let data = String(cString: headersPtr).data(using: .utf8),
           let headers = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for (name, value) in headers {
                request.setValue(String(describing: value), forHTTPHeaderField: name)
            }
        }
        // A null body pointer means "no body" — distinct from an empty one.
        if let bodyPtr { request.httpBody = String(cString: bodyPtr).data(using: .utf8) }
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            removeFetchTask(owner: owner, requestId: requestId)
            if let error {
                // A cancel surfaces here as NSURLErrorCancelled; flag it so the JS
                // side can reject with AbortError rather than a generic Error.
                let nsError = error as NSError
                let canceled = nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
                enqueueFetch(
                    owner: owner, requestId: requestId, status: 0, body: "",
                    error: canceled ? "aborted" : error.localizedDescription,
                    canceled: canceled
                )
                return
            }
            let http = response as? HTTPURLResponse
            let status = http?.statusCode ?? 200
            let statusText = HTTPURLResponse.localizedString(forStatusCode: status)
            let headers = (http?.allHeaderFields ?? [:]).reduce(into: [String: String]()) { out, entry in
                out[String(describing: entry.key)] = String(describing: entry.value)
            }
            let mimeType = response?.mimeType ?? ""
            // Map each byte to a Unicode scalar 0..255 so the body round-trips
            // through JSON unchanged; the JS side rebuilds the exact byte array
            // via charCodeAt & 0xff (and UTF-8-decodes for text()).
            var body = ""
            if let data {
                body.reserveCapacity(data.count)
                for b in data { body.unicodeScalars.append(UnicodeScalar(b)) }
            }
            enqueueFetch(
                owner: owner, requestId: requestId, status: status, body: body, error: "",
                statusText: statusText, headers: headers, mimeType: mimeType
            )
        }
        // Retained before resume() so an abort on the very next frame still finds
        // the task; URLSessionDataTask.cancel() tears the connection down for real.
        lock.lock()
        fetchTasks[FetchKey(owner: owner, requestId: requestId)] = task
        lock.unlock()
        task.resume()
    }

    /// Cancel an in-flight fetch. Backs `AbortController.abort()` on the JS side.
    static let fetchAbortCallback: RayactNativeBridge.NetworkFetchAbortFn = { owner, requestId in
        lock.lock()
        let task = fetchTasks.removeValue(forKey: FetchKey(owner: owner, requestId: requestId))
        lock.unlock()
        task?.cancel()
    }

    private static func removeFetchTask(owner: Int64, requestId: Int32) {
        lock.lock()
        fetchTasks.removeValue(forKey: FetchKey(owner: owner, requestId: requestId))
        lock.unlock()
    }

    /// Drop in-flight fetches for an engine that is going away.
    static func cancelFetches(owner: Int64) {
        lock.lock()
        let doomed = fetchTasks.filter { $0.key.owner == owner }
        for key in doomed.keys { fetchTasks.removeValue(forKey: key) }
        lock.unlock()
        for task in doomed.values { task.cancel() }
    }

    private static func enqueueFetch(
        owner: Int64,
        requestId: Int32,
        status: Int,
        body: String,
        error: String,
        statusText: String = "",
        headers: [String: String] = [:],
        mimeType: String = "",
        canceled: Bool = false
    ) {
        lock.lock()
        var ev: [String: Any] = [
            "type": "fetch", "req": Int(requestId), "status": status, "body": body,
            "statusText": statusText, "headers": headers, "mimeType": mimeType, "protocol": ""
        ]
        if !error.isEmpty { ev["error"] = error }
        if canceled { ev["canceled"] = true }
        events[owner, default: []].append(ev)
        lock.unlock()
        RayactNativeBridge.requestGraphicsFrame(owner)
    }

    static let wsOpenCallback: RayactNativeBridge.WebSocketOpenFn = { owner, urlPtr in
        let urlString = urlPtr.map { String(cString: $0) } ?? ""
        guard let url = URL(string: urlString) else { return 0 }
        lock.lock()
        let id = nextSocketId
        nextSocketId += 1
        lock.unlock()
        let task = URLSession.shared.webSocketTask(with: url)
        lock.lock()
        sockets[id] = SocketRecord(owner: owner, task: task)
        lock.unlock()
        task.resume()
        enqueue(owner: owner, id: id, type: "open")
        listen(owner: owner, id: id, task: task)
        return id
    }

    static let wsSendCallback: RayactNativeBridge.WebSocketSendFn = { owner, id, dataPtr in
        let text = dataPtr.map { String(cString: $0) } ?? ""
        lock.lock()
        let task = sockets[id].flatMap { $0.owner == owner ? $0.task : nil }
        lock.unlock()
        guard let task else { return false }
        task.send(.string(text)) { error in
            if let error { enqueue(owner: owner, id: id, type: "error", extra: ["message": error.localizedDescription]) }
        }
        return true
    }

    static let wsCloseCallback: RayactNativeBridge.WebSocketCloseFn = { owner, id, code, reasonPtr in
        let reason = reasonPtr.map { String(cString: $0) } ?? ""
        lock.lock()
        let record = sockets[id]
        let task = record?.owner == owner ? sockets.removeValue(forKey: id)?.task : nil
        lock.unlock()
        guard let task else { return false }
        task.cancel(with: URLSessionWebSocketTask.CloseCode(rawValue: Int(code)) ?? .normalClosure,
                    reason: reason.data(using: .utf8))
        enqueue(owner: owner, id: id, type: "close", extra: ["code": Int(code), "reason": reason])
        return true
    }

    static let wsPollCallback: RayactNativeBridge.WebSocketPollFn = { owner in
        lock.lock()
        let batch = events.removeValue(forKey: owner) ?? []
        let data = (try? JSONSerialization.data(withJSONObject: batch)) ?? Data("[]".utf8)
        pollStorage = Array((String(data: data, encoding: .utf8) ?? "[]").utf8CString)
        let ptr = pollStorage.withUnsafeBufferPointer { $0.baseAddress }
        lock.unlock()
        return ptr
    }

    private static func listen(owner: Int64, id: Int32, task: URLSessionWebSocketTask) {
        task.receive { result in
            switch result {
            case .success(.string(let text)):
                enqueue(owner: owner, id: id, type: "message", extra: ["data": text])
                listen(owner: owner, id: id, task: task)
            case .success(.data(let data)):
                enqueue(owner: owner, id: id, type: "message", extra: [
                    "data": data.base64EncodedString(), "binary": true
                ])
                listen(owner: owner, id: id, task: task)
            case .success:
                listen(owner: owner, id: id, task: task)
            case .failure(let error):
                enqueue(owner: owner, id: id, type: "error", extra: ["message": error.localizedDescription])
                lock.lock()
                sockets.removeValue(forKey: id)
                lock.unlock()
            }
        }
    }

    private static func enqueue(owner: Int64, id: Int32, type: String, extra: [String: Any] = [:]) {
        lock.lock()
        var ev: [String: Any] = ["id": Int(id), "type": type]
        for (k, v) in extra { ev[k] = v }
        events[owner, default: []].append(ev)
        lock.unlock()
        RayactNativeBridge.requestGraphicsFrame(owner)
    }

    static func closeAll(owner: Int64) {
        lock.lock()
        let owned = sockets.filter { $0.value.owner == owner }
        for (id, _) in owned { sockets.removeValue(forKey: id) }
        events.removeValue(forKey: owner)
        lock.unlock()
        for (_, record) in owned { record.task.cancel(with: .goingAway, reason: nil) }
    }
}
