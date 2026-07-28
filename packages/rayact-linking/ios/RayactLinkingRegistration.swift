import Foundation
import UIKit

final class RayactLinkingRegistration: RayactPlatformModuleRegistration {
    func register(with registry: RayactPlatformRegistry) {
        registry.registerModule("linking") { method, payload, completion in
            let value = (try? JSONSerialization.jsonObject(with: payload))
                as? [String: Any] ?? [:]
            guard let rawURL = value["url"] as? String, let url = URL(string: rawURL) else {
                completion(.failure(NSError(
                    domain: "RayactLinking",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "A valid URL is required"]
                )))
                return
            }
            let perform = {
                switch method {
                case "canOpenURL":
                    completion(.success(Data((UIApplication.shared.canOpenURL(url) ? "true" : "false").utf8)))
                case "openURL":
                    guard UIApplication.shared.canOpenURL(url) else {
                        completion(.failure(NSError(
                            domain: "RayactLinking",
                            code: 2,
                            userInfo: [NSLocalizedDescriptionKey: "No application can open URL: \(rawURL)"]
                        )))
                        return
                    }
                    UIApplication.shared.open(url, options: [:]) { opened in
                        if opened {
                            completion(.success(Data("true".utf8)))
                        } else {
                            completion(.failure(NSError(
                                domain: "RayactLinking",
                                code: 3,
                                userInfo: [NSLocalizedDescriptionKey: "Unable to open URL: \(rawURL)"]
                            )))
                        }
                    }
                default:
                    completion(.failure(NSError(
                        domain: "RayactLinking",
                        code: 4,
                        userInfo: [NSLocalizedDescriptionKey: "Unknown linking method '\(method)'"]
                    )))
                }
            }
            if Thread.isMainThread {
                perform()
            } else {
                DispatchQueue.main.async(execute: perform)
            }
        }
    }
}
