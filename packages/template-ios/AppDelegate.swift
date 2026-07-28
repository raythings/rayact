import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        RayactPlatformRegistry.initialize()
        RayactNativeBridge.setPlatformModuleCallback(RayactPlatformRegistry.platformCallCallback)
        return true
    }
}
