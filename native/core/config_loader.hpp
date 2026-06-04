#pragma once

// App configuration loader.
//
// Reads an optional `app.json` / `app.config.js` / `app.config.ts` from the
// app's assets directory and produces an `AppConfig` struct consumed by the
// engine (single background color, future app-wide knobs).
//
// Schema (JSON, mirrors the Expo "expo"-key convention with our own key):
//
//   {
//     "rayact": {
//       "backgroundColor": "#000000"   // pre-raym3 clear + first-frame clear
//     }
//   }
//
// JS/TS files use `module.exports = { rayact: { ... } }`.
//
// All fields are optional. Missing fields fall back to defaults (black).
// If no config file is present, defaults are used and `loadAppConfig` is a
// no-op — the app still launches.

#include <cstdint>
#include <string>

extern "C" {
#include "quickjs.h"
}

namespace rayact {

struct AppConfig
{
    // Painted before raym3 produces any draw (the "empty" area below/around
    // the app's content tree) AND used as the first-frame clear.
    // Single field — pre-raym3 and first-frame are the same color.
    uint8_t backgroundColor[4] = { 0, 0, 0, 255 };
    // Reserved for future fields (e.g. defaultFontFamily, splashImage, ...).
};

// Load the optional app config. Tries, in order:
//   1. <assetsPath>/app.json
//   2. <assetsPath>/app.config.js
//   3. <assetsPath>/app.config.ts
//
// `ctx` is the QuickJS context used to evaluate .js/.ts modules. May be null
// if only JSON is needed. On any error (missing file, parse error, no
// `rayact` key) returns a default-initialized AppConfig — the app always
// has *some* config to read.
AppConfig loadAppConfig(JSContext* ctx, const char* assetsPath);

// Returns the most recently loaded config (default-initialized if
// loadAppConfig has not been called). Cheap — just returns a const ref.
const AppConfig& appConfig();

// Parse a color from a JS value. Accepts:
//   - "#RRGGBB" / "#RRGGBBAA"
//   - 0xRRGGBB / 0xRRGGBBAA (uint32)
//   - any int32/uint32/int64/uint64
// Returns true on success and writes the result to `out` (RGBA bytes).
// On failure, leaves `out` unchanged and returns false.
bool parseColorValue(JSContext* ctx, JSValue v, uint8_t out[4]);

} // namespace rayact
