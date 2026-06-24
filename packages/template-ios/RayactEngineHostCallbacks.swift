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
    func stopRenderScheduler()
    func showSoftKeyboard(
        nodeId: Int,
        value: String,
        inputType: String,
        autocorrect: Bool,
        secure: Bool,
        imeAction: String
    )
    func switchIme(
        nodeId: Int,
        value: String,
        inputType: String,
        autocorrect: Bool,
        secure: Bool,
        imeAction: String
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
}
