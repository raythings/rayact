import UIKit

final class RayactHost: RayactEngineHostCallbacks {
    private let session: RayactEngineSession
    let renderScheduler: RayactRenderScheduler

    private weak var navigationHost: NavigationHost?
#if !RAYACT_RELEASE
    private var devMenuOverlay: DevMenuOverlay?
#endif
    private(set) weak var imeView: RayactSurfaceView?

    init(session: RayactEngineSession, renderScheduler: RayactRenderScheduler) {
        self.session = session
        self.renderScheduler = renderScheduler
    }

    func registerImeView(_ view: RayactSurfaceView) { imeView = view }
    func unregisterImeView(_ view: RayactSurfaceView) {
        if imeView === view { imeView = nil }
    }

    func setNavigationHost(_ host: NavigationHost) {
        navigationHost = host
    }

    func clearNavigationHost(_ host: NavigationHost) {
        if navigationHost === host { navigationHost = nil }
    }

    func requestNewSurface() -> Int {
        guard let nav = navigationHost else { return 0 }
        var result = 0
        let sem = DispatchSemaphore(value: 0)
        DispatchQueue.main.async {
            do {
                let screen = nav.pushScreen()
                screen.onSurfaceReady = { sid in
                    nav.noteSurfaceReady(screen, surfaceId: sid)
                    result = sid
                    sem.signal()
                }
                if screen.surfaceId > 0 {
                    result = screen.surfaceId
                    sem.signal()
                }
            } catch {
                sem.signal()
            }
        }
        _ = sem.wait(timeout: .now() + 2)
        return result
    }

    func releaseTopSurface() {
        guard let nav = navigationHost else { return }
        DispatchQueue.main.async { nav.popScreen() }
    }

    func releaseSurface(surfaceId: Int) {
        guard let nav = navigationHost else { return }
        DispatchQueue.main.async { nav.releaseSurface(surfaceId: surfaceId) }
    }

    func orderSurfaces(surfaceIds: [Int]) {
        guard let nav = navigationHost else { return }
        DispatchQueue.main.async { nav.orderSurfaces(surfaceIds: surfaceIds) }
    }

    func rootSurfaceId() -> Int {
        navigationHost?.rootSurfaceId ?? 0
    }

    func topSurfaceId() -> Int {
        guard let nav = navigationHost else { return 0 }
        let top = nav.topFragmentSurfaceId()
        return top > 0 ? top : nav.rootSurfaceId
    }

    func finishActivity() {
#if !RAYACT_RELEASE
        if DevClientBridge.tryShowLauncherFromFinishActivity() { return }
#endif
        guard let nav = navigationHost else { return }
        DispatchQueue.main.async {
            nav.parentController?.dismiss(animated: true)
        }
    }

    func attachDevMenuOverlay(_ host: NavigationHost) {
#if !RAYACT_RELEASE
        DispatchQueue.main.async {
            self.devMenuOverlay = DevMenuOverlay(host: host, session: self.session)
        }
#else
        _ = host
#endif
    }

    func toggleDevMenu() {
#if !RAYACT_RELEASE
        DispatchQueue.main.async { self.devMenuOverlay?.toggle() }
#endif
    }

    func requestRenderFrame() {
        renderScheduler.requestFrame()
    }

    func sendDevtoolsMessage(_ message: String) {
        session.sendDevtoolsMessage(message)
    }

    func stopRenderScheduler() {
        renderScheduler.stopRendering()
    }

    func showSoftKeyboard(
        nodeId: Int,
        value: String,
        inputType: String,
        autocorrect: Bool,
        secure: Bool,
        imeAction: String,
        autoCapitalize: String,
        contextMenuHidden: Bool
    ) {
        guard let view = imeView else { return }
        DispatchQueue.main.async {
            view.setupForIme(
                nodeId: nodeId,
                initialText: value,
                inputType: inputType,
                autocorrect: autocorrect,
                secure: secure,
                imeAction: imeAction,
                autoCapitalize: autoCapitalize,
                contextMenuHidden: contextMenuHidden
            )
        }
    }

    func switchIme(
        nodeId: Int,
        value: String,
        inputType: String,
        autocorrect: Bool,
        secure: Bool,
        imeAction: String,
        autoCapitalize: String,
        contextMenuHidden: Bool
    ) {
        guard let view = imeView else { return }
        DispatchQueue.main.async {
            view.switchIme(
                nodeId: nodeId,
                initialText: value,
                inputType: inputType,
                autocorrect: autocorrect,
                secure: secure,
                imeAction: imeAction,
                autoCapitalize: autoCapitalize,
                contextMenuHidden: contextMenuHidden
            )
        }
    }

    func hideSoftKeyboard() {
        guard let view = imeView else { return }
        DispatchQueue.main.async { view.clearIme() }
    }

    func updateImeState(
        nodeId: Int,
        selectionStart: Int,
        selectionEnd: Int,
        composingStart: Int,
        composingEnd: Int,
        text: String?
    ) {
        guard let view = imeView else { return }
        DispatchQueue.main.async {
            view.updateImeState(
                nodeId: nodeId,
                text: text,
                selectionStart: selectionStart,
                selectionEnd: selectionEnd,
                composingStart: composingStart,
                composingEnd: composingEnd
            )
        }
    }

    func copyToClipboard(text: String) {
        guard let view = imeView else { return }
        DispatchQueue.main.async {
            UIPasteboard.general.string = text
        }
    }

    func readClipboard() -> String {
        UIPasteboard.general.string ?? ""
    }

    func performHapticFeedback() {
        guard let view = imeView else { return }
        DispatchQueue.main.async {
            view.performHapticFeedback()
        }
    }
}
