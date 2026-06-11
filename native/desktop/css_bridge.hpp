#pragma once

extern "C" {
#include "quickjs.h"
}

#include <raym3/styles/Stylesheet.h>
#include <raym3/v2/Style.h>

#include <optional>
#include <string>
#include <vector>

// Resolve space-separated class names against the global stylesheet.
JSValue resolveClassNames(JSContext* ctx, const std::string& classNames);

// Parse a CSS `transition` shorthand value, e.g.
//   "margin-bottom 250ms cubic-bezier(0.17, 0.59, 0.4, 0.77), opacity 0.1s ease-in"
// "none" yields an empty vector (explicit cancel). var(--x, 250ms) durations
// resolve to their fallback. Unknown properties are skipped. Returns nullopt
// when nothing parseable was found (treat as "no transition specified").
std::optional<std::vector<raym3::v2::TransitionEntry>>
parseTransitionShorthand(const std::string& value);

JSValue JS_importCSS(JSContext*, JSValue, int, JSValueConst*);
void cleanupCSSBridge(JSContext* ctx);
