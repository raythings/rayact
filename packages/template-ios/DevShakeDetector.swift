import CoreMotion
import Foundation

final class DevShakeDetector {
    private let motionManager = CMMotionManager()
    private weak var session: RayactEngineSession?
    private var lastShakeAt: TimeInterval = 0
    private var lastX: Double = 0
    private var lastY: Double = 0
    private var lastZ: Double = 0
    private var initialized = false

    init(session: RayactEngineSession) {
        self.session = session
    }

    func start() {
        guard motionManager.isAccelerometerAvailable else { return }
        motionManager.accelerometerUpdateInterval = 1.0 / 60.0
        motionManager.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let self, let data else { return }
            let x = data.acceleration.x
            let y = data.acceleration.y
            let z = data.acceleration.z
            if !self.initialized {
                self.lastX = x
                self.lastY = y
                self.lastZ = z
                self.initialized = true
                return
            }
            let dx = x - self.lastX
            let dy = y - self.lastY
            let dz = z - self.lastZ
            self.lastX = x
            self.lastY = y
            self.lastZ = z
            let gForce = sqrt(dx * dx + dy * dy + dz * dz) / 9.80665
            guard gForce >= 2.2 else { return }
            let now = Date().timeIntervalSince1970 * 1000
            guard now - self.lastShakeAt >= 800 else { return }
            self.lastShakeAt = now
            self.session?.nativeToggleDevMenu()
        }
    }

    func stop() {
        motionManager.stopAccelerometerUpdates()
    }
}
