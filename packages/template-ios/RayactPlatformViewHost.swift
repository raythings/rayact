import UIKit
import Metal
import QuartzCore

@_silgen_name("rlmtRegisterSurface")
private func rlmtRegisterSurface(
    _ surfaceId: UInt64, _ layer: UnsafeMutableRawPointer?,
    _ width: Int32, _ height: Int32
) -> Bool

@_silgen_name("rlmtResizeRegisteredSurface")
private func rlmtResizeRegisteredSurface(
    _ surfaceId: UInt64, _ width: Int32, _ height: Int32)

@_silgen_name("rlmtSelectSurface")
private func rlmtSelectSurface(_ surfaceId: UInt64) -> Bool

@_silgen_name("rlmtUnregisterSurface")
private func rlmtUnregisterSurface(_ surfaceId: UInt64)

private final class RayactMetalOverlayView: UIView {
    override class var layerClass: AnyClass { CAMetalLayer.self }
    var metalLayer: CAMetalLayer { layer as! CAMetalLayer }
    var registeredSurfaceId: UInt64 = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isOpaque = false
        backgroundColor = .clear
        metalLayer.pixelFormat = .bgra8Unorm
        metalLayer.framebufferOnly = true
        metalLayer.isOpaque = false
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}

private final class RayactTouchForwardingRecognizer: UIGestureRecognizer {
    weak var session: RayactEngineSession?
    weak var coordinateView: UIView?
    private var pointerIds: [ObjectIdentifier: Int] = [:]

    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool {
        false
    }

    override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool {
        false
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        forward(touches, action: RayactEngineSession.TOUCH_DOWN)
        state = .began
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        forward(touches, action: RayactEngineSession.TOUCH_MOVE)
        state = .changed
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        forward(touches, action: RayactEngineSession.TOUCH_UP)
        state = .ended
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        // Cancellation remains distinct all the way to raym3.
        forward(touches, action: RayactEngineSession.TOUCH_CANCEL)
        state = .cancelled
    }

    private func forward(_ touches: Set<UITouch>, action: Int) {
        guard let session, let coordinateView else { return }
        let scale = Float(coordinateView.window?.screen.nativeScale ?? UIScreen.main.nativeScale)
        for touch in touches {
            let key = ObjectIdentifier(touch)
            let id = pointerIds[key] ?? nextPointerId()
            pointerIds[key] = id
            let point = touch.location(in: coordinateView)
            session.nativeTouch(
                action: action, id: id,
                x: Float(point.x) * scale, y: Float(point.y) * scale)
            if action == RayactEngineSession.TOUCH_UP ||
                action == RayactEngineSession.TOUCH_CANCEL {
                pointerIds[key] = nil
            }
        }
    }

    private func nextPointerId() -> Int {
        let used = Set(pointerIds.values)
        var result = 0
        while used.contains(result) { result += 1 }
        return result
    }
}

private final class RayactDelayingGestureRecognizer: UIGestureRecognizer {
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        // Stay possible: UIKit retains the original UITouch set for the native
        // descendant while raym3 resolves controls-versus-scroll-versus-native.
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {}

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        if state == .possible { state = .failed }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        state = .cancelled
    }

    func resolve(accepted: Bool) {
        guard state == .possible else { return }
        if accepted {
            // Failing the delaying recognizer releases UIKit's original
            // touches, preserving multi-touch identity and timing.
            state = .failed
        } else {
            // Winning cancels delivery to the embedded view.
            state = .began
            state = .ended
        }
    }
}

private final class RayactPlatformMutatorView: UIView {
    let interceptingView = UIView()
    let forwardingRecognizer = RayactTouchForwardingRecognizer()
    let delayingRecognizer = RayactDelayingGestureRecognizer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = false
        interceptingView.frame = bounds
        interceptingView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(interceptingView)
        forwardingRecognizer.cancelsTouchesInView = false
        forwardingRecognizer.delaysTouchesBegan = false
        interceptingView.addGestureRecognizer(forwardingRecognizer)
        delayingRecognizer.delaysTouchesBegan = true
        delayingRecognizer.cancelsTouchesInView = true
        interceptingView.addGestureRecognizer(delayingRecognizer)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}

final class RayactPlatformViewHost {
    private struct Entry {
        let controller: RayactPlatformViewController
        let mutatorView: RayactPlatformMutatorView
        var seenThisFrame = false
    }

    private unowned let owner: RayactSurfaceView
    private unowned let session: RayactEngineSession
    private var entries: [Int: Entry] = [:]
    private var pendingPropertyBatches: [Int: [String]] = [:]
    private var overlayPool: [RayactMetalOverlayView] = []
    private var orderedViews: [UIView] = []
    private var overlayCursor = 0
    private var frameDensity: Float = 1
    private var frameSize = CGSize.zero

    init(owner: RayactSurfaceView, session: RayactEngineSession) {
        self.owner = owner
        self.session = session
    }

    func create(nodeId: Int, kind: String, propertiesJson: String) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard entries[nodeId] == nil else { return }
        let properties = jsonObject(propertiesJson)
        guard let controller = RayactPlatformRegistry.shared.makeViewController(
            kind, nodeId: nodeId, properties: properties,
            emit: { [weak session] payload in
                session?.nativeExternalViewEvent(nodeId: nodeId, payload: payload)
            }
        ) else {
            print("[rayact-ios] no platform-view factory registered for '\(kind)'")
            return
        }

        let mutator = RayactPlatformMutatorView()
        mutator.isAccessibilityElement = false
        mutator.forwardingRecognizer.session = session
        mutator.forwardingRecognizer.coordinateView = owner
        controller.view.frame = mutator.interceptingView.bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        mutator.interceptingView.addSubview(controller.view)
        owner.addSubview(mutator)
        mutator.isHidden = true
        entries[nodeId] = Entry(controller: controller, mutatorView: mutator)
        let pending = pendingPropertyBatches.removeValue(forKey: nodeId) ?? []
        for batch in pending {
            setProperties(nodeId: nodeId, propertiesJson: batch)
        }
        session.host.renderScheduler.requestFrame()
    }

    func setProperties(nodeId: Int, propertiesJson: String) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard let controller = entries[nodeId]?.controller else {
            pendingPropertyBatches[nodeId, default: []].append(propertiesJson)
            return
        }
        let values: [String: Any?] = Dictionary(uniqueKeysWithValues:
            jsonObject(propertiesJson).map {
                ($0.key, $0.value is NSNull ? nil : Optional($0.value))
            })
        controller.setProperties(values)
    }

    func dispose(nodeId: Int) {
        dispatchPrecondition(condition: .onQueue(.main))
        pendingPropertyBatches[nodeId] = nil
        guard let entry = entries.removeValue(forKey: nodeId) else { return }
        entry.controller.dispose()
        entry.mutatorView.removeFromSuperview()
    }

    func beginFrame(width: Float, height: Float, density: Float) {
        dispatchPrecondition(condition: .onQueue(.main))
        frameDensity = max(1, density)
        frameSize = CGSize(width: CGFloat(width), height: CGFloat(height))
        overlayCursor = 0
        orderedViews.removeAll(keepingCapacity: true)
        for key in entries.keys {
            entries[key]?.seenThisFrame = false
        }
    }

    func composite(nodeId: Int, compositionJson: String) -> Bool {
        dispatchPrecondition(condition: .onQueue(.main))
        guard var entry = entries[nodeId],
              let data = compositionJson.data(using: .utf8),
              let composition = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let bounds = composition["bounds"] as? [String: Any] else {
            return false
        }

        let frame = CGRect(
            x: number(bounds["x"]), y: number(bounds["y"]),
            width: max(0, number(bounds["width"])),
            height: max(0, number(bounds["height"])))
        entry.mutatorView.frame = frame
        entry.mutatorView.alpha = 1
        entry.mutatorView.transform = .identity
        entry.mutatorView.layer.mask = nil
        entry.mutatorView.isHidden = false
        entry.seenThisFrame = true

        let hitTest = composition["hitTestBehavior"] as? String ?? "opaque"
        entry.mutatorView.isUserInteractionEnabled = hitTest != "transparent"
        applyMutators(composition["mutators"] as? [[String: Any]] ?? [], to: entry.mutatorView)
        entries[nodeId] = entry
        orderedViews.append(entry.mutatorView)

        let overlay = acquireOverlay(index: overlayCursor)
        overlayCursor += 1
        orderedViews.append(overlay)
        return rlmtSelectSurface(overlay.registeredSurfaceId)
    }

    func endFrame() {
        dispatchPrecondition(condition: .onQueue(.main))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (nodeId, entry) in entries {
            if !entry.seenThisFrame {
                entries[nodeId]?.mutatorView.isHidden = true
            }
        }
        for (index, overlay) in overlayPool.enumerated() {
            overlay.isHidden = index >= overlayCursor
        }
        for view in orderedViews { owner.bringSubviewToFront(view) }
        owner.bringHiddenTextFieldToFront()
        CATransaction.commit()
    }

    func resolveGesture(nodeId: Int, accepted: Bool) {
        entries[nodeId]?.mutatorView.delayingRecognizer.resolve(
            accepted: accepted)
    }

    func resizeOverlays() {
        let scale = CGFloat(frameDensity)
        let width = Int32(max(1, owner.bounds.width * scale))
        let height = Int32(max(1, owner.bounds.height * scale))
        for overlay in overlayPool {
            overlay.frame = owner.bounds
            overlay.metalLayer.contentsScale = scale
            overlay.metalLayer.drawableSize = CGSize(
                width: CGFloat(width), height: CGFloat(height))
            rlmtResizeRegisteredSurface(overlay.registeredSurfaceId, width, height)
        }
    }

    func disposeAll() {
        for nodeId in Array(entries.keys) { dispose(nodeId: nodeId) }
        pendingPropertyBatches.removeAll()
        for overlay in overlayPool {
            if overlay.registeredSurfaceId != 0 {
                rlmtUnregisterSurface(overlay.registeredSurfaceId)
            }
            overlay.removeFromSuperview()
        }
        overlayPool.removeAll()
    }

    private func acquireOverlay(index: Int) -> RayactMetalOverlayView {
        if index == overlayPool.count {
            let overlay = RayactMetalOverlayView(frame: owner.bounds)
            overlay.metalLayer.device = (owner.layer as? CAMetalLayer)?.device ?? MTLCreateSystemDefaultDevice()
            let sid = (UInt64(UInt32(owner.surfaceId)) << 32) | UInt64(index + 1)
            overlay.registeredSurfaceId = sid
            owner.addSubview(overlay)
            overlayPool.append(overlay)
            let scale = CGFloat(frameDensity)
            let width = Int32(max(1, owner.bounds.width * scale))
            let height = Int32(max(1, owner.bounds.height * scale))
            overlay.metalLayer.contentsScale = scale
            overlay.metalLayer.drawableSize = CGSize(
                width: CGFloat(width), height: CGFloat(height))
            _ = rlmtRegisterSurface(
                sid, Unmanaged.passUnretained(overlay.metalLayer).toOpaque(),
                width, height)
            if overlayPool.count > 2 {
                print("[rayact-ios] warning: \(overlayPool.count) full-screen platform-view overlays on surface \(owner.surfaceId)")
            }
        }
        let overlay = overlayPool[index]
        overlay.frame = owner.bounds
        overlay.isHidden = false
        return overlay
    }

    private func applyMutators(
        _ mutators: [[String: Any]], to view: RayactPlatformMutatorView
    ) {
        var opacity: CGFloat = 1
        var clipRect: CGRect?
        var clipRadius: CGFloat = 0
        for mutator in mutators {
            switch mutator["kind"] as? String {
            case "opacity":
                opacity *= number(mutator["opacity"])
            case "clipRect", "clipRoundedRect":
                guard let value = mutator["rect"] as? [String: Any] else { continue }
                let global = CGRect(
                    x: number(value["x"]), y: number(value["y"]),
                    width: number(value["width"]), height: number(value["height"]))
                let local = global.offsetBy(dx: -view.frame.minX, dy: -view.frame.minY)
                let radius = number(mutator["radius"])
                clipRect = clipRect.map { $0.intersection(local) } ?? local
                clipRadius = max(clipRadius, radius)
            case "transform":
                guard let values = mutator["matrix"] as? [NSNumber], values.count == 9 else { continue }
                // The first mutator is the ambient dp→pixel density transform;
                // UIKit already maps points to backing pixels, so ignore that
                // pure scale and apply only authored affine transforms.
                let a = CGFloat(truncating: values[0])
                let b = CGFloat(truncating: values[3])
                let c = CGFloat(truncating: values[1])
                let d = CGFloat(truncating: values[4])
                let tx = CGFloat(truncating: values[2])
                let ty = CGFloat(truncating: values[5])
                if abs(a - CGFloat(frameDensity)) > 0.001 ||
                    abs(d - CGFloat(frameDensity)) > 0.001 ||
                    abs(b) > 0.001 || abs(c) > 0.001 || abs(tx) > 0.001 || abs(ty) > 0.001 {
                    view.transform = view.transform.concatenating(
                        CGAffineTransform(a: a, b: b, c: c, d: d, tx: tx, ty: ty))
                }
            default:
                break
            }
        }
        view.alpha = opacity
        if let clipRect {
            // A mask layer only passes content inside its OWN frame, so a mask
            // sized to the platform view clipped everything the view draws
            // outside its bounds — which is exactly where UIKit puts the text
            // selection handles (they hang below the line box). Size the mask
            // to cover the ancestor clip as well and keep the path as the real
            // clip, so the handles survive while the ancestor clip still wins.
            let maskFrame = view.bounds.union(clipRect)
            let mask = CAShapeLayer()
            mask.frame = maskFrame
            mask.path = UIBezierPath(
                roundedRect: clipRect.offsetBy(
                    dx: -maskFrame.minX, dy: -maskFrame.minY),
                cornerRadius: clipRadius).cgPath
            view.layer.mask = mask
        }
    }

    private func jsonObject(_ value: String) -> [String: Any] {
        guard let data = value.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return object
    }

    private func number(_ value: Any?) -> CGFloat {
        if let number = value as? NSNumber { return CGFloat(truncating: number) }
        return 0
    }
}
