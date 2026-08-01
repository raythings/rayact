import UIKit

private let rayactNativeTextInputKind = "rayact.internal.text-input"

func registerRayactNativeTextInput(with registry: RayactPlatformRegistry) {
    registry.registerViewFactory(rayactNativeTextInputKind) { context in
        RayactNativeTextInputController(context: context)
    }
}

private final class RayactNativeField: UITextField {
    var contextMenuHidden = false
    var caretHidden = false

    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        contextMenuHidden ? false : super.canPerformAction(action, withSender: sender)
    }

    override func caretRect(for position: UITextPosition) -> CGRect {
        caretHidden ? .zero : super.caretRect(for: position)
    }
}

private final class RayactNativeTextView: UITextView {
    var contextMenuHidden = false
    var caretHidden = false

    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        contextMenuHidden ? false : super.canPerformAction(action, withSender: sender)
    }

    override func caretRect(for position: UITextPosition) -> CGRect {
        caretHidden ? .zero : super.caretRect(for: position)
    }
}

private final class RayactNativeEditorContainer: UIView {
    let field = RayactNativeField()
    let textView = RayactNativeTextView()
    let placeholder = UILabel()
    var multiline = false {
        didSet {
            field.isHidden = multiline
            textView.isHidden = !multiline
            placeholder.isHidden = !multiline || !textView.text.isEmpty
            setNeedsLayout()
        }
    }
    var contentTop: CGFloat = 0 {
        didSet { setNeedsLayout() }
    }
    var contentBottom: CGFloat = 0 {
        didSet { setNeedsLayout() }
    }
    var contentHorizontal: CGFloat = 16 {
        didSet { setNeedsLayout() }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        backgroundColor = .clear
        field.borderStyle = .none
        field.backgroundColor = .clear
        field.clearButtonMode = .never
        textView.backgroundColor = .clear
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        placeholder.numberOfLines = 1
        addSubview(field)
        addSubview(textView)
        addSubview(placeholder)
        multiline = false
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let editorBounds = bounds.inset(by: UIEdgeInsets(
            top: contentTop,
            left: contentHorizontal,
            bottom: contentBottom,
            right: contentHorizontal))
        field.frame = editorBounds
        textView.frame = editorBounds
        placeholder.frame = CGRect(
            x: textView.frame.minX,
            y: textView.frame.minY,
            width: textView.frame.width,
            height: max(20, placeholder.intrinsicContentSize.height))
    }
}

private final class RayactNativeTextInputController:
    NSObject, RayactPlatformViewController, UITextFieldDelegate, UITextViewDelegate
{
    let view: UIView
    private let container = RayactNativeEditorContainer()
    private let context: RayactPlatformViewContext
    private var applyingProperties = false
    private var blurOnSubmit = true
    private var selectTextOnFocus = false
    private var maxLength: Int?
    private var placeholderColor: UIColor?
    private var placeholderText = ""
    private var hasLabel = false

    init(context: RayactPlatformViewContext) {
        self.context = context
        view = container
        super.init()
        container.field.delegate = self
        container.textView.delegate = self
        container.field.addTarget(self, action: #selector(fieldChanged), for: .editingChanged)
        container.field.addTarget(self, action: #selector(fieldEditingBegan), for: .editingDidBegin)
        container.field.addTarget(self, action: #selector(fieldEditingEnded), for: .editingDidEnd)
        setProperties(context.initialProperties.mapValues(Optional.some))
    }

    func setProperties(_ properties: [String: Any?]) {
        applyingProperties = true
        defer { applyingProperties = false }
        for (key, raw) in properties {
            switch key {
            case "value":
                setValue(raw as? String ?? "")
            case "placeholder":
                placeholderText = raw as? String ?? ""
                applyEditorPlaceholder()
            case "hasLabel":
                hasLabel = bool(raw)
                applyEditorPlaceholder()
            case "inputType":
                applyInputType(raw as? String)
            case "imeAction":
                let type = returnKeyType(raw as? String)
                container.field.returnKeyType = type
                container.textView.returnKeyType = type
            case "autoCapitalize":
                let type = capitalization(raw as? String)
                container.field.autocapitalizationType = type
                container.textView.autocapitalizationType = type
            case "autocorrect":
                let type: UITextAutocorrectionType = bool(raw, fallback: true) ? .default : .no
                container.field.autocorrectionType = type
                container.textView.autocorrectionType = type
            case "autoComplete":
                applyContentType(raw as? String)
            case "secure":
                container.field.isSecureTextEntry = bool(raw)
            case "editable":
                let enabled = bool(raw, fallback: true)
                container.field.isEnabled = enabled
                container.textView.isEditable = enabled
            case "multiline":
                let wasFocused = activeEditor.isFirstResponder
                activeEditor.resignFirstResponder()
                container.multiline = bool(raw)
                if wasFocused { activeEditor.becomeFirstResponder() }
            case "maxLength":
                maxLength = (raw as? NSNumber)?.intValue
            case "selectTextOnFocus":
                selectTextOnFocus = bool(raw)
            case "caretHidden":
                let hidden = bool(raw)
                container.field.caretHidden = hidden
                container.textView.caretHidden = hidden
            case "contextMenuHidden":
                let hidden = bool(raw)
                container.field.contextMenuHidden = hidden
                container.textView.contextMenuHidden = hidden
            case "blurOnSubmit":
                blurOnSubmit = bool(raw, fallback: !container.multiline)
            case "selectionStart", "selectionEnd":
                applySelection(properties)
            case "textColor":
                if let color = color(raw) {
                    container.field.textColor = color
                    container.textView.textColor = color
                }
            case "placeholderColor":
                if let color = color(raw) {
                    placeholderColor = color
                    applyEditorPlaceholder()
                    container.placeholder.textColor = color
                }
            case "selectionColor", "cursorColor":
                if let color = color(raw) {
                    container.field.tintColor = color
                    container.textView.tintColor = color
                }
            case "fontSize":
                if let size = (raw as? NSNumber)?.doubleValue {
                    let font = UIFont.systemFont(ofSize: CGFloat(size))
                    container.field.font = font
                    container.textView.font = font
                    container.placeholder.font = font
                }
            case "textAlign":
                let alignment = textAlignment(raw as? String)
                container.field.textAlignment = alignment
                container.textView.textAlignment = alignment
            case "contentTop":
                container.contentTop = CGFloat((raw as? NSNumber)?.doubleValue ?? 0)
            case "contentBottom":
                container.contentBottom = CGFloat((raw as? NSNumber)?.doubleValue ?? 0)
            case "contentHorizontal":
                container.contentHorizontal = CGFloat((raw as? NSNumber)?.doubleValue ?? 16)
            case "nativeAccessible":
                let accessible = bool(raw, fallback: true)
                container.field.isAccessibilityElement = accessible
                container.textView.isAccessibilityElement = accessible
                container.accessibilityElementsHidden = !accessible
            case "nativeAccessibilityLabel":
                container.field.accessibilityLabel = raw as? String
                container.textView.accessibilityLabel = raw as? String
            case "nativeAccessibilityHint":
                container.field.accessibilityHint = raw as? String
                container.textView.accessibilityHint = raw as? String
            case "focused":
                if bool(raw) {
                    DispatchQueue.main.async { [weak self] in
                        self?.activeEditor.becomeFirstResponder()
                    }
                } else {
                    activeEditor.resignFirstResponder()
                }
            default:
                break
            }
        }
    }

    func dispose() {
        activeEditor.resignFirstResponder()
        container.field.delegate = nil
        container.textView.delegate = nil
    }

    private var activeEditor: UIResponder {
        container.multiline ? container.textView : container.field
    }

    private var text: String {
        container.multiline ? container.textView.text : (container.field.text ?? "")
    }

    private func setValue(_ value: String) {
        guard text != value else { return }
        let selection = currentSelection()
        container.field.text = value
        container.textView.text = value
        container.placeholder.isHidden = !container.multiline || !value.isEmpty
        setSelection(
            start: min(selection.location, value.utf16.count),
            end: min(selection.location + selection.length, value.utf16.count))
    }

    @objc private func fieldChanged() {
        guard !applyingProperties else { return }
        emitChange()
    }

    @objc private func fieldEditingBegan() {
        applyEditorPlaceholder(focused: true)
        if selectTextOnFocus { container.field.selectAll(nil) }
        emit(type: "focus", text: text)
    }

    @objc private func fieldEditingEnded() {
        applyEditorPlaceholder(focused: false)
        emit(type: "blur", text: text)
    }

    func textFieldDidChangeSelection(_ textField: UITextField) {
        if !applyingProperties { emitSelection() }
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        emit(type: "submit", text: text)
        if blurOnSubmit { textField.resignFirstResponder() }
        return !container.multiline
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
        applyEditorPlaceholder(focused: true)
        if selectTextOnFocus { textView.selectAll(nil) }
        emit(type: "focus", text: text)
    }

    func textViewDidEndEditing(_ textView: UITextView) {
        applyEditorPlaceholder(focused: false)
        emit(type: "blur", text: text)
    }

    func textViewDidChange(_ textView: UITextView) {
        guard !applyingProperties else { return }
        container.placeholder.isHidden = !textView.text.isEmpty
        emitChange()
        emit(type: "contentSize") { payload in
            payload["width"] = textView.contentSize.width
            payload["height"] = textView.contentSize.height
        }
    }

    func textViewDidChangeSelection(_ textView: UITextView) {
        if !applyingProperties { emitSelection() }
    }

    func textView(
        _ textView: UITextView,
        shouldChangeTextIn range: NSRange,
        replacementText replacement: String
    ) -> Bool {
        emit(type: "key") { payload in
            payload["key"] = replacement.isEmpty ? "Backspace" :
                (replacement == "\n" ? "Enter" : replacement)
        }
        if replacement == "\n" && blurOnSubmit {
            emit(type: "submit", text: text)
            textView.resignFirstResponder()
            return false
        }
        return permitsChange(range: range, replacement: replacement)
    }

    func textField(
        _ textField: UITextField,
        shouldChangeCharactersIn range: NSRange,
        replacementString string: String
    ) -> Bool {
        emit(type: "key") { payload in
            payload["key"] = string.isEmpty ? "Backspace" :
                (string == "\n" ? "Enter" : string)
        }
        return permitsChange(range: range, replacement: string)
    }

    private func applyFieldPlaceholder(_ value: String) {
        if let placeholderColor {
            container.field.attributedPlaceholder = NSAttributedString(
                string: value, attributes: [.foregroundColor: placeholderColor])
        } else {
            container.field.placeholder = value
        }
    }

    private func applyEditorPlaceholder(focused: Bool? = nil) {
        // raym3 owns both the Material label and placeholder presentation.
        // With a label, UIKit must never draw a competing hint.
        let value = hasLabel ? "" : placeholderText
        applyFieldPlaceholder(value)
        container.placeholder.text = value
        container.placeholder.isHidden =
            !container.multiline || !container.textView.text.isEmpty || value.isEmpty
    }

    private func permitsChange(range: NSRange, replacement: String) -> Bool {
        guard let maxLength else { return true }
        let current = text as NSString
        return current.replacingCharacters(in: range, with: replacement).count <= maxLength
    }

    private func emitChange() {
        emit(type: "change", text: text)
        emitSelection()
    }

    private func emitSelection() {
        let range = currentSelection()
        emit(type: "selection", text: text) { payload in
            payload["selectionStart"] = range.location
            payload["selectionEnd"] = range.location + range.length
        }
    }

    private func currentSelection() -> NSRange {
        if container.multiline { return container.textView.selectedRange }
        guard let range = container.field.selectedTextRange else {
            return NSRange(location: (container.field.text ?? "").utf16.count, length: 0)
        }
        let start = container.field.offset(
            from: container.field.beginningOfDocument, to: range.start)
        let end = container.field.offset(
            from: container.field.beginningOfDocument, to: range.end)
        return NSRange(location: start, length: end - start)
    }

    private func applySelection(_ properties: [String: Any?]) {
        guard let start = (properties["selectionStart"] as? NSNumber)?.intValue else { return }
        let end = (properties["selectionEnd"] as? NSNumber)?.intValue ?? start
        guard start >= 0, end >= 0 else { return }
        setSelection(start: start, end: end)
    }

    private func setSelection(start: Int, end: Int) {
        if container.multiline {
            let count = container.textView.text.utf16.count
            container.textView.selectedRange = NSRange(
                location: min(start, count),
                length: max(0, min(end, count) - min(start, count)))
            return
        }
        guard let from = container.field.position(
                  from: container.field.beginningOfDocument,
                  offset: min(start, (container.field.text ?? "").utf16.count)),
              let to = container.field.position(
                  from: container.field.beginningOfDocument,
                  offset: min(end, (container.field.text ?? "").utf16.count)),
              let range = container.field.textRange(from: from, to: to) else { return }
        container.field.selectedTextRange = range
    }

    private func applyInputType(_ value: String?) {
        let keyboard: UIKeyboardType
        switch value {
        case "email": keyboard = .emailAddress
        case "number": keyboard = .numberPad
        case "phone": keyboard = .phonePad
        case "url": keyboard = .URL
        case "ascii", "visible-password": keyboard = .asciiCapable
        default: keyboard = .default
        }
        container.field.keyboardType = keyboard
        container.textView.keyboardType = keyboard
        if value == "password" { container.field.isSecureTextEntry = true }
    }

    private func applyContentType(_ value: String?) {
        let type: UITextContentType?
        switch value {
        case "email", "emailAddress": type = .emailAddress
        case "username": type = .username
        case "password", "current-password": type = .password
        case "new-password": type = .newPassword
        case "name": type = .name
        case "tel", "telephoneNumber": type = .telephoneNumber
        case "one-time-code": type = .oneTimeCode
        default: type = nil
        }
        container.field.textContentType = type
        container.textView.textContentType = type
    }

    private func emit(
        type: String,
        text: String? = nil,
        extras: ((inout [String: Any]) -> Void)? = nil
    ) {
        var payload: [String: Any] = ["type": type]
        if let text { payload["text"] = text }
        extras?(&payload)
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        context.emit(json)
    }

    private func bool(_ value: Any?, fallback: Bool = false) -> Bool {
        if let value = value as? Bool { return value }
        if let value = value as? NSNumber { return value.boolValue }
        if let value = value as? String {
            return value == "1" || value.lowercased() == "true"
        }
        return fallback
    }

    private func color(_ value: Any?) -> UIColor? {
        if let rgba = value as? NSNumber {
            let raw = rgba.uint64Value
            return UIColor(
                red: CGFloat((raw >> 24) & 0xff) / 255,
                green: CGFloat((raw >> 16) & 0xff) / 255,
                blue: CGFloat((raw >> 8) & 0xff) / 255,
                alpha: CGFloat(raw & 0xff) / 255)
        }
        // react-native colors are CSS strings ("#64748b", "rgba(…)"). Number-only
        // parsing left placeholderTextColor/selectionColor unset, so the field
        // fell back to UIKit's dark default — invisible on a dark surface.
        if let css = value as? String { return Self.cssColor(css) }
        return nil
    }

    static func cssColor(_ raw: String) -> UIColor? {
        var text = raw.trimmingCharacters(in: .whitespaces).lowercased()
        if text.hasPrefix("#") {
            text.removeFirst()
            if text.count == 3 || text.count == 4 {
                text = text.map { "\($0)\($0)" }.joined()
            }
            guard text.count == 6 || text.count == 8,
                  let value = UInt64(text, radix: 16) else { return nil }
            let hasAlpha = text.count == 8
            let rgb = hasAlpha ? value >> 8 : value
            let alpha = hasAlpha ? CGFloat(value & 0xff) / 255 : 1
            return UIColor(
                red: CGFloat((rgb >> 16) & 0xff) / 255,
                green: CGFloat((rgb >> 8) & 0xff) / 255,
                blue: CGFloat(rgb & 0xff) / 255,
                alpha: alpha)
        }
        guard text.hasPrefix("rgb"),
              let open = text.firstIndex(of: "("),
              let close = text.firstIndex(of: ")") else { return nil }
        let parts = text[text.index(after: open)..<close]
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count >= 3,
              let r = Double(parts[0]), let g = Double(parts[1]),
              let b = Double(parts[2]) else { return nil }
        let a = parts.count > 3 ? (Double(parts[3]) ?? 1) : 1
        return UIColor(red: r / 255, green: g / 255, blue: b / 255, alpha: a)
    }

    private func capitalization(_ value: String?) -> UITextAutocapitalizationType {
        switch value {
        case "none": return .none
        case "words": return .words
        case "characters": return .allCharacters
        default: return .sentences
        }
    }

    private func returnKeyType(_ value: String?) -> UIReturnKeyType {
        switch value {
        case "go": return .go
        case "next": return .next
        case "search": return .search
        case "send": return .send
        case "continue": return .continue
        default: return .done
        }
    }

    private func textAlignment(_ value: String?) -> NSTextAlignment {
        switch value {
        case "center": return .center
        case "right": return .right
        default: return .natural
        }
    }
}
