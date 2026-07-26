#pragma once

extern "C" {
#include "quickjs.h"
}

#include <raym3/styles/Stylesheet.h>
#include <raym3/v2/Style.h>

#include <optional>
#include <string>
#include <vector>

// Parse a CSS dimensional length (px, rem, or unitless) into raym3 layout dp
// using platform PPI (Flutter logical-pixel semantics).
float parseCssLengthToLayoutDp(const std::string& v);

// Resolve space-separated class names against the global stylesheet.
JSValue resolveClassNames(JSContext* ctx, const std::string& classNames);

// Parse a CSS `transition` shorthand value, e.g.
//   "margin-bottom 250ms cubic-bezier(0.17, 0.59, 0.4, 0.77), opacity 0.1s ease-in"
// "none" yields an empty vector (explicit cancel). var(--x, 250ms) durations
// resolve to their fallback. Unknown properties are skipped. Returns nullopt
// when nothing parseable was found (treat as "no transition specified").
std::optional<std::vector<raym3::v2::TransitionEntry>>
parseTransitionShorthand(const std::string& value);

// Parse a CSS `animation` shorthand value, e.g.
//   "pulse 1s ease-in-out infinite", "spin 2s linear infinite".
// "none" yields an empty vector (explicit cancel). Names reference @keyframes
// registered from the same stylesheet. Returns nullopt when nothing parseable.
std::optional<std::vector<raym3::v2::AnimationEntry>>
parseAnimationShorthand(const std::string& value);

JSValue JS_importCSS(JSContext*, JSValue, int, JSValueConst*);

// Parse CSS from a string (see impl). Lets JS load stylesheet text fetched over
// the dev server or inlined in a bundle — the path mobile uses since project
// files are not on the device and its networking is async.
JSValue JS_importCSSText(JSContext*, JSValue, int, JSValueConst*);

// Install __rayactGetCSSVariable / __rayactSetCSSVariable(s) /
// __rayactResetCSSVariables. Setting a variable re-resolves className styles and
// invokes the global `onCSSVariablesChange` callback so JS can re-render.
void registerCSSVariableBindings(JSContext* ctx);

void cleanupCSSBridge(JSContext* ctx);
