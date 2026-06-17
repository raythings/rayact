#pragma once

#include "../android/engine_runtime.hpp"

#include <atomic>
#include <cmath>
#include <cstdint>
#include <map>
#include <mutex>
#include <string>
#include <vector>

#include "ios_host_callbacks.hpp"

struct IOSEngineInstance;

IOSEngineInstance* iosEngineInstanceFromHandle(int64_t handle);
IOSEngineInstance* iosEngineCurrent();
void iosEngineSetCurrent(IOSEngineInstance* inst);

struct IOSEngineSurface {
    int windowId = 0;
    int screenId = 0;
    float density = 1.0f;
    int pendingWidth = 0;
    int pendingHeight = 0;
    bool resizePending = false;
    bool ownsContext = false;
};

struct IOSEngineInstance {
    int64_t id = 0;
    rayact::EngineRuntime runtime;

    bool engineReady = false;
    bool scriptExecuted = false;
    bool scriptReloadRequested = false;
    float realDensity = 1.0f;
    int pendingScriptMode = -1;
    std::string pendingScript;
    std::vector<uint8_t> pendingBytecode;
    std::string dataPath;
    std::map<int, IOSEngineSurface> surfaces;
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

    float publishedSafeArea[4] = {NAN, NAN, NAN, NAN};
    bool publishedKeyboardValid = false;
    PendingKeyboardInsets publishedKeyboard;
    std::atomic<int> imeNodeId{-1};

    int64_t lastRenderFrameNanos = 0;

    RayactIOSHostCallbacks hostCallbacks{};
    bool hasHostCallbacks = false;

    void setCurrent();
    void registerHost(const RayactIOSHostCallbacks* callbacks);
    void clearHost();

    int callHostInt(const char* method) const;
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

int64_t iosEngineInstanceCreate(const std::string& dataPath);
void iosEngineInstanceDestroy(int64_t handle);
bool iosEngineAcquireGraphics(int64_t handle);
void iosEngineReleaseGraphics(int64_t handle);

void iosEngineLoadInstanceState(IOSEngineInstance* inst);
void iosEngineSaveInstanceState(IOSEngineInstance* inst);

void iosEngineSetGraphicsValid(bool valid);
bool iosEngineGraphicsValid();
