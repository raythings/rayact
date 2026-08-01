import UIKit
import Darwin

typealias RayactPlatformCompletion = (Result<Data, Error>) -> Void
typealias RayactPlatformModule = (_ method: String, _ payload: Data, _ completion: @escaping RayactPlatformCompletion) -> Void

final class RayactPlatformViewContext {
    let nodeId: Int
    let initialProperties: [String: Any]
    let emit: (String) -> Void

    init(nodeId: Int, initialProperties: [String: Any], emit: @escaping (String) -> Void) {
        self.nodeId = nodeId
        self.initialProperties = initialProperties
        self.emit = emit
    }
}

protocol RayactPlatformViewController: AnyObject {
    var view: UIView { get }
    func setProperties(_ properties: [String: Any?])
    func dispose()
}

extension RayactPlatformViewController {
    func setProperties(_ properties: [String: Any?]) {}
    func dispose() {}
}

typealias RayactPlatformViewFactory = (_ context: RayactPlatformViewContext) -> RayactPlatformViewController

protocol RayactPlatformModuleRegistration {
    func register(with registry: RayactPlatformRegistry)
}

final class RayactPlatformRegistry {
    static let shared = RayactPlatformRegistry()
    private static let initializationLock = NSLock()
    private static var initialized = false
    private static let responseLock = NSLock()
    private static var responseStorage: [CChar] = [0]

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

    func makeViewController(
        _ kind: String,
        nodeId: Int,
        properties: [String: Any],
        emit: @escaping (String) -> Void
    ) -> RayactPlatformViewController? {
        lock.lock()
        let factory = viewFactories[kind]
        lock.unlock()
        return factory?(RayactPlatformViewContext(
            nodeId: nodeId,
            initialProperties: properties,
            emit: emit
        ))
    }

    func hasModule(_ name: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return modules[name] != nil
    }

    static func foregroundViewController() -> UIViewController? {
        dispatchPrecondition(condition: .onQueue(.main))
        let root = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
        return topViewController(from: root)
    }

    private static func topViewController(from controller: UIViewController?) -> UIViewController? {
        if let presented = controller?.presentedViewController {
            return topViewController(from: presented)
        }
        if let navigation = controller as? UINavigationController {
            return topViewController(from: navigation.visibleViewController)
        }
        if let tabs = controller as? UITabBarController {
            return topViewController(from: tabs.selectedViewController)
        }
        return controller
    }

    func emitSystemEvent(_ type: String, payload: [String: Any] = [:]) {
        lock.lock()
        let installedModules = Array(modules.values)
        lock.unlock()
        var event = payload
        event["type"] = type
        guard let data = try? JSONSerialization.data(withJSONObject: event) else { return }
        for module in installedModules {
            module("__systemEvent", data) { _ in }
        }
    }

    static func initialize() {
        initializationLock.lock()
        defer { initializationLock.unlock() }
        guard !initialized else { return }
        initialized = true
        registerRayactNativeTextInput(with: shared)
        guard let symbol = dlsym(
            UnsafeMutableRawPointer(bitPattern: -2),
            "RayactRegisterGeneratedModules"
        ) else {
            initialized = false
            return
        }
        typealias Register = @convention(c) () -> Void
        unsafeBitCast(symbol, to: Register.self)()
    }

    static let platformCallCallback: RayactNativeBridge.PlatformCallFn = {
        modulePointer,
        methodPointer,
        payloadPointer in
        let module = modulePointer.map(String.init(cString:)) ?? ""
        let method = methodPointer.map(String.init(cString:)) ?? ""
        let payload = Data((payloadPointer.map(String.init(cString:)) ?? "null").utf8)
        let semaphore = DispatchSemaphore(value: 0)
        var response = Data(#"{"ok":false,"error":"Platform module call did not complete"}"#.utf8)
        RayactPlatformRegistry.shared.invoke(module, method: method, payload: payload) { result in
            switch result {
            case .success(let value):
                let json = String(data: value, encoding: .utf8).flatMap { $0.isEmpty ? nil : $0 } ?? "null"
                response = Data("{\"ok\":true,\"value\":\(json)}".utf8)
            case .failure(let error):
                response = (try? JSONSerialization.data(withJSONObject: [
                    "ok": false,
                    "error": error.localizedDescription,
                ])) ?? Data(#"{"ok":false,"error":"Platform module call failed"}"#.utf8)
            }
            semaphore.signal()
        }
        if semaphore.wait(timeout: .now() + 15) == .timedOut {
            response = Data(#"{"ok":false,"error":"Platform module call timed out"}"#.utf8)
        }
        responseLock.lock()
        responseStorage = response.map { CChar(bitPattern: $0) } + [0]
        let pointer = responseStorage.withUnsafeBufferPointer { $0.baseAddress }
        responseLock.unlock()
        return pointer
    }
}
