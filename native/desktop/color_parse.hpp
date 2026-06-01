#pragma once

#include <raylib.h>
#include <cstdint>
#include <string>

// Parse a CSS color string to packed 0xRRGGBBAA (matches JS numeric color convention).
uint32_t ParseCssColor(const std::string& raw);

// Parse to raylib Color (r, g, b, a bytes).
Color ParseCssColorToRaylib(const std::string& raw);
