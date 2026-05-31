#pragma once

#include "raylib.h"

class RaylibBridge {
public:
    static void initWindow(int width, int height, const char* title);
    static bool windowShouldClose();
    static void beginDrawing();
    static void endDrawing();
    static void clearBackground(Color color);
    static void drawRectangle(int x, int y, int width, int height, unsigned int color);
    static void drawCircle(int x, int y, int radius, unsigned int color);
    static void drawLine(int x1, int y1, int x2, int y2, unsigned int color);
    static void getWindowSize(int* width, int* height);
    static bool isWindowFocused();
    static void setWindowTitle(const char* title);
    static int getScreenWidth();
    static int getScreenHeight();
};
