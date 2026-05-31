#pragma once

#include "quickjs.h"

// Window information structure
typedef struct {
    int id;
    char* title;
    int width;
    int height;
    bool isFocused;
    JSContext* context;
    bool isInitialized;
} RayactWindow;

// Global window management variables
extern RayactWindow** g_windows;
extern int g_windowCount;
extern int g_maxWindows;

// Window management functions
void initWindowManager();
void cleanupWindowManager();
RayactWindow* createWindow(int width, int height, const char* title);
void closeWindow(RayactWindow* window);
RayactWindow* getCurrentWindow();
void setCurrentWindow(RayactWindow* window);
RayactWindow* getWindowById(int id);
int getWindowCount();
RayactWindow** getWindows();

// Navigation management
typedef struct ScreenNode {
    char* name;
    char* script;
    struct ScreenNode* next;
    struct ScreenNode* prev;
} ScreenNode;

extern ScreenNode* g_navigationStack;
extern ScreenNode* g_currentScreen;

void initNavigationSystem();
void cleanupNavigationSystem();
void registerScreen(const char* name, const char* script);
void navigateToScreen(const char* name);
ScreenNode* getCurrentScreen();
void navigateBack();
void navigateForward();
void clearNavigationStack();
void printNavigationStatus();

// Utility functions
int generateWindowId();
bool isWindowValid(RayactWindow* window);