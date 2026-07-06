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

        if let url = connectionOptions.urlContexts.first?.url,
           let server = Self.parseDevServerURL(url) {
            UserDefaults.standard.set(server, forKey: DevClientBridge.extraDevServerUrl)
        }

        let sceneWindow = UIWindow(windowScene: windowScene)
        sceneWindow.rootViewController = DevLauncherController()
        sceneWindow.makeKeyAndVisible()
        window = sceneWindow
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            guard let server = Self.parseDevServerURL(context.url) else { continue }
            DevClientBridge.openProjectFromNative(url: server)
        }
    }

    private static func parseDevServerURL(_ url: URL) -> String? {
        if url.scheme?.lowercased() == "rayact", url.host == "connect" {
            let raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "url" })?
                .value
            guard let raw, !raw.isEmpty else { return nil }
            return DevServerLoader.normalizeBase(raw)
        }
        if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            return DevServerLoader.normalizeBase(url.absoluteString)
        }
        return nil
    }
}
