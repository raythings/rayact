// QuickJS bridge utility functions
#include "quickjs_bridge.hpp"
#include "raylib.h"
#include <cstring>

extern "C" {
#include "quickjs.h"
}

// Convert color from JavaScript object {r,g,b,a} to raylib Color
Color JS_ToColor(JSContext* ctx, JSValueConst val) {
    Color color = {255, 255, 255, 255};
    if (!JS_IsObject(val)) return color;

    auto get_ch = [&](const char* name, unsigned char& ch) {
        JSValue v = JS_GetPropertyStr(ctx, val, name);
        if (!JS_IsUndefined(v) && !JS_IsException(v)) {
            int i = 255;
            JS_ToInt32(ctx, &i, v);
            ch = (unsigned char)i;
        }
        JS_FreeValue(ctx, v);
    };
    get_ch("r", color.r);
    get_ch("g", color.g);
    get_ch("b", color.b);
    get_ch("a", color.a);
    return color;
}

// Convert raylib Color to JavaScript object {r,g,b,a}
JSValue ColorToJSObject(JSContext* ctx, Color color) {
    JSValue obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, obj, "r", JS_NewInt32(ctx, color.r));
    JS_SetPropertyStr(ctx, obj, "g", JS_NewInt32(ctx, color.g));
    JS_SetPropertyStr(ctx, obj, "b", JS_NewInt32(ctx, color.b));
    JS_SetPropertyStr(ctx, obj, "a", JS_NewInt32(ctx, color.a));
    return obj;
}
