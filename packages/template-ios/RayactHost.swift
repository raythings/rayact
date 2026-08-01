import UIKit

final class RayactHost: RayactEngineHostCallbacks {
    private let session: RayactEngineSession
    let renderScheduler: RayactRenderScheduler

    private weak var navigationHost: NavigationHost?
#if !RAYACT_RELEASE
    private var devMenuOverlay: DevMenuOverlay?
#endif
    private(set) weak var imeView: RayactSurfaceView?
    private var surfaceViews: [Int: WeakSurfaceView] = [:]
    private var pendingPlatformViewOperations: [Int: [PlatformViewOperation]] = [:]

    private final class WeakSurfaceView {
        weak var value: RayactSurfaceView?
        init(_ value: RayactSurfaceView) { self.value = value }
    }

    private enum PlatformViewOperation {
        case create(nodeId: Int, kind: String, propertiesJson: String)
        case properties(nodeId: Int, propertiesJson: String)
        case dispose(nodeId: Int)
    }

    init(session: RayactEngineSession, renderScheduler: RayactRenderScheduler) {
        self.session = session
        self.renderScheduler = renderScheduler
    }

    func registerImeView(_ view: RayactSurfaceView) { imeView = view }
    func unregisterImeView(_ view: RayactSurfaceView) {
        if imeView === view { imeView = nil }
    }

    func registerSurfaceView(_ view: RayactSurfaceView, surfaceId: Int) {
        surfaceViews[surfaceId] = WeakSurfaceView(view)
        let operations = pendingPlatformViewOperations.removeValue(
            forKey: surfaceId) ?? []
        for operation in operations {
            applyPlatformViewOperation(operation, to: view.platformViewHost)
        }
    }

    func unregisterSurfaceView(_ view: RayactSurfaceView, surfaceId: Int) {
        if surfaceViews[surfaceId]?.value === view {
            surfaceViews[surfaceId] = nil
            pendingPlatformViewOperations[surfaceId] = nil
        }
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

    func platformViewCreate(surfaceId: Int, nodeId: Int, kind: String, propertiesJson: String) {
        DispatchQueue.main.async { [weak self] in
            self?.routePlatformViewOperation(
                .create(nodeId: nodeId, kind: kind,
                        propertiesJson: propertiesJson),
                surfaceId: surfaceId)
        }
    }

    func platformViewSetProperties(surfaceId: Int, nodeId: Int, propertiesJson: String) {
        DispatchQueue.main.async { [weak self] in
            self?.routePlatformViewOperation(
                .properties(nodeId: nodeId, propertiesJson: propertiesJson),
                surfaceId: surfaceId)
        }
    }

    func platformViewDispose(surfaceId: Int, nodeId: Int) {
        DispatchQueue.main.async { [weak self] in
            self?.routePlatformViewOperation(
                .dispose(nodeId: nodeId), surfaceId: surfaceId)
        }
    }

    private func routePlatformViewOperation(
        _ operation: PlatformViewOperation, surfaceId: Int
    ) {
        if let host = surfaceViews[surfaceId]?.value?.platformViewHost {
            applyPlatformViewOperation(operation, to: host)
        } else {
            pendingPlatformViewOperations[surfaceId, default: []].append(operation)
        }
    }

    private func applyPlatformViewOperation(
        _ operation: PlatformViewOperation, to host: RayactPlatformViewHost
    ) {
        switch operation {
        case let .create(nodeId, kind, propertiesJson):
            host.create(
                nodeId: nodeId, kind: kind, propertiesJson: propertiesJson)
        case let .properties(nodeId, propertiesJson):
            host.setProperties(
                nodeId: nodeId, propertiesJson: propertiesJson)
        case let .dispose(nodeId):
            host.dispose(nodeId: nodeId)
        }
    }

    func platformViewsBeginFrame(surfaceId: Int, width: Float, height: Float, density: Float) {
        surfaceViews[surfaceId]?.value?.platformViewHost.beginFrame(
            width: width, height: height, density: density)
    }

    func platformViewComposite(surfaceId: Int, nodeId: Int, compositionJson: String) -> Bool {
        surfaceViews[surfaceId]?.value?.platformViewHost.composite(
            nodeId: nodeId, compositionJson: compositionJson) ?? false
    }

    func platformViewsEndFrame(surfaceId: Int) {
        surfaceViews[surfaceId]?.value?.platformViewHost.endFrame()
    }

    func platformViewGestureDecision(surfaceId: Int, nodeId: Int, accepted: Bool) {
        surfaceViews[surfaceId]?.value?.platformViewHost.resolveGesture(
            nodeId: nodeId, accepted: accepted)
    }
}
