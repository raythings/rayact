#include "window_manager.hpp"
#include <cstdlib>
#include <cstring>
#include <cstdio>

// Globals defined here; declared extern in header
RayactWindow** g_windows = nullptr;
int g_windowCount = 0;
int g_maxWindows = 0;

ScreenNode* g_navigationStack = nullptr;
ScreenNode* g_currentScreen = nullptr;

static int g_nextWindowId = 1;

int generateWindowId() { return g_nextWindowId++; }

bool isWindowValid(RayactWindow* window) {
    if (!window) return false;
    for (int i = 0; i < g_windowCount; i++) {
        if (g_windows[i] == window) return true;
    }
    return false;
}

void initWindowManager() {
    g_maxWindows = 16;
    g_windows = (RayactWindow**)calloc(g_maxWindows, sizeof(RayactWindow*));
    g_windowCount = 0;
}

void cleanupWindowManager() {
    for (int i = 0; i < g_windowCount; i++) {
        if (g_windows[i]) {
            free(g_windows[i]->title);
            free(g_windows[i]);
        }
    }
    free(g_windows);
    g_windows = nullptr;
    g_windowCount = 0;
}

RayactWindow* createWindow(int width, int height, const char* title) {
    if (g_windowCount >= g_maxWindows) return nullptr;
    RayactWindow* w = (RayactWindow*)calloc(1, sizeof(RayactWindow));
    w->id = generateWindowId();
    w->title = strdup(title ? title : "");
    w->width = width;
    w->height = height;
    w->isFocused = true;
    w->context = nullptr;
    w->isInitialized = true;
    g_windows[g_windowCount++] = w;
    return w;
}

static RayactWindow* g_currentWindowPtr = nullptr;

void closeWindow(RayactWindow* window) {
    for (int i = 0; i < g_windowCount; i++) {
        if (g_windows[i] == window) {
            free(g_windows[i]->title);
            free(g_windows[i]);
            g_windows[i] = g_windows[--g_windowCount];
            g_windows[g_windowCount] = nullptr;
            if (g_currentWindowPtr == window) g_currentWindowPtr = nullptr;
            return;
        }
    }
}

RayactWindow* getCurrentWindow() { return g_currentWindowPtr; }
void setCurrentWindow(RayactWindow* window) { g_currentWindowPtr = window; }

RayactWindow* getWindowById(int id) {
    for (int i = 0; i < g_windowCount; i++) {
        if (g_windows[i] && g_windows[i]->id == id) return g_windows[i];
    }
    return nullptr;
}

int getWindowCount() { return g_windowCount; }
RayactWindow** getWindows() { return g_windows; }

// Navigation system

void initNavigationSystem() {
    g_navigationStack = nullptr;
    g_currentScreen = nullptr;
}

void cleanupNavigationSystem() {
    ScreenNode* node = g_navigationStack;
    while (node) {
        ScreenNode* next = node->next;
        free(node->name);
        free(node->script);
        free(node);
        node = next;
    }
    g_navigationStack = nullptr;
    g_currentScreen = nullptr;
}

void registerScreen(const char* name, const char* script) {
    ScreenNode* node = (ScreenNode*)calloc(1, sizeof(ScreenNode));
    node->name = strdup(name ? name : "");
    node->script = strdup(script ? script : "");
    node->next = g_navigationStack;
    node->prev = nullptr;
    if (g_navigationStack) g_navigationStack->prev = node;
    g_navigationStack = node;
}

void navigateToScreen(const char* name) {
    ScreenNode* node = g_navigationStack;
    while (node) {
        if (strcmp(node->name, name) == 0) {
            g_currentScreen = node;
            return;
        }
        node = node->next;
    }
    printf("Screen not found: %s\n", name);
}

ScreenNode* getCurrentScreen() { return g_currentScreen; }

void navigateBack() {
    if (g_currentScreen && g_currentScreen->prev)
        g_currentScreen = g_currentScreen->prev;
}

void navigateForward() {
    if (g_currentScreen && g_currentScreen->next)
        g_currentScreen = g_currentScreen->next;
}

void clearNavigationStack() {
    cleanupNavigationSystem();
}

void printNavigationStatus() {
    printf("Navigation: current=%s, screens=%s\n",
        g_currentScreen ? g_currentScreen->name : "none",
        g_navigationStack ? "registered" : "empty");
}
