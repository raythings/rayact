#pragma once

extern "C" {
#include "quickjs.h"
}

#include <map>
#include <string>

// Global stylesheet: all rules registered by importCSS() calls.
// Key = CSS selector (e.g. ".button"), value = map of CSS property → raw value.
using CSSPropMap  = std::map<std::string, std::string>;
using CSSStyleMap = std::map<std::string, CSSPropMap>;
extern CSSStyleMap g_stylesheet;

// Resolve space-separated class names (without leading dot) against g_stylesheet.
// Returns a JS style object usable as a createView/createText style argument.
// Later class names override earlier ones on conflict.
// Caller must JS_FreeValue the result.
JSValue resolveClassNames(JSContext* ctx, const std::string& classNames);

JSValue JS_importCSS(JSContext*, JSValue, int, JSValueConst*);
void cleanupCSSBridge(JSContext* ctx);
