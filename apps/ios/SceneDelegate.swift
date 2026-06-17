import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        IOSBundledAssets.extractIfNeeded()
        FileManager.default.changeCurrentDirectoryPath(
            FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!.path
        )

        RayactNativeBridge.setDevCallbacks(DevClientBridge.devCallCallback, DevServerLoader.devFetchCallback)

        let sceneWindow = UIWindow(windowScene: windowScene)
        sceneWindow.rootViewController = DevLauncherController()
        sceneWindow.makeKeyAndVisible()
        window = sceneWindow
    }
}
