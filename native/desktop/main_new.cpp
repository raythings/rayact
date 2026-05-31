// Rayact Multi-Window Desktop Application
// This manages multiple windows with a single QuickJS instance

#include "main.hpp"
#include "quickjs_bridge.hpp"
#include "window_manager.hpp"

extern "C" {
#include "quickjs.h"
#include "quickjs-libc.h"
}

#include <cstdio>
#include <cstring>
#include <iostream>

// Shape data structure for per-window rendering
struct Shape {
    int type;  // 0: rect, 1: circle, 2: line
    int x;
    int y;
    int width;
    int height;
    int radius;
    int x1;
    int y1;
    int x2;
    int y2;
    int rotation;
    unsigned int color;
};

// Global state
static RayactWindow* g_currentWindow = nullptr;
static bool g_windowManagementEnabled = false;
static std::vector<Shape> g_shapes;
static std::vector<JSModuleType> g_globalModules;

// Helper to get current window context safely
static JSContext* getCurrentContext() {
    if (!g_windowManagementEnabled || !g_currentWindow) {
        fprintf(stderr, "No current window active. Please create a window first.\n");
        return nullptr;
    }

    if (!isWindowValid(g_currentWindow)) {
        fprintf(stderr, "Current window is invalid.\n");
        return nullptr;
    }

    return g_currentWindow->context;
}

// Window management functions implementation
void initWindowManager() {
    g_maxWindows = 16;  // Maximum 16 windows
    g_windows = (RayactWindow**)calloc(g_maxWindows, sizeof(RayactWindow*));
    g_windowCount = 0;

    printf("Window manager initialized\n");
}

void cleanupWindowManager() {
    if (g_windows) {
        for (int i = 0; i < g_windowCount; i++) {
            if (g_windows[i]) {
                if (g_windows[i]->title) {
                    free(g_windows[i]->title);
                }
                if (g_windows[i]->context) {
                    JS_FreeContext(g_windows[i]->context);
                }
                free(g_windows[i]);
            }
        }
        free(g_windows);
    }
    g_windows = nullptr;
    g_windowCount = 0;
    g_maxWindows = 0;
}

RayactWindow* createWindow(int width, int height, const char* title) {
    if (g_windowCount >= g_maxWindows) {
        fprintf(stderr, "Maximum number of windows reached\n");
        return nullptr;
    }

    RayactWindow* window = (RayactWindow*)calloc(1, sizeof(RayactWindow));
    if (!window) {
        return nullptr;
    }

    window->id = generateWindowId();
    window->width = width;
    window->height = height;
    window->title = strdup(title);
    window->isFocused = (g_windowCount == 0);
    window->isInitialized = false;

    // Create context for this window
    window->context = initContextForWindow(g_rt, title);
    if (!window->context) {
        free(window->title);
        free(window);
        return nullptr;
    }

    // Register native functions for this window's context
    registerNativeFunctions(window->context);

    // Store window
    g_windows[g_windowCount++] = window;

    return window;
}

void closeWindow(RayactWindow* window) {
    if (!window) return;

    // Find and remove from array
    for (int i = 0; i < g_windowCount; i++) {
        if (g_windows[i] == window) {
            // Shift remaining windows
            for (int j = i; j < g_windowCount - 1; j++) {
                g_windows[j] = g_windows[j + 1];
            }
            g_windowCount--;

            // Cleanup
            if (window->title) {
                free(window->title);
            }
            if (window->context) {
                JS_FreeContext(window->context);
            }
            free(window);
            break;
        }
    }
}

RayactWindow* getCurrentWindow() {
    return g_currentWindow;
}

void setCurrentWindow(RayactWindow* window) {
    g_currentWindow = window;
}

RayactWindow* getWindowById(int id) {
    for (int i = 0; i < g_windowCount; i++) {
        if (g_windows[i] && g_windows[i]->id == id) {
            return g_windows[i];
        }
    }
    return nullptr;
}

int getWindowCount() {
    return g_windowCount;
}

RayactWindow** getWindows() {
    return g_windows;
}

// Navigation system implementation
typedef struct {
    char* name;
    char* script;
    ScreenNode* next;
    ScreenNode* prev;
} ScreenNode;

static ScreenNode* g_navigationStack = nullptr;
static ScreenNode* g_currentScreen = nullptr;

void initNavigationSystem() {
    printf("Navigation system initialized\n");
}

void cleanupNavigationSystem() {
    ScreenNode* current = g_navigationStack;
    while (current) {
        ScreenNode* next = current->next;
        if (current->name) free(current->name);
        if (current->script) free(current->script);
        free(current);
        current = next;
    }
    g_navigationStack = nullptr;
    g_currentScreen = nullptr;
}

void registerScreen(const char* name, const char* script) {
    // Find existing screen
    ScreenNode* current = g_navigationStack;
    while (current) {
        if (strcmp(current->name, name) == 0) {
            free(current->script);
            current->script = strdup(script);
            printf("Updated screen '%s'\n", name);
            return;
        }
        current = current->next;
    }

    // Create new screen
    ScreenNode* newScreen = (ScreenNode*)calloc(1, sizeof(ScreenNode));
    newScreen->name = strdup(name);
    newScreen->script = strdup(script);

    // Add to stack
    newScreen->next = g_navigationStack;
    if (g_navigationStack) {
        g_navigationStack->prev = newScreen;
    }
    g_navigationStack = newScreen;

    printf("Registered screen '%s'\n", name);
}

void navigateToScreen(const char* name) {
    ScreenNode* current = g_navigationStack;
    while (current) {
        if (strcmp(current->name, name) == 0) {
            g_currentScreen = current;
            printf("Navigated to screen '%s'\n", name);
            return;
        }
        current = current->next;
    }

    fprintf(stderr, "Screen '%s' not found\n", name);
}

void navigateBack() {
    if (g_currentScreen && g_currentScreen->prev) {
        g_currentScreen = g_currentScreen->prev;
        printf("Navigated back to screen '%s'\n", g_currentScreen->name);
    } else {
        printf("Already at top of navigation stack\n");
    }
}

void navigateForward() {
    if (g_currentScreen && g_currentScreen->next) {
        g_currentScreen = g_currentScreen->next;
        printf("Navigated forward to screen '%s'\n", g_currentScreen->name);
    } else {
        printf("Already at bottom of navigation stack\n");
    }
}

void clearNavigationStack() {
    ScreenNode* current = g_navigationStack;
    while (current) {
        ScreenNode* next = current->next;
        if (current->name) free(current->name);
        if (current->script) free(current->script);
        free(current);
        current = next;
    }
    g_navigationStack = nullptr;
    g_currentScreen = nullptr;
    printf("Navigation stack cleared\n");
}

ScreenNode* getCurrentScreen() {
    return g_currentScreen;
}

void printNavigationStatus() {
    printf("\n=== Navigation Status ===\n");
    printf("Current Screen: %s\n", g_currentScreen ? g_currentScreen->name : "None");

    ScreenNode* current = g_navigationStack;
    int index = 0;
    printf("Navigation Stack:\n");
    while (current) {
        printf("  [%d] %s%s\n", index++, current->name,
               (current == g_currentScreen) ? " <- Current" : "");
        current = current->next;
    }
    printf("==========================\n\n");
}

// Utility functions
int generateWindowId() {
    static int nextId = 1;
    return nextId++;
}

bool isWindowValid(RayactWindow* window) {
    return window && window->context && window->isInitialized;
}

// Initialize Raylib
void RaylibBridge::initWindow(int width, int height, const char* title) {
    if (!g_currentWindow) {
        fprintf(stderr, "No current window for initialization\n");
        return;
    }

    InitWindow(width, height, title);
    SetTargetFPS(60);
    g_currentWindow->isInitialized = true;
    printf("Raylib window initialized for window %d\n", g_currentWindow->id);
}

// Check if window should close
bool RaylibBridge::windowShouldClose() {
    return WindowShouldClose();
}

// Start drawing
void RaylibBridge::beginDrawing() {
    BeginDrawing();
}

// End drawing
void RaylibBridge::endDrawing() {
    EndDrawing();
}

// Clear background
void RaylibBridge::clearBackground(Color color) {
    ClearBackground(color);
}

// Draw rectangle
void RaylibBridge::drawRectangle(int x, int y, int width, int height, unsigned int color) {
    DrawRectangle(x, y, width, height, color);
}

// Draw circle
void RaylibBridge::drawCircle(int x, int y, int radius, unsigned int color) {
    DrawCircle(x, y, radius, color);
}

// Draw line
void RaylibBridge::drawLine(int x1, int y1, int x2, int y2, unsigned int color) {
    DrawLine(x1, y1, x2, y2, color);
}

// Get window dimensions
void RaylibBridge::getWindowSize(int* width, int* height) {
    if (width) *width = GetRenderWidth();
    if (height) *height = GetRenderHeight();
}

// Check if window is focused
bool RaylibBridge::isWindowFocused() {
    return IsWindowFocused();
}

// Set window title
void RaylibBridge::setWindowTitle(const char* title) {
    SetWindowTitle(title);
}

// Get window width
int RaylibBridge::getScreenWidth() {
    return GetScreenWidth();
}

// Get window height
int RaylibBridge::getScreenHeight() {
    return GetScreenHeight();
}

// Platform detection
bool PlatformBridge::isDesktop() {
    return true;
}

bool PlatformBridge::isAndroid() {
    return false;
}

bool PlatformBridge::isIOS() {
    return false;
}

bool PlatformBridge::isWeb() {
    return false;
}

const char* PlatformBridge::getPlatformName() {
#ifdef _WIN32
    return "windows";
#elif __APPLE__
    return "macos";
#elif __linux__
    return "linux";
#elif __ANDROID__
    return "android";
#elif __EMSCRIPTEN__
    return "web";
#else
    return "unknown";
#endif
}

std::string PlatformBridge::getPlatformVersion() {
#ifdef _WIN32
    OSVERSIONINFOEXA osvi;
    ZeroMemory(&osvi, sizeof(OSVERSIONINFOEXA));
    osvi.dwOSVersionInfoSize = sizeof(OSVERSIONINFOEXA);
    GetVersionExA((OSVERSIONINFOA*)&osvi);
    return std::to_string(osvi.dwMajorVersion) + "." + std::to_string(osvi.dwMinorVersion);
#elif __APPLE__
    SInt32 major, minor, patch;
    Gestalt(gestaltSystemVersionMajor, &major);
    Gestalt(gestaltSystemVersionMinor, &minor);
    Gestalt(gestaltSystemVersionPointPatch, &patch);
    return std::to_string(major) + "." + std::to_string(minor) + "." + std::to_string(patch);
#elif __linux__
    FILE* fp = fopen("/etc/os-release", "r");
    if (fp) {
        char line[256];
        while (fgets(line, sizeof(line), fp)) {
            if (strncmp(line, "VERSION_ID=", 11) == 0) {
                char* ver = strchr(line, '"') + 1;
                char* end = strchr(ver, '"');
                if (end) {
                    *end = '\0';
                }
                std::string version = ver;
                fclose(fp);
                return version;
            }
        }
        fclose(fp);
    }
    return "unknown";
#elif __ANDROID__
    std::string version = std::to_string(ANDROID_VERSION_MAJOR) + "." +
                         std::to_string(ANDROID_VERSION_MINOR) + "." +
                         std::to_string(ANDROID_VERSION_PATCH);
    return version;
#else
    return "unknown";
#endif
}

void PlatformBridge::printPlatformInfo() {
    std::cout << "Platform Detection:" << std::endl;
    std::cout << "  Desktop: " << (isDesktop() ? "Yes" : "No") << std::endl;
    std::cout << "  Android: " << (isAndroid() ? "Yes" : "No") << std::endl;
    std::cout << "  iOS: " << (isIOS() ? "Yes" : "No") << std::endl;
    std::cout << "  Web: " << (isWeb() ? "Yes" : "No") << std::endl;
    std::cout << "  Platform: " << getPlatformName() << std::endl;
    std::cout << "  Version: " << getPlatformVersion() << std::endl;
}