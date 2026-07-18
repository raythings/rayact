import Foundation

private var hostBridgeClipboardBuffer: [CChar] = [0]

private func hostBridge(from ctx: UnsafeMutableRawPointer?) -> RayactHostCallbacksBridge {
    Unmanaged<RayactHostCallbacksBridge>.fromOpaque(ctx!).takeUnretainedValue()
}

private func requestNewSurfaceCb(_ ctx: UnsafeMutableRawPointer?) -> Int32 {
    Int32(hostBridge(from: ctx).host.requestNewSurface())
}

private func rootSurfaceIdCb(_ ctx: UnsafeMutableRawPointer?) -> Int32 {
    Int32(hostBridge(from: ctx).host.rootSurfaceId())
}

private func topSurfaceIdCb(_ ctx: UnsafeMutableRawPointer?) -> Int32 {
    Int32(hostBridge(from: ctx).host.topSurfaceId())
}

private func releaseTopSurfaceCb(_ ctx: UnsafeMutableRawPointer?) {
    hostBridge(from: ctx).host.releaseTopSurface()
}

private func releaseSurfaceCb(_ ctx: UnsafeMutableRawPointer?, _ surfaceId: Int32) {
    hostBridge(from: ctx).host.releaseSurface(surfaceId: Int(surfaceId))
}

private func orderSurfacesCb(_ ctx: UnsafeMutableRawPointer?, _ ids: UnsafePointer<Int32>?, _ count: Int32) {
    guard let ids, count > 0 else { return }
    let values = (0..<Int(count)).map { Int(ids[$0]) }
    hostBridge(from: ctx).host.orderSurfaces(surfaceIds: values)
}

private func requestRenderFrameCb(_ ctx: UnsafeMutableRawPointer?) {
    hostBridge(from: ctx).host.requestRenderFrame()
}

private func sendDevtoolsMessageCb(_ ctx: UnsafeMutableRawPointer?, _ message: UnsafePointer<CChar>?) {
    guard let message else { return }
    hostBridge(from: ctx).host.sendDevtoolsMessage(String(cString: message))
}

private func toggleDevMenuCb(_ ctx: UnsafeMutableRawPointer?) {
    hostBridge(from: ctx).host.toggleDevMenu()
}

private func performHapticFeedbackCb(_ ctx: UnsafeMutableRawPointer?) {
    hostBridge(from: ctx).host.performHapticFeedback()
}

private func hideSoftKeyboardCb(_ ctx: UnsafeMutableRawPointer?) {
    hostBridge(from: ctx).host.hideSoftKeyboard()
}

private func finishActivityCb(_ ctx: UnsafeMutableRawPointer?) {
    hostBridge(from: ctx).host.finishActivity()
}

private func stopRenderSchedulerCb(_ ctx: UnsafeMutableRawPointer?) {
    hostBridge(from: ctx).host.stopRenderScheduler()
}

private func showSoftKeyboardCb(
    _ ctx: UnsafeMutableRawPointer?,
    _ nodeId: Int32,
    _ value: UnsafePointer<CChar>?,
    _ inputType: UnsafePointer<CChar>?,
    _ autocorrect: Bool,
    _ secure: Bool,
    _ imeAction: UnsafePointer<CChar>?,
    _ autoCapitalize: UnsafePointer<CChar>?,
    _ contextMenuHidden: Bool
) {
    hostBridge(from: ctx).host.showSoftKeyboard(
        nodeId: Int(nodeId),
        value: value.map { String(cString: $0) } ?? "",
        inputType: inputType.map { String(cString: $0) } ?? "text",
        autocorrect: autocorrect,
        secure: secure,
        imeAction: imeAction.map { String(cString: $0) } ?? "done",
        autoCapitalize: autoCapitalize.map { String(cString: $0) } ?? "sentences",
        contextMenuHidden: contextMenuHidden
    )
}

private func switchImeCb(
    _ ctx: UnsafeMutableRawPointer?,
    _ nodeId: Int32,
    _ value: UnsafePointer<CChar>?,
    _ inputType: UnsafePointer<CChar>?,
    _ autocorrect: Bool,
    _ secure: Bool,
    _ imeAction: UnsafePointer<CChar>?,
    _ autoCapitalize: UnsafePointer<CChar>?,
    _ contextMenuHidden: Bool
) {
    hostBridge(from: ctx).host.switchIme(
        nodeId: Int(nodeId),
        value: value.map { String(cString: $0) } ?? "",
        inputType: inputType.map { String(cString: $0) } ?? "text",
        autocorrect: autocorrect,
        secure: secure,
        imeAction: imeAction.map { String(cString: $0) } ?? "done",
        autoCapitalize: autoCapitalize.map { String(cString: $0) } ?? "sentences",
        contextMenuHidden: contextMenuHidden
    )
}

private func copyToClipboardCb(_ ctx: UnsafeMutableRawPointer?, _ text: UnsafePointer<CChar>?) {
    guard let text else { return }
    hostBridge(from: ctx).host.copyToClipboard(text: String(cString: text))
}

private func readClipboardCb(_ ctx: UnsafeMutableRawPointer?) -> UnsafePointer<CChar>? {
    let text = hostBridge(from: ctx).host.readClipboard()
    hostBridgeClipboardBuffer = Array(text.utf8CString)
    return hostBridgeClipboardBuffer.withUnsafeBufferPointer { $0.baseAddress }
}

private func updateImeStateCb(
    _ ctx: UnsafeMutableRawPointer?,
    _ nodeId: Int32,
    _ selectionStart: Int32,
    _ selectionEnd: Int32,
    _ composingStart: Int32,
    _ composingEnd: Int32,
    _ text: UnsafePointer<CChar>?
) {
    hostBridge(from: ctx).host.updateImeState(
        nodeId: Int(nodeId),
        selectionStart: Int(selectionStart),
        selectionEnd: Int(selectionEnd),
        composingStart: Int(composingStart),
        composingEnd: Int(composingEnd),
        text: text.map { String(cString: $0) }
    )
}

final class RayactHostCallbacksBridge {
    let host: RayactHost
    private let callbacksPtr: UnsafeMutablePointer<RayactIOSHostCallbacks>

    init(host: RayactHost) {
        self.host = host
        callbacksPtr = UnsafeMutablePointer<RayactIOSHostCallbacks>.allocate(capacity: 1)
        callbacksPtr.initialize(to: RayactIOSHostCallbacks(
            context: Unmanaged.passUnretained(self).toOpaque(),
            requestNewSurface: requestNewSurfaceCb,
            rootSurfaceId: rootSurfaceIdCb,
            topSurfaceId: topSurfaceIdCb,
            releaseTopSurface: releaseTopSurfaceCb,
            releaseSurface: releaseSurfaceCb,
            orderSurfaces: orderSurfacesCb,
            requestRenderFrame: requestRenderFrameCb,
            sendDevtoolsMessage: sendDevtoolsMessageCb,
            toggleDevMenu: toggleDevMenuCb,
            performHapticFeedback: performHapticFeedbackCb,
            hideSoftKeyboard: hideSoftKeyboardCb,
            finishActivity: finishActivityCb,
            stopRenderScheduler: stopRenderSchedulerCb,
            showSoftKeyboard: showSoftKeyboardCb,
            switchIme: switchImeCb,
            copyToClipboard: copyToClipboardCb,
            readClipboard: readClipboardCb,
            updateImeState: updateImeStateCb
        ))
    }

    deinit {
        callbacksPtr.deinitialize(count: 1)
        callbacksPtr.deallocate()
    }

    var callbacksPointer: UnsafePointer<RayactIOSHostCallbacks> {
        UnsafePointer(callbacksPtr)
    }
}
