#include "raylib_bridge.hpp"
#include <cstdio>

static inline Color colorFromUint(unsigned int c) {
    return {
        (unsigned char)((c >> 24) & 0xFF),
        (unsigned char)((c >> 16) & 0xFF),
        (unsigned char)((c >> 8)  & 0xFF),
        (unsigned char)(c & 0xFF)
    };
}

void RaylibBridge::initWindow(int width, int height, const char* title) {
    InitWindow(width, height, title);
    SetTargetFPS(60);
    printf("Raylib window initialized: %dx%d\n", width, height);
}

bool RaylibBridge::windowShouldClose() { return WindowShouldClose(); }
void RaylibBridge::beginDrawing()      { BeginDrawing(); }
void RaylibBridge::endDrawing()        { EndDrawing(); }

void RaylibBridge::clearBackground(Color color) { ClearBackground(color); }

void RaylibBridge::drawRectangle(int x, int y, int width, int height, unsigned int color) {
    DrawRectangle(x, y, width, height, colorFromUint(color));
}

void RaylibBridge::drawCircle(int x, int y, int radius, unsigned int color) {
    DrawCircle(x, y, (float)radius, colorFromUint(color));
}

void RaylibBridge::drawLine(int x1, int y1, int x2, int y2, unsigned int color) {
    DrawLine(x1, y1, x2, y2, colorFromUint(color));
}

void RaylibBridge::getWindowSize(int* width, int* height) {
    if (width)  *width  = GetRenderWidth();
    if (height) *height = GetRenderHeight();
}

bool RaylibBridge::isWindowFocused()         { return IsWindowFocused(); }
void RaylibBridge::setWindowTitle(const char* title) { SetWindowTitle(title); }
int  RaylibBridge::getScreenWidth()          { return GetScreenWidth(); }
int  RaylibBridge::getScreenHeight()         { return GetScreenHeight(); }
