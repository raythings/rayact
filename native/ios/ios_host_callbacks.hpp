#pragma once

#include <cstdint>

struct RayactIOSHostCallbacks {
    static constexpr uint32_t kVersion = 2;
    uint32_t abiVersion = kVersion;
    uint32_t structSize = sizeof(RayactIOSHostCallbacks);
    void* context = nullptr;
    int (*requestNewSurface)(void* ctx) = nullptr;
    int (*rootSurfaceId)(void* ctx) = nullptr;
    int (*topSurfaceId)(void* ctx) = nullptr;
    void (*releaseTopSurface)(void* ctx) = nullptr;
    void (*releaseSurface)(void* ctx, int surfaceId) = nullptr;
    void (*orderSurfaces)(void* ctx, const int* ids, int count) = nullptr;
    void (*requestRenderFrame)(void* ctx) = nullptr;
    void (*sendDevtoolsMessage)(void* ctx, const char* message) = nullptr;
    void (*toggleDevMenu)(void* ctx) = nullptr;
    void (*performHapticFeedback)(void* ctx) = nullptr;
    void (*hideSoftKeyboard)(void* ctx) = nullptr;
    void (*finishActivity)(void* ctx) = nullptr;
    void (*stopRenderScheduler)(void* ctx) = nullptr;
    void (*showSoftKeyboard)(void* ctx, int nodeId, const char* value, const char* inputType,
                             bool autocorrect, bool secure, const char* imeAction,
                             const char* autoCapitalize, bool contextMenuHidden) = nullptr;
    void (*switchIme)(void* ctx, int nodeId, const char* value, const char* inputType,
                      bool autocorrect, bool secure, const char* imeAction,
                      const char* autoCapitalize, bool contextMenuHidden) = nullptr;
    void (*copyToClipboard)(void* ctx, const char* text) = nullptr;
    const char* (*readClipboard)(void* ctx) = nullptr;
    void (*updateImeState)(void* ctx, int nodeId, int selectionStart, int selectionEnd,
                           int composingStart, int composingEnd, const char* text) = nullptr;
    void (*platformViewCreate)(void* ctx, int surfaceId, int nodeId,
                               const char* kind, const char* propertiesJson) = nullptr;
    void (*platformViewSetProperties)(void* ctx, int surfaceId, int nodeId,
                                      const char* propertiesJson) = nullptr;
    void (*platformViewDispose)(void* ctx, int surfaceId, int nodeId) = nullptr;
    void (*platformViewsBeginFrame)(void* ctx, int surfaceId,
                                    float width, float height, float density) = nullptr;
    bool (*platformViewComposite)(void* ctx, int surfaceId, int nodeId,
                                  const char* compositionJson) = nullptr;
    void (*platformViewsEndFrame)(void* ctx, int surfaceId) = nullptr;
    void (*platformViewGestureDecision)(void* ctx, int surfaceId, int nodeId,
                                        bool accepted) = nullptr;
};
