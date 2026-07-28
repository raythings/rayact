import Foundation
import UIKit

final class RayactHapticsRegistration: RayactPlatformModuleRegistration {
    func register(with registry: RayactPlatformRegistry) {
        registry.registerModule("haptics") { method, payload, completion in
            let value = (try? JSONSerialization.jsonObject(with: payload)) as? [String: Any] ?? [:]
            let perform = {
                switch method {
                case "selection":
                    UISelectionFeedbackGenerator().selectionChanged()
                case "impact":
                    let style: UIImpactFeedbackGenerator.FeedbackStyle
                    switch value["style"] as? String {
                    case "light": style = .light
                    case "heavy": style = .heavy
                    case "soft": style = .soft
                    case "rigid": style = .rigid
                    default: style = .medium
                    }
                    UIImpactFeedbackGenerator(style: style).impactOccurred()
                case "notification":
                    let type: UINotificationFeedbackGenerator.FeedbackType
                    switch value["type"] as? String {
                    case "warning": type = .warning
                    case "error": type = .error
                    default: type = .success
                    }
                    UINotificationFeedbackGenerator().notificationOccurred(type)
                default:
                    completion(.failure(NSError(
                        domain: "RayactHaptics",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "Unknown haptics method '\(method)'"]
                    )))
                    return
                }
                completion(.success(Data("true".utf8)))
            }
            if Thread.isMainThread {
                perform()
            } else {
                DispatchQueue.main.async(execute: perform)
            }
        }
    }
}
