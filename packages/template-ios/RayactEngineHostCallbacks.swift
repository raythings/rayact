import Foundation

protocol RayactEngineHostCallbacks: AnyObject {
    func requestNewSurface() -> Int
    func rootSurfaceId() -> Int
    func topSurfaceId() -> Int
    func releaseTopSurface()
    func releaseSurface(surfaceId: Int)
    func orderSurfaces(surfaceIds: [Int])
    func finishActivity()
    func toggleDevMenu()
    func requestRenderFrame()
    func sendDevtoolsMessage(_ message: String)
    func stopRenderScheduler()
    func showSoftKeyboard(
        nodeId: Int,
        value: String,
        inputType: String,
        autocorrect: Bool,
        secure: Bool,
        imeAction: String,
        autoCapitalize: String,
        contextMenuHidden: Bool
    )
    func switchIme(
        nodeId: Int,
        value: String,
        inputType: String,
        autocorrect: Bool,
        secure: Bool,
        imeAction: String,
        autoCapitalize: String,
        contextMenuHidden: Bool
    )
    func hideSoftKeyboard()
    func updateImeState(
        nodeId: Int,
        selectionStart: Int,
        selectionEnd: Int,
        composingStart: Int,
        composingEnd: Int,
        text: String?
    )
    func copyToClipboard(text: String)
    func readClipboard() -> String
    func performHapticFeedback()
    func platformViewCreate(surfaceId: Int, nodeId: Int, kind: String, propertiesJson: String)
    func platformViewSetProperties(surfaceId: Int, nodeId: Int, propertiesJson: String)
    func platformViewDispose(surfaceId: Int, nodeId: Int)
    func platformViewsBeginFrame(surfaceId: Int, width: Float, height: Float, density: Float)
    func platformViewComposite(surfaceId: Int, nodeId: Int, compositionJson: String) -> Bool
    func platformViewsEndFrame(surfaceId: Int)
    func platformViewGestureDecision(surfaceId: Int, nodeId: Int, accepted: Bool)
}
