#pragma once

#include <cstdint>

struct RayactIOSHostCallbacks {
    void* context = nullptr;
    int (*requestNewSurface)(void* ctx) = nullptr;
    int (*rootSurfaceId)(void* ctx) = nullptr;
    int (*topSurfaceId)(void* ctx) = nullptr;
    void (*releaseTopSurface)(void* ctx) = nullptr;
    void (*releaseSurface)(void* ctx, int surfaceId) = nullptr;
    void (*orderSurfaces)(void* ctx, const int* ids, int count) = nullptr;
    void (*requestRenderFrame)(void* ctx) = nullptr;
    void (*toggleDevMenu)(void* ctx) = nullptr;
    void (*performHapticFeedback)(void* ctx) = nullptr;
    void (*hideSoftKeyboard)(void* ctx) = nullptr;
    void (*finishActivity)(void* ctx) = nullptr;
    void (*stopRenderScheduler)(void* ctx) = nullptr;
    void (*showSoftKeyboard)(void* ctx, int nodeId, const char* value, const char* inputType,
                             bool autocorrect, bool secure, const char* imeAction) = nullptr;
    void (*switchIme)(void* ctx, int nodeId, const char* value, const char* inputType,
                      bool autocorrect, bool secure, const char* imeAction) = nullptr;
    void (*copyToClipboard)(void* ctx, const char* text) = nullptr;
    const char* (*readClipboard)(void* ctx) = nullptr;
    void (*updateImeState)(void* ctx, int nodeId, int selectionStart, int selectionEnd,
                           int composingStart, int composingEnd, const char* text) = nullptr;
};
