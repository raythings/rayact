#pragma once

#include <string>

extern "C" {
#include "quickjs.h"
}

namespace rayact {

class EngineRuntime;

// iOS host contract for the Rayact engine bridge.
// This mirrors the Android runtime/session split conceptually:
// - one process-level QuickJS + raym3 engine
// - one active launcher/project surface at a time
// - host swaps between launcher and project by activating a runtime
//
// The implementation is intentionally separate from upstream raylib.
class IOSHostBridge {
public:
    virtual ~IOSHostBridge() = default;

    // Notify host that launcher/project should be shown. Used by the native
    // dev client to swap panes without recreating the process engine.
    virtual void showLauncher() = 0;
    virtual void showProject(const std::string& bundleUrl) = 0;

    // Surface lifecycle. The implementation can back these with MTKView(s),
    // UIWindowScene windows, or a single fullscreen surface.
    virtual void attachSurface(int surfaceId, int width, int height) = 0;
    virtual void detachSurface(int surfaceId) = 0;
};

// iOS engine lifecycle hooks. These are the seam the app target will call.
bool iosEngineBootstrap(IOSHostBridge* bridge);
void iosEngineTeardown();
void iosEnginePump();
void iosEngineRender(int width, int height);
bool iosEngineLoadSource(const std::string& source, const std::string& name);
bool iosEngineLoadBytecode(const uint8_t* data, size_t len, const char* label = "app.qjsbc");
bool iosEngineLoadDevServer(const std::string& devServerUrl);
void iosEngineSetTextInput(const std::string& text, int selectionStart, int selectionEnd);
void iosEngineBlurTextInput();
void iosEngineDestroy();

} // namespace rayact
