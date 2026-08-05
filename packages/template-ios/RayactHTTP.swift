import Foundation

enum RayactHTTP {
    static func getText(_ urlString: String) throws -> String {
        let data = try getBytes(urlString)
        guard let text = String(data: data, encoding: .utf8) else {
            throw URLError(.cannotDecodeContentData)
        }
        return text
    }

    static func getBytes(_ urlString: String) throws -> Data {
        let url = try resolveURL(urlString)
        var request = URLRequest(url: url, timeoutInterval: 60)
        request.httpMethod = "GET"
        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<Data, Error> = .failure(URLError(.unknown))
        URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            if let error {
                result = .failure(error)
                return
            }
            guard let http = response as? HTTPURLResponse else {
                result = .failure(URLError(.badServerResponse))
                return
            }
            guard (200...299).contains(http.statusCode) else {
                let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                let suffix = body.isEmpty ? "" : ": \(body)"
                result = .failure(NSError(
                    domain: "RayactHTTP",
                    code: http.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode) from \(urlString)\(suffix)"]
                ))
                return
            }
            result = .success(data ?? Data())
        }.resume()
        _ = semaphore.wait(timeout: .now() + 75)
        return try result.get()
    }

    /// `URL(string:)` rejects unencoded `[` / `]` (dynamic route files like
    /// `app/asset/[id].tsx`). Encode illegal path characters, then parse.
    static func resolveURL(_ urlString: String) throws -> URL {
        if let url = URL(string: urlString) { return url }
        guard let encoded = encodeIllegalPathCharacters(urlString),
              let url = URL(string: encoded) else {
            throw URLError(.badURL)
        }
        return url
    }

    private static func encodeIllegalPathCharacters(_ urlString: String) -> String? {
        guard let schemeRange = urlString.range(of: "://") else { return nil }
        let afterScheme = urlString[schemeRange.upperBound...]
        // Indices from this Substring remain valid on the original String.
        guard let pathStart = afterScheme.firstIndex(of: "/") else { return urlString }
        let prefix = String(urlString[..<pathStart])
        let pathAndQuery = String(urlString[pathStart...])
        let qIdx = pathAndQuery.firstIndex(of: "?")
        let path = qIdx.map { String(pathAndQuery[..<$0]) } ?? pathAndQuery
        let query = qIdx.map { String(pathAndQuery[$0...]) } ?? ""
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "[]{}|\\^`")
        let encodedPath = path
            .split(separator: "/", omittingEmptySubsequences: false)
            .map { segment -> String in
                let s = String(segment)
                if s.isEmpty { return s }
                return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
            }
            .joined(separator: "/")
        return prefix + encodedPath + query
    }
}
