#include "engine_runtime.hpp"

#include "../core/engine.hpp"

#include <cstdio>

namespace rayact {

static IOSHostBridge* g_iosBridge = nullptr;
static bool g_iosInitialized = false;

bool iosEngineBootstrap(IOSHostBridge* bridge) {
    g_iosBridge = bridge;
    if (g_iosInitialized) return true;
    if (!engineCreate()) {
        std::fprintf(stderr, "[rayact-ios] engineCreate failed\n");
        return false;
    }
    g_iosInitialized = true;
    return true;
}

void iosEngineTeardown() {
    if (!g_iosInitialized) return;
    engineDestroy();
    g_iosInitialized = false;
    g_iosBridge = nullptr;
}

void iosEnginePump() {
    if (!g_iosInitialized) return;
    enginePumpJS();
}

void iosEngineRender(int width, int height) {
    if (!g_iosInitialized) return;
    engineRenderFrame(width, height);
}

bool iosEngineLoadSource(const std::string& source, const std::string& name) {
    return g_iosInitialized && engineLoadSource(source, name);
}

bool iosEngineLoadBytecode(const uint8_t* data, size_t len, const char* label) {
    return g_iosInitialized && engineLoadBytecode(data, len, label);
}

bool iosEngineLoadDevServer(const std::string& devServerUrl) {
    return g_iosInitialized && engineLoadDevServer(devServerUrl);
}

void iosEngineSetTextInput(const std::string& text, int selectionStart, int selectionEnd) {
    (void)text;
    (void)selectionStart;
    (void)selectionEnd;
}

void iosEngineBlurTextInput() {
}

void iosEngineDestroy() {
    iosEngineTeardown();
}

} // namespace rayact
