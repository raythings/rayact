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
