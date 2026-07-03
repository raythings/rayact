import Foundation

typealias RayactIOSHandle = Int64

struct RayactIOSHostCallbacks {
    var context: UnsafeMutableRawPointer?
    var requestNewSurface: (@convention(c) (UnsafeMutableRawPointer?) -> Int32)?
    var rootSurfaceId: (@convention(c) (UnsafeMutableRawPointer?) -> Int32)?
    var topSurfaceId: (@convention(c) (UnsafeMutableRawPointer?) -> Int32)?
    var releaseTopSurface: (@convention(c) (UnsafeMutableRawPointer?) -> Void)?
    var releaseSurface: (@convention(c) (UnsafeMutableRawPointer?, Int32) -> Void)?
    var orderSurfaces: (@convention(c) (UnsafeMutableRawPointer?, UnsafePointer<Int32>?, Int32) -> Void)?
    var requestRenderFrame: (@convention(c) (UnsafeMutableRawPointer?) -> Void)?
    var toggleDevMenu: (@convention(c) (UnsafeMutableRawPointer?) -> Void)?
    var performHapticFeedback: (@convention(c) (UnsafeMutableRawPointer?) -> Void)?
    var hideSoftKeyboard: (@convention(c) (UnsafeMutableRawPointer?) -> Void)?
    var finishActivity: (@convention(c) (UnsafeMutableRawPointer?) -> Void)?
    var stopRenderScheduler: (@convention(c) (UnsafeMutableRawPointer?) -> Void)?
    var showSoftKeyboard: (@convention(c) (UnsafeMutableRawPointer?, Int32, UnsafePointer<CChar>?, UnsafePointer<CChar>?, Bool, Bool, UnsafePointer<CChar>?) -> Void)?
    var switchIme: (@convention(c) (UnsafeMutableRawPointer?, Int32, UnsafePointer<CChar>?, UnsafePointer<CChar>?, Bool, Bool, UnsafePointer<CChar>?) -> Void)?
    var copyToClipboard: (@convention(c) (UnsafeMutableRawPointer?, UnsafePointer<CChar>?) -> Void)?
    var readClipboard: (@convention(c) (UnsafeMutableRawPointer?) -> UnsafePointer<CChar>?)?
    var updateImeState: (@convention(c) (UnsafeMutableRawPointer?, Int32, Int32, Int32, Int32, Int32, UnsafePointer<CChar>?) -> Void)?
}

enum RayactNativeBridge {
    typealias DevCallFn = @convention(c) (UnsafePointer<CChar>?, UnsafePointer<CChar>?) -> UnsafePointer<CChar>?
    typealias DevFetchFn = @convention(c) (UnsafePointer<CChar>?) -> UnsafePointer<CChar>?

    @_silgen_name("RayactIOSSetDevCallbacks")
    static func setDevCallbacks(_ devCall: DevCallFn?, _ devFetch: DevFetchFn?)

    @_silgen_name("RayactIOSSessionCreate")
    static func sessionCreate(_ dataPath: UnsafePointer<CChar>?) -> RayactIOSHandle

    @_silgen_name("RayactIOSSessionDestroy")
    static func sessionDestroy(_ handle: RayactIOSHandle)

    @_silgen_name("RayactIOSSessionRegisterHost")
    static func sessionRegisterHost(_ handle: RayactIOSHandle, _ callbacks: UnsafePointer<RayactIOSHostCallbacks>?)

    @_silgen_name("RayactIOSSessionAcquireGraphics")
    static func sessionAcquireGraphics(_ handle: RayactIOSHandle) -> Bool

    @_silgen_name("RayactIOSSessionReleaseGraphics")
    static func sessionReleaseGraphics(_ handle: RayactIOSHandle)

    @_silgen_name("RayactIOSSessionLoadScript")
    static func sessionLoadScript(_ handle: RayactIOSHandle, _ mode: Int32, _ arg: UnsafePointer<CChar>?) -> Bool

    @_silgen_name("RayactIOSSessionLoadBytecode")
    static func sessionLoadBytecode(_ handle: RayactIOSHandle, _ bytes: UnsafePointer<UInt8>?, _ len: Int32) -> Bool

    @_silgen_name("RayactIOSSessionApplyModuleUpdate")
    static func sessionApplyModuleUpdate(_ handle: RayactIOSHandle, _ path: UnsafePointer<CChar>?, _ source: UnsafePointer<CChar>?) -> Bool

    @_silgen_name("RayactIOSSessionToggleDevMenu")
    static func sessionToggleDevMenu(_ handle: RayactIOSHandle)

    @_silgen_name("RayactIOSSessionCreateSurface")
    static func sessionCreateSurface(
        _ handle: RayactIOSHandle,
        _ metalLayer: UnsafeMutableRawPointer?,
        _ density: Float,
        _ widthPx: Int32,
        _ heightPx: Int32,
        _ scale: Float
    ) -> Int32

    @_silgen_name("RayactIOSSessionResizeSurface")
    static func sessionResizeSurface(_ handle: RayactIOSHandle, _ surfaceId: Int32, _ width: Int32, _ height: Int32, _ density: Float)

    @_silgen_name("RayactIOSSessionRelayoutOnSurfaceResizeEnabled")
    static func sessionRelayoutOnSurfaceResizeEnabled(_ handle: RayactIOSHandle) -> Bool

    @_silgen_name("RayactIOSSessionSetSafeAreaInsets")
    static func sessionSetSafeAreaInsets(_ handle: RayactIOSHandle, _ top: Float, _ right: Float, _ bottom: Float, _ left: Float)

    @_silgen_name("RayactIOSSessionSetKeyboardInsets")
    static func sessionSetKeyboardInsets(_ handle: RayactIOSHandle, _ heightDp: Float, _ visible: Bool, _ durationMs: Float)

    @_silgen_name("RayactIOSSessionDestroySurface")
    static func sessionDestroySurface(_ handle: RayactIOSHandle, _ surfaceId: Int32)

    @_silgen_name("RayactIOSSessionPushSurface")
    static func sessionPushSurface(_ handle: RayactIOSHandle, _ surfaceId: Int32)

    @_silgen_name("RayactIOSSessionPopSurface")
    static func sessionPopSurface(_ handle: RayactIOSHandle) -> Int32

    @_silgen_name("RayactIOSSessionGetFocusedSurfaceId")
    static func sessionGetFocusedSurfaceId(_ handle: RayactIOSHandle) -> Int32

    @_silgen_name("RayactIOSSessionRenderFrame")
    static func sessionRenderFrame(_ handle: RayactIOSHandle, _ frameTimeNanos: Int64, _ deltaNanos: Int64) -> Bool

    @_silgen_name("RayactIOSSessionNextJSTimerDelayMs")
    static func sessionNextJSTimerDelayMs(_ handle: RayactIOSHandle) -> Float

    @_silgen_name("RayactIOSSessionTouch")
    static func sessionTouch(_ handle: RayactIOSHandle, _ action: Int32, _ id: Int32, _ x: Float, _ y: Float)

    @_silgen_name("RayactIOSSessionOnBackPressed")
    static func sessionOnBackPressed(_ handle: RayactIOSHandle)

    @_silgen_name("RayactIOSSessionRefreshAppearance")
    static func sessionRefreshAppearance(_ handle: RayactIOSHandle)

    @_silgen_name("RayactIOSSessionSetTextInputContent")
    static func sessionSetTextInputContent(
        _ handle: RayactIOSHandle,
        _ nodeId: Int32,
        _ text: UnsafePointer<CChar>?,
        _ selectionStart: Int32,
        _ selectionEnd: Int32,
        _ composingStart: Int32,
        _ composingEnd: Int32
    )

    @_silgen_name("RayactIOSSessionBlurTextInput")
    static func sessionBlurTextInput(_ handle: RayactIOSHandle)

    @_silgen_name("RayactIOSSessionImeHiddenBySystem")
    static func sessionImeHiddenBySystem(_ handle: RayactIOSHandle)
}
