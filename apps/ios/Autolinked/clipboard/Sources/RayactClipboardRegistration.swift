import Foundation
import UIKit

final class RayactClipboardRegistration: RayactPlatformModuleRegistration {
    func register(with registry: RayactPlatformRegistry) {
        registry.registerModule("clipboard") { method, payload, completion in
            let perform = {
                switch method {
                case "getString":
                    let value = UIPasteboard.general.string ?? ""
                    completion(.success(try! JSONEncoder().encode(value)))
                case "setString":
                    let value = (try? JSONSerialization.jsonObject(with: payload))
                        as? [String: Any]
                    UIPasteboard.general.string = value?["text"] as? String ?? ""
                    completion(.success(Data("true".utf8)))
                case "hasString":
                    completion(.success(Data((UIPasteboard.general.hasStrings ? "true" : "false").utf8)))
                default:
                    completion(.failure(NSError(
                        domain: "RayactClipboard",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "Unknown clipboard method '\(method)'"]
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
