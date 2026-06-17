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

RayactIOSHandle RayactIOSSessionCreate(const char* dataPath);
void RayactIOSSessionDestroy(RayactIOSHandle handle);
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
void RayactIOSSessionDestroySurface(RayactIOSHandle handle, int surfaceId);
void RayactIOSSessionPushSurface(RayactIOSHandle handle, int surfaceId);
int RayactIOSSessionPopSurface(RayactIOSHandle handle);
int RayactIOSSessionGetFocusedSurfaceId(RayactIOSHandle handle);
bool RayactIOSSessionRenderFrame(RayactIOSHandle handle, int64_t frameTimeNanos, int64_t deltaNanos);
float RayactIOSSessionNextJSTimerDelayMs(RayactIOSHandle handle);
void RayactIOSSessionTouch(RayactIOSHandle handle, int action, int id, float x, float y);
void RayactIOSSessionOnBackPressed(RayactIOSHandle handle);
void RayactIOSSessionSetTextInputContent(RayactIOSHandle handle, int nodeId, const char* text,
                                         int selectionStart, int selectionEnd,
                                         int composingStart, int composingEnd);
void RayactIOSSessionBlurTextInput(RayactIOSHandle handle);
void RayactIOSSessionImeHiddenBySystem(RayactIOSHandle handle);

#ifdef __cplusplus
}
#endif
