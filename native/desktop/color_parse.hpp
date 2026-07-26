#pragma once

#include <raylib.h>
#include <cstdint>
#include <string>

// Parse a CSS color string to packed 0xRRGGBBAA (matches JS numeric color convention).
uint32_t ParseCssColor(const std::string& raw);

// Parse to raylib Color (r, g, b, a bytes).
Color ParseCssColorToRaylib(const std::string& raw);

// std::regex source matching any CSS colour token — functional forms
// (rgb/hsl/hwb/lab/lch/oklab/oklch/color/color-mix), hex, or a named colour.
// Used to pick colours out of shorthands like linear-gradient() and box-shadow.
const std::string& CssColorTokenPattern();
