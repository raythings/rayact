import Foundation

enum RayactGeneratedModules {
    static func register(with registry: RayactPlatformRegistry) {
        RayactBarcodeScannerRegistration().register(with: registry)
        RayactHapticsRegistration().register(with: registry)
        RayactSensorsRegistration().register(with: registry)
    }
}

@_cdecl("RayactRegisterGeneratedModules")
public func RayactRegisterGeneratedModules() {
    RayactGeneratedModules.register(with: RayactPlatformRegistry.shared)
}
