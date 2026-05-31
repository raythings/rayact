#pragma once

// Main header for Rayact desktop implementation
// Includes all necessary declarations and includes

// Forward declarations for QuickJS types
typedef struct JSRuntime JSRuntime;
typedef struct JSContext JSContext;
typedef struct JSValue JSValue;
typedef struct JSValueConst JSValueConst;

// Include raylib bridge header
#include "raylib_bridge.hpp"

// Include platform bridge header
#include "platform.hpp"

// QuickJS bridge function declarations
extern JSValue JS_createWindow(JSContext* ctx, JSValue this_val,
                                int argc, JSValue* argv);

extern JSValue JS_closeWindow(JSContext* ctx, JSValue this_val,
                              int argc, JSValue* argv);

extern JSValue JS_setCurrentWindow(JSContext* ctx, JSValue this_val,
                                   int argc, JSValue* argv);

extern JSValue JS_getCurrentWindow(JSContext* ctx, JSValue this_val,
                                   int argc, JSValue* argv);

extern JSValue JS_getWindowCount(JSContext* ctx, JSValue this_val,
                                 int argc, JSValue* argv);

extern JSValue JS_initRaylib(JSContext* ctx, JSValue this_val,
                              int argc, JSValue* argv);

extern JSValue JS_renderRect(JSContext* ctx, JSValue this_val,
                             int argc, JSValue* argv);

extern JSValue JS_renderCircle(JSContext* ctx, JSValue this_val,
                               int argc, JSValue* argv);

extern JSValue JS_renderLine(JSContext* ctx, JSValue this_val,
                             int argc, JSValue* argv);

extern JSValue JS_updateFrame(JSContext* ctx, JSValue this_val,
                              int argc, JSValue* argv);

extern JSValue JS_navigateTo(JSContext* ctx, JSValue this_val,
                             int argc, JSValue* argv);

extern JSValue JS_navigateBack(JSContext* ctx, JSValue this_val,
                               int argc, JSValue* argv);

extern JSValue JS_navigateForward(JSContext* ctx, JSValue this_val,
                                  int argc, JSValue* argv);

extern JSValue JS_clearNavigationStack(JSContext* ctx, JSValue this_val,
                                       int argc, JSValue* argv);

extern JSValue JS_registerScreen(JSContext* ctx, JSValue this_val,
                                 int argc, JSValue* argv);

extern JSValue JS_getCurrentScreen(JSContext* ctx, JSValue this_val,
                                   int argc, JSValue* argv);

extern JSValue JS_printNavigationStatus(JSContext* ctx, JSValue this_val,
                                        int argc, JSValue* argv);

extern JSValue JS_getCurrentContext(JSContext* ctx, JSValue this_val,
                                    int argc, JSValue* argv);