import Foundation
import UIKit

final class RayactEngineSession {
    static let TOUCH_DOWN = 0
    static let TOUCH_UP = 1
    static let TOUCH_MOVE = 2

    let nativeHandle: RayactIOSHandle
    private(set) lazy var host: RayactHost = RayactHost(
        session: self,
        renderScheduler: RayactRenderScheduler(session: self)
    )
    private var hostBridge: RayactHostCallbacksBridge?
    private var destroyed = false

    private init(handle: RayactIOSHandle) {
        nativeHandle = handle
    }

    func isAlive() -> Bool { !destroyed }

    func acquireGraphics() -> Bool {
        RayactNativeBridge.sessionAcquireGraphics(nativeHandle)
    }

    func releaseGraphics() {
        host.renderScheduler.stopRendering()
        RayactNativeBridge.sessionReleaseGraphics(nativeHandle)
    }

    func destroy() {
        destroyed = true
        hostBridge = nil
        RayactNativeBridge.sessionDestroy(nativeHandle)
    }

    func loadSource(_ source: String) -> Bool {
        source.withCString { RayactNativeBridge.sessionLoadScript(nativeHandle, 0, $0) }
    }

    func loadDevClient(_ source: String) -> Bool {
        loadSource(source)
    }

    func loadDevServer(_ url: String) -> Bool {
        url.withCString { RayactNativeBridge.sessionLoadScript(nativeHandle, 1, $0) }
    }

    func loadDevBootstrap(serverUrl: String, source: String) -> Bool {
        let transport = """
        globalThis.__RAYACT_DEV_SERVER__ = \(Self.jsonQuote(serverUrl));
        globalThis.__rayactDevFetch = function(url) { return rayactDevFetch(url); };
        """
        return loadSource(transport + "\n" + source)
    }

    func loadBytecode(_ bytes: Data) -> Bool {
        bytes.withUnsafeBytes { buffer in
            guard let base = buffer.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return false }
            return RayactNativeBridge.sessionLoadBytecode(nativeHandle, base, Int32(bytes.count))
        }
    }

    func applyModuleUpdate(path: String, source: String) -> Bool {
        path.withCString { pathPtr in
            source.withCString { sourcePtr in
                RayactNativeBridge.sessionApplyModuleUpdate(nativeHandle, pathPtr, sourcePtr)
            }
        }
    }

    func createSurface(metalLayer: UnsafeMutableRawPointer, density: Float, widthPx: Int, heightPx: Int, scale: Float) -> Int {
        Int(RayactNativeBridge.sessionCreateSurface(
            nativeHandle,
            metalLayer,
            density,
            Int32(widthPx),
            Int32(heightPx),
            scale
        ))
    }

    func resizeSurface(surfaceId: Int, width: Int, height: Int, density: Float) {
        RayactNativeBridge.sessionResizeSurface(
            nativeHandle,
            Int32(surfaceId),
            Int32(width),
            Int32(height),
            density
        )
    }

    func relayoutOnSurfaceResizeEnabled() -> Bool {
        RayactNativeBridge.sessionRelayoutOnSurfaceResizeEnabled(nativeHandle)
    }

    func setSafeAreaInsets(top: Float, right: Float, bottom: Float, left: Float) {
        RayactNativeBridge.sessionSetSafeAreaInsets(nativeHandle, top, right, bottom, left)
    }

    func setKeyboardInsets(heightDp: Float, visible: Bool, durationMs: Float) {
        RayactNativeBridge.sessionSetKeyboardInsets(nativeHandle, heightDp, visible, durationMs)
    }

    func keyEvent(type: Int32, key: String, code: String, text: String = "", modifiers: UIKeyModifierFlags = []) {
        key.withCString { keyPtr in
            code.withCString { codePtr in
                text.withCString { textPtr in
                    RayactNativeBridge.sessionKeyEvent(
                        nativeHandle, type, keyPtr, codePtr, textPtr, false,
                        modifiers.contains(.control), modifiers.contains(.alternate),
                        modifiers.contains(.shift), modifiers.contains(.command)
                    )
                }
            }
        }
    }

    func destroySurface(_ surfaceId: Int) {
        RayactNativeBridge.sessionDestroySurface(nativeHandle, Int32(surfaceId))
    }

    func pushSurface(_ surfaceId: Int) {
        RayactNativeBridge.sessionPushSurface(nativeHandle, Int32(surfaceId))
    }

    func popSurface() -> Int {
        Int(RayactNativeBridge.sessionPopSurface(nativeHandle))
    }

    func getFocusedSurfaceId() -> Int {
        Int(RayactNativeBridge.sessionGetFocusedSurfaceId(nativeHandle))
    }

    func nativeRenderFrame(frameTimeNanos: Int64, deltaNanos: Int64) -> Bool {
        RayactNativeBridge.sessionRenderFrame(nativeHandle, frameTimeNanos, deltaNanos)
    }

    func nativeNextJSTimerDelayMs() -> Float {
        RayactNativeBridge.sessionNextJSTimerDelayMs(nativeHandle)
    }

    func nativeToggleDevMenu() {
        RayactNativeBridge.sessionToggleDevMenu(nativeHandle)
    }

    func nativeOnBackPressed() {
        RayactNativeBridge.sessionOnBackPressed(nativeHandle)
    }

    func refreshAppearance() {
        RayactNativeBridge.sessionRefreshAppearance(nativeHandle)
    }

    func nativeTouch(action: Int, id: Int, x: Float, y: Float) {
        RayactNativeBridge.sessionTouch(nativeHandle, Int32(action), Int32(id), x, y)
    }

    func nativeSetTextInputContent(
        nodeId: Int,
        text: String,
        selectionStart: Int,
        selectionEnd: Int,
        composingStart: Int,
        composingEnd: Int
    ) {
        text.withCString { textPtr in
            RayactNativeBridge.sessionSetTextInputContent(
                nativeHandle,
                Int32(nodeId),
                textPtr,
                Int32(selectionStart),
                Int32(selectionEnd),
                Int32(composingStart),
                Int32(composingEnd)
            )
        }
    }

    func nativeBlurTextInput() {
        RayactNativeBridge.sessionBlurTextInput(nativeHandle)
    }

    func nativeImeHiddenBySystem() {
        RayactNativeBridge.sessionImeHiddenBySystem(nativeHandle)
    }

    static func create(dataPath: String) -> RayactEngineSession? {
        let handle = dataPath.withCString { RayactNativeBridge.sessionCreate($0) }
        guard handle != 0 else { return nil }
        let session = RayactEngineSession(handle: handle)
        _ = session.host
        let bridge = RayactHostCallbacksBridge(host: session.host)
        session.hostBridge = bridge
        RayactNativeBridge.sessionRegisterHost(handle, bridge.callbacksPointer)
        return session
    }

    private static func jsonQuote(_ value: String) -> String {
        if let data = try? JSONEncoder().encode(value),
           let quoted = String(data: data, encoding: .utf8) {
            return quoted
        }
        return "\"\(value.replacingOccurrences(of: "\"", with: "\\\""))\""
    }
}
