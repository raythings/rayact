#pragma once

#include <map>
#include <memory>
#include <functional>
#include <string>
#include <vector>

extern "C" {
#include "quickjs.h"
}

#include <raym3/v2/View.h>

extern std::map<int, raym3::v2::NodePtr> g_nodes;
extern raym3::v2::NodePtr g_root;
extern std::map<int, JSValue> g_pressCallbacks;
extern JSContext* g_bridge_ctx;

// Dismiss the frontmost modal via onRequestClose when a tap lands outside its
// panel (on the scrim). Returns true if a close callback was invoked. Intended
// to be called only when HitTest produced no onPress target.
bool engineTryRequestCloseOnScrimTap(Vector2 pointDp);
// Press/request-close callbacks can mutate the React tree. Queue them while
// raym3 is resolving input and drain after the input traversal completes.
void rayactDrainDeferredInputCallbacks();

JSValue JS_createView(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createText(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createButton(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createTextInput(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createScrollView(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createModal(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createSafeArea(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createExternalView(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setExternalViewProps(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createStatusBar(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createActivityIndicator(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createAvoidKeyboard(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createMaterialComponent(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setMaterialComponentProps(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_appendChild(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_removeChild(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_insertBefore(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setRootNode(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_clearRootNode(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnPress(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnChangeText(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnFocus(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnBlur(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnSubmitEditing(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnEndEditing(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnSelectionChange(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnChangeValue(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnScroll(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnRequestClose(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnDragStart(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnDragMove(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnDragEnd(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnLayout(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setStyle(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setText(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setValue(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_disposeNode(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactRegisterAnimatedNode(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactStartStyleAnimation(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactStopStyleAnimation(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactSetAnimatedStyle(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactCreateNodeFast(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactUpdateNodeFast(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactBatchMutations(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createImage(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createIcon(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setIconProps(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_registerFont(JSContext*, JSValue, int, JSValueConst*);

#if defined(__ANDROID__) || defined(RAYACT_IOS)
void AndroidKeyboard_ShowForNode(int nodeId, const std::string &inputType,
                                 bool autocorrect, bool secure,
                                 const std::string &imeAction);
void AndroidKeyboard_Hide();
void AndroidKeyboard_UpdateSelection(int nodeId, int selectionStart, int selectionEnd,
                                     int composingStart, int composingEnd,
                                     const char *fullTextIfChanged);
#endif

void rayactSetTextInputContent(int nodeId, const char *text, int selectionStart = -1,
                               int selectionEnd = -1, int composingStart = -1,
                               int composingEnd = -1);
void rayactBlurFocusedTextInput();

// External (platform) views: host callbacks for layout-rect pushes and input
// forwarding, plus texture replacement (e.g. rlvk AHardwareBuffer imports).
void rayactSetExternalViewHostCallbacks(
    void (*rectCb)(int nodeId, const char* kind, float x, float y, float w, float h),
    void (*inputCb)(int nodeId, int action, float localX, float localY),
    void (*propCb)(int nodeId, const char* key, const char* value),
    void (*disposeCb)(int nodeId));
void rayactSetExternalViewTexture(int nodeId, Texture2D texture);
// Producer-surface content insets in px (oversized surface for overflow
// chrome); the node's draw rect expands by these.
void rayactSetExternalViewTextureInsets(int nodeId, float l, float t, float r, float b);
// Invoke the node's JS onChangeText with producer text (JS thread only).
void rayactExternalViewEmitText(int nodeId, const char* text);

void buildIconSpriteSheet();
// Drop GPU icon-sheet state without unloading (device re-init invalidated the
// ids); sheet rebuilds from retained registrations via buildIconSpriteSheet().
void rayactResetIconSheet();
// unloadGpuCaches: free the process-global GPU caches (icon fonts/sheet,
// image textures). Only safe when this teardown also owns the live graphics
// device (desktop full shutdown). Android per-instance teardown must pass
// false: the device is either already closed (stale ids) or owned by another
// engine instance — unloading would destroy ITS live textures (icons turned
// to tofu after a project session was destroyed under a live launcher).
void cleanupRaym3Bridge(JSContext* ctx, bool unloadGpuCaches = true);

#if defined(RAYACT_ANDROID) || defined(RAYACT_IOS)
struct Raym3RuntimeStorage;
Raym3RuntimeStorage* raym3BridgeNewRuntimeStorage();
void raym3BridgeDeleteRuntimeStorage(Raym3RuntimeStorage* storage);
void raym3BridgeExportRuntimeStorage(Raym3RuntimeStorage& out);
void raym3BridgeImportRuntimeStorage(const Raym3RuntimeStorage& in);
void raym3BridgeClearRuntimeGlobals();
#endif
void refreshStylesForColorScheme(JSContext* ctx);
void setSafeAreaInsets(float top, float right, float bottom, float left);
void resolvePopoverAnchors();
void installAnimatedStyleBuffer(JSContext* ctx, JSValue global);
// Binary command buffer: per-commit structural-mutation stream decoded linearly
// in native (no per-field JS reads). Opcodes mirror packages/rayact-react/src/protocol.ts.
void installCommandBuffer(JSContext* ctx, JSValue global);
JSValue JS_rayactFlushCommands(JSContext*, JSValue, int, JSValueConst*);
void tickAnimatedStyles(JSContext* ctx);
bool hasActiveStyleAnimations();
void applyAnimatedStylesToNodes();

// Multi-surface navigation: per-screen React trees share one QJS context.
// JS calls setCurrentScreen(id) before each React mount; the engine then
// drives the render loop across all live screens.
JSValue JS_setCurrentScreen(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactHostRequestNewSurface(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactHostReleaseSurface(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactHostGetRootSurfaceId(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactHostReleaseTopSurface(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactHostExitApp(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactEnginePushScreen(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactEnginePopScreen(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_rayactEngineSetScreenStack(JSContext*, JSValue, int, JSValueConst*);
int engineCreateScreen();
int engineGetCurrentScreenId();
void engineDestroyScreen(int id);
void engineBindScreenRoot(int id);
const raym3::v2::NodePtr& engineGetScreenRoot(int id);
void engineForEachScreen(const std::function<void(int, const raym3::v2::NodePtr&)>& fn);
int engineGetNextScreenId();

// Z-order stack for multi-surface navigation. The host pushes/pops to manage
// which screens are visible. The render loop iterates bottom→top and dispatches
// input to the focused (top) screen. Legacy single-screen mode (empty stack)
// falls back to the legacy g_root / g_currentScreenId path.
bool engineHasScreenStack();
int engineGetFocusedScreenId();
void enginePushScreen(int id);
bool enginePopScreen();
void engineClearScreenStack();
void engineSetScreenStack(const std::vector<int>& ids);
void engineForEachVisibleScreen(const std::function<void(int, const raym3::v2::NodePtr&)>& fn);

std::string buildNodeTreeJson();
void setInspectorHighlight(int nodeId);
void drawInspectorHighlight();
