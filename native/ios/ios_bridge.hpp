#pragma once

#include "ios_host_callbacks.hpp"
#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

typedef int64_t RayactIOSHandle;

void RayactIOSSetDevCallbacks(
    const char* (*devCall)(const char* method, const char* dataJson),
    const char* (*devFetch)(const char* url));
void RayactIOSSetDevFetchBytes(
    const uint8_t* (*devFetchBytes)(const char* url, uint32_t* outLen));
void RayactIOSSetNetworkCallbacks(
    const char* (*fetchText)(const char* url),
    const uint8_t* (*fetchBytes)(const char* url, uint32_t* outLen),
    int (*wsOpen)(int64_t owner, const char* url),
    bool (*wsSend)(int64_t owner, int id, const char* data),
    bool (*wsClose)(int64_t owner, int id, int code, const char* reason),
    const char* (*wsPollEvents)(int64_t owner));
void RayactIOSSetNetworkFetchStart(
    void (*fetchStart)(int64_t owner, int requestId, const char* url));

RayactIOSHandle RayactIOSSessionCreate(const char* dataPath);
void RayactIOSSessionDestroy(RayactIOSHandle handle);
void RayactIOSRequestGraphicsFrame(RayactIOSHandle handle);
void RayactIOSSessionDevToolsMessage(RayactIOSHandle handle, const char* message);
void RayactIOSSessionDisableDevTools(RayactIOSHandle handle);
void RayactIOSSessionRegisterHost(RayactIOSHandle handle, const RayactIOSHostCallbacks* callbacks);
bool RayactIOSSessionAcquireGraphics(RayactIOSHandle handle);
void RayactIOSSessionReleaseGraphics(RayactIOSHandle handle);
bool RayactIOSSessionLoadScript(RayactIOSHandle handle, int mode, const char* arg);
bool RayactIOSSessionLoadBytecode(RayactIOSHandle handle, const uint8_t* bytes, int len);
bool RayactIOSSessionApplyModuleUpdate(RayactIOSHandle handle, const char* path, const char* source);
void RayactIOSSessionToggleDevMenu(RayactIOSHandle handle);
int RayactIOSSessionCreateSurface(RayactIOSHandle handle, void* metalLayer, float density,
                                  int widthPx, int heightPx, float scale);
void RayactIOSSessionResizeSurface(RayactIOSHandle handle, int surfaceId, int width, int height, float density);
bool RayactIOSSessionRelayoutOnSurfaceResizeEnabled(RayactIOSHandle handle);
void RayactIOSSessionSetSafeAreaInsets(RayactIOSHandle handle, float top, float right, float bottom, float left);
void RayactIOSSessionSetKeyboardInsets(RayactIOSHandle handle, float heightDp, bool visible, float durationMs);
void RayactIOSSessionKeyEvent(RayactIOSHandle handle, int type, const char* key,
                              const char* code, const char* text, bool repeat,
                              bool ctrl, bool alt, bool shift, bool meta);
void RayactIOSSessionDestroySurface(RayactIOSHandle handle, int surfaceId);
void RayactIOSSessionPushSurface(RayactIOSHandle handle, int surfaceId);
int RayactIOSSessionPopSurface(RayactIOSHandle handle);
int RayactIOSSessionGetFocusedSurfaceId(RayactIOSHandle handle);
bool RayactIOSSessionRenderFrame(RayactIOSHandle handle, int64_t frameTimeNanos, int64_t deltaNanos);
float RayactIOSSessionNextJSTimerDelayMs(RayactIOSHandle handle);
void RayactIOSSessionTouch(RayactIOSHandle handle, int action, int id, float x, float y);
const char* RayactIOSSessionGetAccessibilitySnapshot(RayactIOSHandle handle);
bool RayactIOSSessionPerformAccessibilityAction(RayactIOSHandle handle, int nodeId);
void RayactIOSSessionOnBackPressed(RayactIOSHandle handle);
void RayactIOSSessionSetTextInputContent(RayactIOSHandle handle, int nodeId, const char* text,
                                         int selectionStart, int selectionEnd,
                                         int composingStart, int composingEnd);
void RayactIOSSessionBlurTextInput(RayactIOSHandle handle);
void RayactIOSSessionSubmitTextInput(RayactIOSHandle handle);
void RayactIOSSessionImeHiddenBySystem(RayactIOSHandle handle);

#ifdef __cplusplus
}
#endif
