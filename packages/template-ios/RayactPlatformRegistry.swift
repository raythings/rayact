import UIKit

typealias RayactPlatformCompletion = (Result<Data, Error>) -> Void
typealias RayactPlatformModule = (_ method: String, _ payload: Data, _ completion: @escaping RayactPlatformCompletion) -> Void
typealias RayactPlatformViewFactory = (_ nodeId: Int, _ properties: [String: Any]) -> UIView

protocol RayactPlatformModuleRegistration {
    func register(with registry: RayactPlatformRegistry)
}

/// Application-owned registry populated by generated autolinking code.
final class RayactPlatformRegistry {
    private var modules: [String: RayactPlatformModule] = [:]
    private var viewFactories: [String: RayactPlatformViewFactory] = [:]
    private let lock = NSLock()

    func registerModule(_ name: String, invoke: @escaping RayactPlatformModule) {
        precondition(!name.isEmpty, "Platform module name must not be empty")
        lock.lock()
        defer { lock.unlock() }
        precondition(modules[name] == nil, "Platform module '\(name)' already registered")
        modules[name] = invoke
    }

    func registerViewFactory(_ kind: String, factory: @escaping RayactPlatformViewFactory) {
        precondition(!kind.isEmpty, "Platform view kind must not be empty")
        lock.lock()
        defer { lock.unlock() }
        precondition(viewFactories[kind] == nil, "Platform view '\(kind)' already registered")
        viewFactories[kind] = factory
    }

    func invoke(_ name: String, method: String, payload: Data, completion: @escaping RayactPlatformCompletion) {
        lock.lock()
        let module = modules[name]
        lock.unlock()
        guard let module else {
            completion(.failure(NSError(
                domain: "RayactPlatformModule",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Platform module '\(name)' is not installed"]
            )))
            return
        }
        module(method, payload, completion)
    }

    func makeView(_ kind: String, nodeId: Int, properties: [String: Any]) -> UIView? {
        lock.lock()
        let factory = viewFactories[kind]
        lock.unlock()
        return factory?(nodeId, properties)
    }

    func hasModule(_ name: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return modules[name] != nil
    }
}
