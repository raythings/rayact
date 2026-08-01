package com.rayact.engine

import android.graphics.Color
import android.graphics.Typeface
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import org.json.JSONObject

private const val NATIVE_TEXT_INPUT_KIND = "rayact.internal.text-input"

internal fun registerRayactNativeTextInput(registry: RayactPlatformRegistry) {
    if (registry.hasViewFactory(NATIVE_TEXT_INPUT_KIND)) return
    registry.registerViewFactory(NATIVE_TEXT_INPUT_KIND) { context ->
        RayactNativeTextInputController(context)
    }
}

private class RayactEditorView(context: android.content.Context) : EditText(context) {
    var selectionChanged: ((Int, Int) -> Unit)? = null
    var contextMenuHidden = false

    override fun onSelectionChanged(selStart: Int, selEnd: Int) {
        super.onSelectionChanged(selStart, selEnd)
        selectionChanged?.invoke(selStart, selEnd)
    }

    override fun onTextContextMenuItem(id: Int): Boolean =
        if (contextMenuHidden) false else super.onTextContextMenuItem(id)
}

private class RayactEditorContainer(context: android.content.Context) : FrameLayout(context) {
    val editor = RayactEditorView(context)
    var contentHorizontal = 16f
    var contentTop = 0f
    var contentBottom = 0f

    init {
        setBackgroundColor(Color.TRANSPARENT)
        editor.background = null
        editor.setBackgroundColor(Color.TRANSPARENT)
        addView(editor, LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        ))
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        editor.layout(0, 0, right - left, bottom - top)
    }
}

private class RayactNativeTextInputController(
    private val context: RayactPlatformViewContext,
) : RayactPlatformViewController {
    override val view = RayactEditorContainer(context.context)
    private val editor = view.editor
    private var applyingProperties = false
    private var multiline = false
    private var blurOnSubmit = true
    private var selectTextOnFocus = false
    private var requestedInputType = "text"
    private var secure = false
    private var autocorrect = true
    private var autoCapitalize = "sentences"
    private var accessibilityLabel: String? = null
    private var accessibilityHint: String? = null
    private var placeholder = ""
    private var hasLabel = false

    init {
        // This view is intentionally only the native editing surface. raym3
        // paints the complete M3 field behind it on every platform.
        editor.background = null
        editor.setBackgroundColor(Color.TRANSPARENT)
        editor.includeFontPadding = false
        editor.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 16f)
        editor.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
        applyPadding()

        setProperties(context.initialProperties)

        editor.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (applyingProperties) return
                emit("change", text = s?.toString().orEmpty())
                emitSelection()
                emitContentSize()
            }
        })
        editor.selectionChanged = { _, _ ->
            if (!applyingProperties) emitSelection()
        }
        editor.setOnFocusChangeListener { _, focused ->
            applyPlaceholder()
            applyPadding()
            if (focused && selectTextOnFocus) editor.selectAll()
            emit(if (focused) "focus" else "blur", text = editor.text.toString())
        }
        editor.setOnEditorActionListener { _, actionId, event ->
            val keyboardSubmit =
                event?.keyCode == KeyEvent.KEYCODE_ENTER &&
                    event.action == KeyEvent.ACTION_UP
            if (actionId != EditorInfo.IME_ACTION_NONE || keyboardSubmit) {
                emit("submit", text = editor.text.toString())
                if (blurOnSubmit) editor.clearFocus()
                true
            } else {
                false
            }
        }
        editor.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN) {
                val key = when (keyCode) {
                    KeyEvent.KEYCODE_DEL -> "Backspace"
                    KeyEvent.KEYCODE_ENTER -> "Enter"
                    else -> event.unicodeChar.takeIf { it != 0 }?.let {
                        String(Character.toChars(it))
                    }
                }
                if (key != null) emit("key", key = key)
            }
            false
        }
    }

    override fun setProperties(properties: Map<String, Any?>) {
        applyingProperties = true
        var inputBehaviorDirty = false
        try {
            properties.forEach { (key, raw) ->
                when (key) {
                    "value" -> setValue(raw?.toString().orEmpty())
                    "placeholder" -> {
                        placeholder = raw?.toString().orEmpty()
                        applyPlaceholder()
                    }
                    "hasLabel" -> {
                        hasLabel = bool(raw)
                        applyPlaceholder()
                    }
                    "inputType" -> {
                        requestedInputType = raw?.toString() ?: "text"
                        inputBehaviorDirty = true
                    }
                    "secure" -> {
                        secure = bool(raw)
                        inputBehaviorDirty = true
                    }
                    "autocorrect" -> {
                        autocorrect = bool(raw, true)
                        inputBehaviorDirty = true
                    }
                    "autoCapitalize" -> {
                        autoCapitalize = raw?.toString() ?: "sentences"
                        inputBehaviorDirty = true
                    }
                    "imeAction" -> editor.imeOptions = imeAction(raw?.toString())
                    "autoComplete" -> applyAutofill(raw?.toString())
                    "editable" -> editor.isEnabled = bool(raw, true)
                    "multiline" -> {
                        multiline = bool(raw)
                        applyMultiline()
                        inputBehaviorDirty = true
                    }
                    "maxLength" -> {
                        val max = (raw as? Number)?.toInt()
                        editor.filters = if (max != null && max >= 0) {
                            arrayOf(InputFilter.LengthFilter(max))
                        } else {
                            emptyArray()
                        }
                    }
                    "selectTextOnFocus" -> selectTextOnFocus = bool(raw)
                    "caretHidden" -> editor.isCursorVisible = !bool(raw)
                    "contextMenuHidden" -> editor.contextMenuHidden = bool(raw)
                    "blurOnSubmit" -> blurOnSubmit = bool(raw, !multiline)
                    "selectionStart", "selectionEnd" -> applySelection(properties)
                    "textColor" -> color(raw)?.let(editor::setTextColor)
                    "placeholderColor" -> color(raw)?.let(editor::setHintTextColor)
                    "selectionColor" -> color(raw)?.let(editor::setHighlightColor)
                    "cursorColor" -> {
                        // Public cursor drawable tinting is available only on
                        // newer Android releases; textCursorDrawable is still
                        // honored where supported without reflection.
                        if (android.os.Build.VERSION.SDK_INT >= 29) {
                            color(raw)?.let { tint ->
                                editor.textCursorDrawable?.mutate()?.setTint(tint)
                            }
                        }
                    }
                    "fontSize" -> (raw as? Number)?.toFloat()?.let {
                        editor.setTextSize(TypedValue.COMPLEX_UNIT_DIP, it)
                    }
                    "textAlign" -> applyTextAlign(raw?.toString())
                    "contentTop" -> {
                        view.contentTop = (raw as? Number)?.toFloat() ?: 0f
                        view.requestLayout()
                    }
                    "contentBottom" -> {
                        view.contentBottom = (raw as? Number)?.toFloat() ?: 0f
                        view.requestLayout()
                    }
                    "contentHorizontal" -> {
                        view.contentHorizontal = (raw as? Number)?.toFloat() ?: 0f
                        applyPadding()
                        view.requestLayout()
                    }
                    "nativeAccessible" -> editor.importantForAccessibility =
                        if (bool(raw, true)) {
                            android.view.View.IMPORTANT_FOR_ACCESSIBILITY_YES
                        } else {
                            android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
                        }
                    "nativeAccessibilityLabel" -> {
                        accessibilityLabel = raw?.toString()
                        applyAccessibilityDescription()
                    }
                    "nativeAccessibilityHint" -> {
                        accessibilityHint = raw?.toString()
                        applyAccessibilityDescription()
                    }
                    "focused" -> {
                        if (bool(raw)) {
                            editor.requestFocus()
                            editor.post {
                                val imm = context.context.getSystemService(
                                    android.content.Context.INPUT_METHOD_SERVICE,
                                ) as android.view.inputmethod.InputMethodManager
                                imm.showSoftInput(editor, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
                            }
                        } else if (editor.hasFocus()) {
                            editor.clearFocus()
                            // The IME client is the proxying RayactSurfaceView,
                            // so clearing editor focus alone leaves the soft
                            // keyboard open on a tap-outside blur.
                            val imm = context.context.getSystemService(
                                android.content.Context.INPUT_METHOD_SERVICE,
                            ) as android.view.inputmethod.InputMethodManager
                            imm.hideSoftInputFromWindow(editor.windowToken, 0)
                        }
                    }
                }
            }
            if (inputBehaviorDirty) applyInputBehavior()
        } finally {
            applyingProperties = false
        }
    }

    private fun setValue(value: String) {
        if (editor.text.toString() == value) return
        val start = editor.selectionStart.coerceAtLeast(0)
        val end = editor.selectionEnd.coerceAtLeast(0)
        editor.setText(value)
        editor.setSelection(
            start.coerceAtMost(value.length),
            end.coerceAtMost(value.length),
        )
    }

    private fun applySelection(properties: Map<String, Any?>) {
        val start = (properties["selectionStart"] as? Number)?.toInt() ?: return
        val end = (properties["selectionEnd"] as? Number)?.toInt() ?: start
        if (start < 0 || end < 0) return
        editor.setSelection(
            start.coerceAtMost(editor.text.length),
            end.coerceAtMost(editor.text.length),
        )
    }

    private fun applyInputBehavior() {
        var flags = when (requestedInputType) {
            "email" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            "number" -> InputType.TYPE_CLASS_NUMBER
            "phone" -> InputType.TYPE_CLASS_PHONE
            "url" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            "password" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            "multiline" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            "visible-password" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            else -> InputType.TYPE_CLASS_TEXT
        }
        if (multiline) flags = flags or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        if (secure) {
            flags = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        flags = flags or if (autocorrect) {
            InputType.TYPE_TEXT_FLAG_AUTO_CORRECT
        } else {
            InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        }
        flags = flags or when (autoCapitalize) {
            "words" -> InputType.TYPE_TEXT_FLAG_CAP_WORDS
            "characters" -> InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            "none" -> 0
            else -> InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        }
        editor.inputType = flags
    }

    private fun applyMultiline() {
        editor.isSingleLine = !multiline
        editor.maxLines = if (multiline) Int.MAX_VALUE else 1
        editor.gravity =
            (if (multiline) Gravity.TOP else Gravity.CENTER_VERTICAL) or Gravity.START
        applyPadding()
    }

    private fun applyPadding() {
        editor.setPadding(
            dp(view.contentHorizontal),
            dp(view.contentTop),
            dp(view.contentHorizontal),
            dp(view.contentBottom),
        )
    }

    private fun applyTextAlign(value: String?) {
        val horizontal = when (value) {
            "center" -> Gravity.CENTER_HORIZONTAL
            "right" -> Gravity.END
            else -> Gravity.START
        }
        editor.gravity =
            horizontal or if (multiline) Gravity.TOP else Gravity.CENTER_VERTICAL
    }

    private fun applyAutofill(value: String?) {
        if (android.os.Build.VERSION.SDK_INT < 26) return
        val hint = when (value) {
            "email", "emailAddress" -> android.view.View.AUTOFILL_HINT_EMAIL_ADDRESS
            "username" -> android.view.View.AUTOFILL_HINT_USERNAME
            "password", "current-password" -> android.view.View.AUTOFILL_HINT_PASSWORD
            "name" -> android.view.View.AUTOFILL_HINT_NAME
            "tel", "telephoneNumber" -> android.view.View.AUTOFILL_HINT_PHONE
            else -> null
        }
        if (hint == null) editor.setAutofillHints() else editor.setAutofillHints(hint)
    }

    private fun applyAccessibilityDescription() {
        editor.contentDescription = listOfNotNull(
            accessibilityLabel?.takeIf(String::isNotBlank),
            accessibilityHint?.takeIf(String::isNotBlank),
        ).joinToString(". ").ifEmpty { null }
    }

    private fun applyPlaceholder() {
        // raym3 owns the Material label/placeholder. Never let EditText draw a
        // second hint when a renderer-owned label is present.
        editor.hint = if (hasLabel) "" else placeholder
    }

    private fun emit(
        type: String,
        text: String? = null,
        key: String? = null,
        extras: JSONObject.() -> Unit = {},
    ) {
        val payload = JSONObject().put("type", type)
        if (text != null) payload.put("text", text)
        if (key != null) payload.put("key", key)
        payload.extras()
        context.emit(payload.toString())
    }

    private fun emitSelection() {
        emit("selection", text = editor.text.toString()) {
            put("selectionStart", editor.selectionStart.coerceAtLeast(0))
            put("selectionEnd", editor.selectionEnd.coerceAtLeast(0))
        }
    }

    private fun emitContentSize() {
        val density = context.context.resources.displayMetrics.density
        emit("contentSize") {
            put("width", editor.measuredWidth / density)
            put("height", editor.measuredHeight / density)
        }
    }

    private fun imeAction(value: String?): Int = when (value) {
        "go" -> EditorInfo.IME_ACTION_GO
        "next" -> EditorInfo.IME_ACTION_NEXT
        "search" -> EditorInfo.IME_ACTION_SEARCH
        "send" -> EditorInfo.IME_ACTION_SEND
        "previous" -> EditorInfo.IME_ACTION_PREVIOUS
        "none" -> EditorInfo.IME_ACTION_NONE
        else -> EditorInfo.IME_ACTION_DONE
    }

    private fun dp(value: Float): Int =
        (value * context.context.resources.displayMetrics.density).toInt()

    private fun bool(value: Any?, fallback: Boolean = false): Boolean = when (value) {
        is Boolean -> value
        is Number -> value.toInt() != 0
        is String -> value.equals("true", true) || value == "1"
        else -> fallback
    }

    private fun color(value: Any?): Int? {
        (value as? Number)?.let { number ->
            val rgba = number.toLong()
            val r = ((rgba ushr 24) and 0xff).toInt()
            val g = ((rgba ushr 16) and 0xff).toInt()
            val b = ((rgba ushr 8) and 0xff).toInt()
            val a = (rgba and 0xff).toInt()
            return Color.argb(a, r, g, b)
        }
        // react-native colors are CSS strings ("#64748b", "rgba(…)").
        return (value as? String)?.let(::cssColor)
    }

    private fun cssColor(raw: String): Int? {
        val text = raw.trim().lowercase()
        if (text.startsWith("#")) {
            var hex = text.substring(1)
            if (hex.length == 3 || hex.length == 4) {
                hex = hex.map { "$it$it" }.joinToString("")
            }
            if (hex.length != 6 && hex.length != 8) return null
            val value = hex.toLongOrNull(16) ?: return null
            val rgb = if (hex.length == 8) value ushr 8 else value
            val a = if (hex.length == 8) (value and 0xff).toInt() else 255
            return Color.argb(
                a,
                ((rgb ushr 16) and 0xff).toInt(),
                ((rgb ushr 8) and 0xff).toInt(),
                (rgb and 0xff).toInt(),
            )
        }
        if (!text.startsWith("rgb")) return null
        val open = text.indexOf('(')
        val close = text.indexOf(')')
        if (open < 0 || close < open) return null
        val parts = text.substring(open + 1, close).split(',').map { it.trim() }
        if (parts.size < 3) return null
        val r = parts[0].toFloatOrNull() ?: return null
        val g = parts[1].toFloatOrNull() ?: return null
        val b = parts[2].toFloatOrNull() ?: return null
        val a = if (parts.size > 3) parts[3].toFloatOrNull() ?: 1f else 1f
        return Color.argb(
            (a * 255f).toInt().coerceIn(0, 255),
            r.toInt().coerceIn(0, 255),
            g.toInt().coerceIn(0, 255),
            b.toInt().coerceIn(0, 255),
        )
    }
}
