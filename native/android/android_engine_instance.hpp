#pragma once

#include "engine_runtime.hpp"

#include <android/native_window.h>
#include <atomic>
#include <cmath>
#include <jni.h>
#include <map>
#include <mutex>
#include <string>
#include <vector>

struct AndroidEngineInstance;

AndroidEngineInstance* androidEngineInstanceFromHandle(jlong handle);
AndroidEngineInstance* androidEngineCurrent();
void androidEngineSetCurrent(AndroidEngineInstance* inst);

struct AndroidEngineSurface {
    ANativeWindow* window = nullptr;
    int windowId = 0;
    int screenId = 0;
    float density = 1.0f;
    int pendingWidth = 0;
    int pendingHeight = 0;
    bool resizePending = false;
    bool ownsContext = false;
};

struct AndroidEngineInstance {
    jlong id = 0;
    rayact::EngineRuntime runtime;

    bool engineReady = false;
    bool scriptExecuted = false;
    bool scriptReloadRequested = false;
    float realDensity = 1.0f;
    int pendingScriptMode = -1;
    std::string pendingScript;
    std::vector<uint8_t> pendingBytecode;
    std::string dataPath;
    std::map<int, AndroidEngineSurface> surfaces;
    int rootScreenId = 0;
    std::atomic<bool> graphicsActive{false};

    std::atomic<bool> pendingBackPress{false};
    std::atomic<bool> finishActivityRequested{false};
    std::atomic<bool> exitAppRequested{false};
    std::atomic<bool> pendingDevMenuToggle{false};

    struct PendingTextUpdate {
        std::string text;
        int selectionStart = -1;
        int selectionEnd = -1;
        int composingStart = -1;
        int composingEnd = -1;
    };
    std::mutex textUpdateMutex;
    std::map<int, PendingTextUpdate> pendingTextUpdates;
    std::atomic<bool> pendingImeBlur{false};

    struct PendingKeyboardInsets {
        float heightDp = 0.0f;
        bool visible = false;
        float durationMs = 250.0f;
    };

    // Last inset values this context published into its own globalThis. Insets
    // themselves are process-global device truth (g_lastDeviceSafeArea /
    // g_lastDeviceKeyboard); each frame this instance compares against these and
    // republishes only on change. NaN sentinel forces the first publish. These
    // persist with the instance and are NOT part of save/load (no swap).
    float publishedSafeArea[4] = {NAN, NAN, NAN, NAN};
    bool publishedKeyboardValid = false;
    PendingKeyboardInsets publishedKeyboard;
    std::atomic<int> imeNodeId{-1};

    std::mutex pvFrameMutex;
    std::map<int, struct AHardwareBuffer*> pvPendingFrames;
    std::mutex pvTextMutex;
    std::map<int, std::string> pvPendingText;

    int64_t lastRenderFrameNanos = 0;

    jobject hostCallbacksGlobal = nullptr;

    void setCurrent();
    void registerHost(JNIEnv* env, jobject callbacks);
    void releaseHost(JNIEnv* env);

    jint callHostInt(const char* method) const;
    void callHostVoid(const char* method) const;
    void callHostReleaseSurface(int surfaceId) const;
    void callHostOrderSurfaces(const int* ids, int count) const;
    std::string callHostString(const char* method) const;
    void callHostIme(const char* method, int nodeId, const std::string& value,
                     const std::string& inputType, bool autocorrect, bool secure,
                     const std::string& imeAction) const;
    void callHostCopyToClipboard(const std::string& text) const;
    void callHostUpdateImeState(int nodeId, int selectionStart, int selectionEnd,
                                int composingStart, int composingEnd,
                                const char* text) const;
};

jlong androidEngineInstanceCreate(const std::string& dataPath);
void androidEngineInstanceDestroy(jlong handle);
bool androidEngineAcquireGraphics(jlong handle);
void androidEngineReleaseGraphics(jlong handle);

void androidEngineLoadInstanceState(AndroidEngineInstance* inst);
void androidEngineSaveInstanceState(AndroidEngineInstance* inst);

// Process-wide validity of the shared raym3/raylib GPU state. releaseGraphicsLocked
// CloseWindow()'s the device and resets the GLOBAL raym3 caches (FontManager,
// IconRenderer) — shared by every instance — so a render frame from any instance
// must not run until the next nativeCreateSurface rebuilds them. graphicsActive is
// per-instance and IsWindowReady() can still report true on the fast-resume path,
// so this global gate is what prevents the launcher↔project handoff SIGSEGV.
void androidEngineSetGraphicsValid(bool valid);
bool androidEngineGraphicsValid();
