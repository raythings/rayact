#pragma once

#include <map>
#include <memory>

extern "C" {
#include "quickjs.h"
}

#include <raym3/v2/View.h>

extern std::map<int, raym3::v2::NodePtr> g_nodes;
extern raym3::v2::NodePtr g_root;
extern std::map<int, JSValue> g_pressCallbacks;
extern JSContext* g_bridge_ctx;

raym3::v2::NodePtr engineFindPressTarget(const raym3::v2::NodePtr& hit);

JSValue JS_createView(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createText(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createButton(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createTextInput(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createScrollView(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createModal(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createSafeArea(JSContext*, JSValue, int, JSValueConst*);
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
JSValue JS_setOnChangeValue(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnScroll(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setOnRequestClose(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setStyle(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setText(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_setValue(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_disposeNode(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createImage(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_createIcon(JSContext*, JSValue, int, JSValueConst*);
JSValue JS_registerFont(JSContext*, JSValue, int, JSValueConst*);

bool processRaym3ScrollInput(Vector2 mouse, float wheelY, bool pressed, bool down, bool released);
void buildIconSpriteSheet();
void cleanupRaym3Bridge(JSContext* ctx);
void refreshStylesForColorScheme(JSContext* ctx);

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
