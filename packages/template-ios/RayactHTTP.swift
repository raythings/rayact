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
        guard let url = URL(string: urlString) else { throw URLError(.badURL) }
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
}
