import UIKit
import QuartzCore
import Metal

private final class RayactImeTextField: UITextField {
    var contextMenuHidden = false

    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        if contextMenuHidden {
            return false
        }
        return super.canPerformAction(action, withSender: sender)
    }
}

private final class RayactSemanticElement: UIAccessibilityElement {
    var activateHandler: (() -> Bool)?

    override func accessibilityActivate() -> Bool {
        activateHandler?() ?? false
    }
}

final class RayactSurfaceView: UIView, UITextFieldDelegate {
    private let session: RayactEngineSession
    private let hiddenTextField = RayactImeTextField()

    private(set) var surfaceId = 0
    var onSurfaceReady: ((Int) -> Void)?

    private var imeNodeId = -1
    private var imeInputType = "text"
    private var imeAutocorrect = false
    private var imeSecure = false
    private var imeAction = "done"
    private var imeAutoCapitalize = "sentences"
    private var imeContextMenuHidden = false
    private var applyingFromNative = false
    private var lastImeHeightDp: Float = -1
    private var lastImeVisible = false
    private var semanticElementCache: [Int: RayactSemanticElement] = [:]

    // Maps each active UITouch to a small, stable pointer index (0,1,2…) so the
    // engine sees the same id scheme as Android's MotionEvent.getPointerId. The
    // raw UITouch.hash is a full-width Int and overflows the Int32 the native
    // bridge expects, which trapped on every touch.
    private var touchPointerIds: [ObjectIdentifier: Int] = [:]

    override class var layerClass: AnyClass { CAMetalLayer.self }

    private var metalLayer: CAMetalLayer { layer as! CAMetalLayer }

    init(session: RayactEngineSession) {
        self.session = session
        super.init(frame: .zero)
        isMultipleTouchEnabled = true
        metalLayer.pixelFormat = .bgra8Unorm
        metalLayer.framebufferOnly = false
        backgroundColor = .black
        isAccessibilityElement = false

        // The field captures IME input but must stay visually invisible. It must
        // NOT use isHidden=true: a hidden UITextField cannot become first
        // responder, so the keyboard never opens and nothing types. Keep it in
        // the hierarchy with zero alpha (and a tiny offscreen frame) instead.
        hiddenTextField.alpha = 0
        hiddenTextField.frame = CGRect(x: -100, y: -100, width: 1, height: 1)
        hiddenTextField.autocorrectionType = .no
        hiddenTextField.delegate = self
        hiddenTextField.addTarget(self, action: #selector(textFieldChanged), for: .editingChanged)
        addSubview(hiddenTextField)
    }

    override var accessibilityElements: [Any]? {
        get {
            guard let data = session.accessibilitySnapshot().data(using: .utf8),
                  let nodes = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                return []
            }
            var liveIds = Set<Int>()
            let elements: [RayactSemanticElement] = nodes.compactMap { node in
                guard let id = node["id"] as? Int else { return nil }
                liveIds.insert(id)
                let element = semanticElementCache[id] ?? RayactSemanticElement(accessibilityContainer: self)
                semanticElementCache[id] = element
                let role = node["role"] as? String ?? ""
                let disabled = node["disabled"] as? Bool ?? false
                element.accessibilityIdentifier = "rayact-\(id)"
                element.accessibilityLabel = node["label"] as? String
                element.accessibilityTraits = accessibilityTraits(role: role, disabled: disabled,
                                                                    selected: node["selected"] as? Bool ?? false)
                if node["hasState"] as? Bool == true {
                    var values: [String] = []
                    if ["checkbox", "radio", "switch"].contains(role) {
                        values.append((node["checked"] as? Bool ?? false) ? "On" : "Off")
                    }
                    if node["expanded"] as? Bool == true { values.append("Expanded") }
                    element.accessibilityValue = values.isEmpty ? nil : values.joined(separator: ", ")
                } else {
                    element.accessibilityValue = nil
                }
                let x = node["x"] as? Double ?? 0
                let y = node["y"] as? Double ?? 0
                let width = max(1, node["w"] as? Double ?? 1)
                let height = max(1, node["h"] as? Double ?? 1)
                element.accessibilityFrameInContainerSpace = CGRect(x: x, y: y, width: width, height: height)
                element.activateHandler = { [weak self] in self?.session.performAccessibilityAction(nodeId: id) ?? false }
                return element
            }
            semanticElementCache = semanticElementCache.filter { liveIds.contains($0.key) }
            return elements
        }
        set { /* The semantic tree is owned by the renderer snapshot. */ }
    }

    private func accessibilityTraits(role: String, disabled: Bool, selected: Bool) -> UIAccessibilityTraits {
        var traits: UIAccessibilityTraits = []
        switch role {
        case "button", "switch": traits.insert(.button)
        case "link": traits.insert(.link)
        case "image": traits.insert(.image)
        case "heading", "header": traits.insert(.header)
        case "searchbox": traits.insert(.searchField)
        case "slider", "spinbutton": traits.insert(.adjustable)
        default: traits.insert(.staticText)
        }
        if disabled { traits.insert(.notEnabled) }
        if selected { traits.insert(.selected) }
        return traits
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            if metalLayer.device == nil {
                metalLayer.device = MTLCreateSystemDefaultDevice()
            }
            updateSafeAreaInsets()
        } else {
            clearIme()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if surfaceId <= 0, bounds.width > 0, bounds.height > 0 {
            createNativeSurface()
        } else if surfaceId > 0 {
            reportSurfaceResize()
        }
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        updateSafeAreaInsets()
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        // Device light/dark toggled — push the new appearance into the engine so
        // raym3's System color scheme re-resolves and JS styles refresh. iOS does
        // not get the macOS appearance notification raym3's watcher uses.
        if traitCollection.userInterfaceStyle != previous?.userInterfaceStyle {
            session.refreshAppearance()
            session.host.renderScheduler.requestFrame()
        }
    }

    func setupForIme(
        nodeId: Int,
        initialText: String,
        inputType: String,
        autocorrect: Bool,
        secure: Bool,
        imeAction: String,
        autoCapitalize: String,
        contextMenuHidden: Bool
    ) {
        imeNodeId = nodeId
        imeInputType = inputType
        imeAutocorrect = autocorrect
        imeSecure = secure
        self.imeAction = imeAction
        imeAutoCapitalize = autoCapitalize
        imeContextMenuHidden = contextMenuHidden
        configureTextField()
        hiddenTextField.text = initialText
        hiddenTextField.becomeFirstResponder()
    }

    func switchIme(
        nodeId: Int,
        initialText: String,
        inputType: String,
        autocorrect: Bool,
        secure: Bool,
        imeAction: String,
        autoCapitalize: String,
        contextMenuHidden: Bool
    ) {
        imeNodeId = nodeId
        imeInputType = inputType
        imeAutocorrect = autocorrect
        imeSecure = secure
        self.imeAction = imeAction
        imeAutoCapitalize = autoCapitalize
        imeContextMenuHidden = contextMenuHidden
        configureTextField()
        hiddenTextField.text = initialText
    }

    func clearIme() {
        imeNodeId = -1
        hiddenTextField.text = ""
        hiddenTextField.resignFirstResponder()
    }

    func updateImeState(
        nodeId: Int,
        text: String?,
        selectionStart: Int,
        selectionEnd: Int,
        composingStart: Int,
        composingEnd: Int
    ) {
        guard imeNodeId == nodeId else { return }
        applyingFromNative = true
        if let text, text != hiddenTextField.text {
            hiddenTextField.text = text
        }
        if let range = textRange(in: hiddenTextField, start: selectionStart, end: selectionEnd) {
            hiddenTextField.selectedTextRange = range
        }
        if let composingRange = textRange(in: hiddenTextField, start: composingStart, end: composingEnd) {
            hiddenTextField.setMarkedText(
                hiddenTextField.text(in: composingRange) ?? "",
                selectedRange: NSRange(location: 0, length: 0)
            )
        } else if hiddenTextField.markedTextRange != nil {
            hiddenTextField.unmarkText()
        }
        applyingFromNative = false
    }

    func syncSurfaceSizeFromLayout() {
        setNeedsLayout()
        layoutIfNeeded()
        if bounds.width > 0, bounds.height > 0 {
            reportSurfaceResize()
        }
    }

    func pushToFront() {
        if surfaceId > 0 { session.pushSurface(surfaceId) }
    }

    func popFromFront() -> Bool {
        if surfaceId > 0, session.getFocusedSurfaceId() == surfaceId {
            return session.popSurface() != 0
        }
        return false
    }

    func performHapticFeedback() {
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        forwardTouches(touches, action: RayactEngineSession.TOUCH_DOWN)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        forwardTouches(touches, action: RayactEngineSession.TOUCH_MOVE)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        forwardTouches(touches, action: RayactEngineSession.TOUCH_UP)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        forwardTouches(touches, action: RayactEngineSession.TOUCH_UP)
    }

    private func forwardTouches(_ touches: Set<UITouch>, action: Int) {
        guard surfaceId > 0, session.getFocusedSurfaceId() == surfaceId else { return }
        // The engine consumes touch positions in physical pixels (it divides by
        // platform density to get dp), so scale points up by the layer's scale —
        // matching Android, which forwards MotionEvent px coordinates.
        let scale = Float(window?.screen.nativeScale ?? UIScreen.main.nativeScale)
        for touch in touches {
            let point = touch.location(in: self)
            let pointerId = pointerId(for: touch, action: action)
            session.nativeTouch(action: action, id: pointerId, x: Float(point.x) * scale, y: Float(point.y) * scale)
        }
        session.host.renderScheduler.requestFrame()
    }

    private func pointerId(for touch: UITouch, action: Int) -> Int {
        let key = ObjectIdentifier(touch)
        if let existing = touchPointerIds[key] {
            if action == RayactEngineSession.TOUCH_UP { touchPointerIds[key] = nil }
            return existing
        }
        // Assign the smallest unused index so the first finger down is always 0.
        var id = 0
        let used = Set(touchPointerIds.values)
        while used.contains(id) { id += 1 }
        if action != RayactEngineSession.TOUCH_UP { touchPointerIds[key] = id }
        return id
    }

    @objc private func textFieldChanged() {
        syncTextToNative()
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        if imeNodeId == -2 {
            session.keyEvent(type: 0, key: "Enter", code: "Enter")
            return false
        }
        syncTextToNative()
        session.nativeSubmitTextInput()
        return true
    }

    private func configureTextField() {
        switch imeInputType {
        case "email":
            hiddenTextField.keyboardType = .emailAddress
            hiddenTextField.isSecureTextEntry = false
        case "number":
            hiddenTextField.keyboardType = .numberPad
            hiddenTextField.isSecureTextEntry = false
        case "phone":
            hiddenTextField.keyboardType = .phonePad
            hiddenTextField.isSecureTextEntry = false
        case "url":
            hiddenTextField.keyboardType = .URL
            hiddenTextField.isSecureTextEntry = false
        case "ascii", "visible-password":
            hiddenTextField.keyboardType = .asciiCapable
            hiddenTextField.isSecureTextEntry = false
        case "password":
            hiddenTextField.keyboardType = .default
            hiddenTextField.isSecureTextEntry = true
        default:
            hiddenTextField.keyboardType = .default
            hiddenTextField.isSecureTextEntry = imeSecure
        }
        switch imeAutoCapitalize {
        case "none": hiddenTextField.autocapitalizationType = .none
        case "words": hiddenTextField.autocapitalizationType = .words
        case "characters": hiddenTextField.autocapitalizationType = .allCharacters
        default: hiddenTextField.autocapitalizationType = .sentences
        }
        let correctionsEnabled = imeAutocorrect && !imeSecure
        hiddenTextField.autocorrectionType = correctionsEnabled ? .default : .no
        hiddenTextField.spellCheckingType = correctionsEnabled ? .default : .no
        hiddenTextField.smartDashesType = correctionsEnabled ? .default : .no
        hiddenTextField.smartQuotesType = correctionsEnabled ? .default : .no
        hiddenTextField.smartInsertDeleteType = correctionsEnabled ? .default : .no
        hiddenTextField.contextMenuHidden = imeContextMenuHidden
        switch imeAction {
        case "go": hiddenTextField.returnKeyType = .go
        case "next": hiddenTextField.returnKeyType = .next
        case "send": hiddenTextField.returnKeyType = .send
        case "search": hiddenTextField.returnKeyType = .search
        default: hiddenTextField.returnKeyType = .done
        }
    }

    private func syncTextToNative() {
        guard !applyingFromNative, imeNodeId != -1 else { return }
        let text = hiddenTextField.text ?? ""
        let start = hiddenTextField.offset(from: hiddenTextField.beginningOfDocument, to: hiddenTextField.selectedTextRange?.start ?? hiddenTextField.endOfDocument)
        let end = hiddenTextField.offset(from: hiddenTextField.beginningOfDocument, to: hiddenTextField.selectedTextRange?.end ?? hiddenTextField.endOfDocument)
        let composingStart: Int
        let composingEnd: Int
        if let marked = hiddenTextField.markedTextRange {
            composingStart = hiddenTextField.offset(from: hiddenTextField.beginningOfDocument, to: marked.start)
            composingEnd = hiddenTextField.offset(from: hiddenTextField.beginningOfDocument, to: marked.end)
        } else {
            composingStart = -1
            composingEnd = -1
        }
        session.nativeSetTextInputContent(
            nodeId: imeNodeId,
            text: text,
            selectionStart: start,
            selectionEnd: end,
            composingStart: composingStart,
            composingEnd: composingEnd
        )
        session.host.renderScheduler.requestFrame()
    }

    private func createNativeSurface() {
        let scale = Float(window?.screen.nativeScale ?? UIScreen.main.nativeScale)
        let density = scale
        let widthPx = Int(bounds.width * CGFloat(scale))
        let heightPx = Int(bounds.height * CGFloat(scale))
        metalLayer.contentsScale = CGFloat(scale)
        metalLayer.drawableSize = CGSize(width: CGFloat(widthPx), height: CGFloat(heightPx))
        let layerPtr = Unmanaged.passUnretained(metalLayer).toOpaque()
        let sid = session.createSurface(
            metalLayer: layerPtr,
            density: density,
            widthPx: widthPx,
            heightPx: heightPx,
            scale: scale
        )
        guard sid > 0 else {
            print("[RayactSurfaceView] createSurface failed")
            return
        }
        surfaceId = sid
        onSurfaceReady?(sid)
        onSurfaceReady = nil
        session.host.registerImeView(self)
        session.host.renderScheduler.retainSurface()
        session.host.renderScheduler.requestFrame()
        observeKeyboard()
    }

    private func observeKeyboard() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardChanged(_:)),
            name: UIResponder.keyboardWillChangeFrameNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardHidden(_:)),
            name: UIResponder.keyboardWillHideNotification,
            object: nil
        )
    }

    @objc private func keyboardChanged(_ note: Notification) {
        guard let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
              window != nil else { return }
        let keyboardInView = convert(frame, from: nil)
        let overlap = max(0, bounds.maxY - keyboardInView.minY)
        // overlap is in points; engine/JS keyboard height is dp (== points on iOS).
        let heightDp = Float(overlap)
        let visible = overlap > 0
        if visible == lastImeVisible, heightDp == lastImeHeightDp { return }
        lastImeVisible = visible
        lastImeHeightDp = heightDp
        let duration = Float(note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25) * 1000
        session.setKeyboardInsets(heightDp: heightDp, visible: visible, durationMs: duration)
        session.host.renderScheduler.requestFrame()
    }

    @objc private func keyboardHidden(_ note: Notification) {
        if imeNodeId >= 0 {
            session.nativeImeHiddenBySystem()
            imeNodeId = -1
            hiddenTextField.text = ""
        }
        lastImeVisible = false
        lastImeHeightDp = 0
        session.setKeyboardInsets(heightDp: 0, visible: false, durationMs: 250)
        session.host.renderScheduler.requestFrame()
    }

    private func forwardKeyboardPresses(_ presses: Set<UIPress>, type: Int32) {
        for press in presses {
            guard let uiKey = press.key else { continue }
            let raw = uiKey.charactersIgnoringModifiers
            let key: String
            switch raw {
            case UIKeyCommand.inputUpArrow: key = "ArrowUp"
            case UIKeyCommand.inputDownArrow: key = "ArrowDown"
            case UIKeyCommand.inputLeftArrow: key = "ArrowLeft"
            case UIKeyCommand.inputRightArrow: key = "ArrowRight"
            case "\r", "\n": key = "Enter"
            case "\t": key = "Tab"
            case "\u{8}": key = "Backspace"
            case "\u{7f}": key = "Delete"
            case "\u{1b}": key = "Escape"
            default: key = raw
            }
            session.keyEvent(type: type, key: key, code: "", modifiers: uiKey.modifierFlags)
            if type == 0 && raw.count == 1 &&
                !uiKey.modifierFlags.contains(.control) &&
                !uiKey.modifierFlags.contains(.command) &&
                !uiKey.modifierFlags.contains(.alternate) {
                session.keyEvent(type: 2, key: "", code: "", text: uiKey.characters, modifiers: uiKey.modifierFlags)
            }
        }
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        forwardKeyboardPresses(presses, type: 0)
        super.pressesBegan(presses, with: event)
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        forwardKeyboardPresses(presses, type: 1)
        super.pressesEnded(presses, with: event)
    }

    private func updateSafeAreaInsets() {
        // UIView safeAreaInsets are in points. The engine's layout space is dp,
        // and on iOS dp == points (PxToDp divides px by the native scale, and
        // px = points·scale), so insets must be sent in points — NOT divided by
        // the scale. Dividing previously made <SafeAreaView> under-pad the notch
        // and home indicator by ~1/scale.
        let insets = safeAreaInsets
        session.setSafeAreaInsets(
            top: Float(insets.top),
            right: Float(insets.right),
            bottom: Float(insets.bottom),
            left: Float(insets.left)
        )
        session.host.renderScheduler.requestFrame()
    }

    private func reportSurfaceResize() {
        guard surfaceId > 0, bounds.width > 0, bounds.height > 0 else { return }
        updateSafeAreaInsets()
        let scale = Float(window?.screen.nativeScale ?? UIScreen.main.nativeScale)
        let widthPx = Int(bounds.width * CGFloat(scale))
        let heightPx = Int(bounds.height * CGFloat(scale))
        session.resizeSurface(surfaceId: surfaceId, width: widthPx, height: heightPx, density: scale)
        session.host.renderScheduler.requestFrame()
    }

    deinit {
        if surfaceId > 0 {
            session.host.unregisterImeView(self)
            session.destroySurface(surfaceId)
            session.host.renderScheduler.releaseSurface()
        }
        NotificationCenter.default.removeObserver(self)
    }

    private func textRange(in field: UITextField, start: Int, end: Int) -> UITextRange? {
        guard let begin = field.position(from: field.beginningOfDocument, offset: start),
              let endPos = field.position(from: field.beginningOfDocument, offset: end) else { return nil }
        return field.textRange(from: begin, to: endPos)
    }
}
