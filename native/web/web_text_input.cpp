#include "../desktop/raym3_bridge.hpp"

#include <emscripten/emscripten.h>

#include <string>

namespace {

std::string inputModeForType(const std::string& inputType) {
    if (inputType == "email") return "email";
    if (inputType == "number") return "number";
    if (inputType == "phone") return "phone";
    if (inputType == "url") return "url";
    if (inputType == "multiline") return "multiline";
    return "text";
}

} // namespace

void AndroidKeyboard_ShowForNode(int nodeId, const std::string& inputType,
                                 bool autocorrect, bool secure,
                                 const std::string& imeAction,
                                 const std::string& autoCapitalize,
                                 bool contextMenuHidden) {
    std::string value;
    bool blurOnSubmit = inputType != "multiline";
    auto it = g_nodes.find(nodeId);
    if (it != g_nodes.end() && it->second && it->second->kind == raym3::v2::NodeKind::TextInput) {
        if (it->second->textInput.value) value = *it->second->textInput.value;
        else if (it->second->textInput.buffer) value = it->second->textInput.buffer;
        blurOnSubmit = it->second->textInput.blurOnSubmit;
    }
    EM_ASM({
        var canvas = document.getElementById('canvas');
        if (canvas) canvas.focus({ preventScroll: true });
    });
    EM_ASM_({
        if (!Module.rayactTextInput) return;
        Module.rayactTextInput.show($0, UTF8ToString($1), UTF8ToString($2), !!$3, !!$4, UTF8ToString($5), !!$6, UTF8ToString($7), !!$8);
    }, nodeId, value.c_str(), inputModeForType(inputType).c_str(), autocorrect ? 1 : 0,
       secure ? 1 : 0, imeAction.c_str(), blurOnSubmit ? 1 : 0,
       autoCapitalize.c_str(), contextMenuHidden ? 1 : 0);
}

void AndroidKeyboard_Hide() {
    EM_ASM({
        if (Module.rayactTextInput) Module.rayactTextInput.hide();
    });
}

void AndroidKeyboard_UpdateSelection(int nodeId, int selectionStart,
                                     int selectionEnd, int composingStart,
                                     int composingEnd,
                                     const char* fullTextIfChanged) {
    (void)composingStart;
    (void)composingEnd;
    EM_ASM_({
        if (!Module.rayactTextInput) return;
        var value = $1 ? UTF8ToString($1) : null;
        Module.rayactTextInput.update($0, value, $2, $3);
    }, nodeId, fullTextIfChanged, selectionStart, selectionEnd);
}

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebImeUpdate(
    int nodeId, const char* text, int selectionStart, int selectionEnd,
    int composingStart, int composingEnd, int textChanged) {
    if (!text) return;
    rayactSetTextInputContent(nodeId, text, selectionStart, selectionEnd,
                              composingStart, composingEnd);
    (void)textChanged;
}

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebImeSubmit(void) {
    rayactSubmitFocusedTextInput();
}
