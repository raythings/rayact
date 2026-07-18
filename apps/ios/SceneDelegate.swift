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

        RayactNativeBridge.setNetworkCallbacks(
            RayactMobileNetwork.fetchTextCallback,
            RayactMobileNetwork.fetchBytesCallback,
            RayactMobileNetwork.wsOpenCallback,
            RayactMobileNetwork.wsSendCallback,
            RayactMobileNetwork.wsCloseCallback,
            RayactMobileNetwork.wsPollCallback
        )
        RayactNativeBridge.setNetworkFetchStart(RayactMobileNetwork.fetchStartCallback)

#if !RAYACT_RELEASE
        RayactNativeBridge.setDevCallbacks(DevClientBridge.devCallCallback, DevServerLoader.devFetchCallback)
        RayactNativeBridge.setDevFetchBytes(DevServerLoader.devFetchBytesCallback)

        let deepLinkServer = connectionOptions.urlContexts
            .compactMap { Self.parseDevServerURL($0.url) }
            .first
        let initialDevServer = deepLinkServer ?? Self.commandLineDevServerURL()

        // Older builds persisted this launch-only override. Clear that stale
        // application-domain value so a normal cold launch always shows the
        // launcher. Explicit deep links and CLI launch arguments still open a
        // project once through `initialDevServer` above.
        UserDefaults.standard.removeObject(forKey: DevClientBridge.extraDevServerUrl)

        let sceneWindow = UIWindow(windowScene: windowScene)
        sceneWindow.rootViewController = DevLauncherController(initialDevServerUrl: initialDevServer)
#else
        let sceneWindow = UIWindow(windowScene: windowScene)
        sceneWindow.rootViewController = ReleaseViewController()
#endif
        sceneWindow.makeKeyAndVisible()
        window = sceneWindow
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
#if !RAYACT_RELEASE
        for context in URLContexts {
            guard let server = Self.parseDevServerURL(context.url) else { continue }
            DevClientBridge.openProjectFromNative(url: server)
        }
#endif
    }

#if !RAYACT_RELEASE
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

    private static func commandLineDevServerURL() -> String? {
        let option = "-\(DevClientBridge.extraDevServerUrl)"
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.lastIndex(of: option), index + 1 < arguments.count else {
            return nil
        }
        let raw = arguments[index + 1]
        guard !raw.isEmpty else { return nil }
        return DevServerLoader.normalizeBase(raw)
    }
#endif
}
