#pragma once

extern "C" {
#include "quickjs.h"
}

#include <raym3/styles/Stylesheet.h>

// Resolve space-separated class names against the global stylesheet.
JSValue resolveClassNames(JSContext* ctx, const std::string& classNames);

JSValue JS_importCSS(JSContext*, JSValue, int, JSValueConst*);
void cleanupCSSBridge(JSContext* ctx);
