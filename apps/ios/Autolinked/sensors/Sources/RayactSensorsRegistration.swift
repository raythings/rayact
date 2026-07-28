import CoreMotion
import Foundation

final class RayactSensorsRegistration: RayactPlatformModuleRegistration {
    func register(with registry: RayactPlatformRegistry) {
        let module = RayactSensorsModule()
        registry.registerModule("sensors") { method, payload, completion in
            do {
                completion(.success(try module.invoke(method: method, payload: payload)))
            } catch {
                completion(.failure(error))
            }
        }
    }
}

private final class RayactSensorsModule {
    private let motion = CMMotionManager()
    private let queue = OperationQueue()
    private let lock = NSLock()
    private var active = Set<String>()
    private var events: [[String: Any]] = []
    private var lastAcceleration: (Double, Double, Double)?
    private var lastShakeAt: TimeInterval = 0

    init() {
        queue.name = "dev.rayact.sensors"
        queue.maxConcurrentOperationCount = 1
    }

    func invoke(method: String, payload: Data) throws -> Data {
        let value = (try? JSONSerialization.jsonObject(with: payload)) as? [String: Any] ?? [:]
        switch method {
        case "isAvailable":
            let type = value["type"] as? String ?? ""
            return try encode(type == "gyroscope" ? motion.isGyroAvailable : motion.isAccelerometerAvailable)
        case "startObserving":
            let type = value["type"] as? String ?? ""
            guard type == "accelerometer" || type == "gyroscope" || type == "shake" else {
                throw sensorError("Unsupported sensor type '\(type)'")
            }
            lock.lock()
            active.insert(type)
            lock.unlock()
            refresh(intervalMs: value["intervalMs"] as? Double ?? 50)
            return Data("true".utf8)
        case "stopObserving":
            lock.lock()
            active.remove(value["type"] as? String ?? "")
            lock.unlock()
            refresh(intervalMs: 50)
            return Data("true".utf8)
        case "drainEvents":
            lock.lock()
            let drained = events
            events.removeAll(keepingCapacity: true)
            lock.unlock()
            return try JSONSerialization.data(withJSONObject: drained)
        case "__systemEvent":
            if value["type"] as? String == "motionShake" { recordShake() }
            return Data("true".utf8)
        default:
            throw sensorError("Unknown sensors method '\(method)'")
        }
    }

    private func refresh(intervalMs: Double) {
        lock.lock()
        let snapshot = active
        lock.unlock()
        let interval = min(1, max(1.0 / 60.0, intervalMs / 1000))
        if snapshot.contains("accelerometer") || snapshot.contains("shake") {
            motion.accelerometerUpdateInterval = interval
            if !motion.isAccelerometerActive {
                motion.startAccelerometerUpdates(to: queue) { [weak self] data, _ in
                    self?.handleAcceleration(data)
                }
            }
        } else {
            motion.stopAccelerometerUpdates()
            lastAcceleration = nil
        }
        if snapshot.contains("gyroscope") {
            motion.gyroUpdateInterval = interval
            if !motion.isGyroActive {
                motion.startGyroUpdates(to: queue) { [weak self] data, _ in
                    guard let self, let rotation = data?.rotationRate else { return }
                    self.enqueue([
                        "type": "gyroscope",
                        "x": rotation.x,
                        "y": rotation.y,
                        "z": rotation.z,
                        "timestamp": Date().timeIntervalSince1970 * 1000,
                    ])
                }
            }
        } else {
            motion.stopGyroUpdates()
        }
    }

    private func handleAcceleration(_ data: CMAccelerometerData?) {
        guard let acceleration = data?.acceleration else { return }
        lock.lock()
        let snapshot = active
        lock.unlock()
        let timestamp = Date().timeIntervalSince1970 * 1000
        if snapshot.contains("accelerometer") {
            enqueue([
                "type": "accelerometer",
                "x": acceleration.x,
                "y": acceleration.y,
                "z": acceleration.z,
                "timestamp": timestamp,
            ])
        }
        if snapshot.contains("shake") {
            if let previous = lastAcceleration {
                let dx = acceleration.x - previous.0
                let dy = acceleration.y - previous.1
                let dz = acceleration.z - previous.2
                let force = sqrt(dx * dx + dy * dy + dz * dz)
                if force >= 2.2 && timestamp - lastShakeAt >= 800 {
                    lastShakeAt = timestamp
                    enqueue(["type": "shake", "timestamp": timestamp])
                }
            }
            lastAcceleration = (acceleration.x, acceleration.y, acceleration.z)
        }
    }

    private func enqueue(_ event: [String: Any]) {
        lock.lock()
        if events.count >= 256 { events.removeFirst() }
        events.append(event)
        lock.unlock()
    }

    private func recordShake() {
        lock.lock()
        let observing = active.contains("shake")
        lock.unlock()
        guard observing else { return }
        let timestamp = Date().timeIntervalSince1970 * 1000
        guard timestamp - lastShakeAt >= 800 else { return }
        lastShakeAt = timestamp
        enqueue(["type": "shake", "timestamp": timestamp])
    }

    private func encode(_ value: Bool) throws -> Data {
        Data((value ? "true" : "false").utf8)
    }

    private func sensorError(_ message: String) -> NSError {
        NSError(
            domain: "RayactSensors",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}
