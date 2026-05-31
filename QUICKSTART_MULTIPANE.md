# 🚀 Rayact Multi-Window System - Quick Start

## ✨ What's New

The Rayact project now supports **multiple windows** managed by a single QuickJS instance! This enables native navigation stacks and complex multi-window applications.

## 🎯 Key Features

### Windows Management
- ✅ **Multiple Windows**: Create any number of windows (up to 16)
- ✅ **Window Switching**: Easy switching between windows
- ✅ **Context Isolation**: Each window has its own JavaScript context
- ✅ **Window Lifecycle**: Proper creation and cleanup

### Navigation System
- ✅ **Screen Registration**: Register screens with JavaScript code
- ✅ **Navigation Stack**: Navigate between screens in LIFO order
- ✅ **Back/Forward Navigation**: Traditional navigation control
- ✅ **Stack Inspection**: View current navigation state

## 📚 New Demos

### 1. Multi-Window Navigation (`demo-navigation.js`)
Complete demonstration of the navigation system.

```bash
./build/bin/rayact_desktop apps/desktop/demo-navigation.js
```

### 2. Multi-Pane Layout (`demo-multipane.js`)
Complex multi-window application pattern.

```bash
./build/bin/rayact_desktop apps/desktop/demo-multipane.js
```

## 📖 API Reference

### Window Management

```javascript
// Create a new window
const windowId = createWindow(800, 600, "My Window");

// Get current window
const currentWindow = getCurrentWindow();

// Switch to a specific window
setCurrentWindow(windowId);

// Get total window count
const count = getWindowCount();

// Close a window
closeWindow(windowId);

// Get window by ID
const window = getWindowById(windowId);
```

### Navigation Management

```javascript
// Register a screen
registerScreen("home", `
    initRaylib(800, 600, "Home");
    renderRect(100, 100, 200, 150, 0xFF0000FF);
    updateFrame();
`);

// Navigate to a screen
navigateToScreen("home");

// Navigate back
navigateBack();

// Navigate forward
navigateForward();

// Clear navigation history
clearNavigationStack();

// Get current screen
const screen = getCurrentScreen();
console.log(screen.name); // "home"

// Print navigation status
printNavigationStatus();
```

## 🎨 Quick Examples

### Example 1: Simple Navigation
```javascript
// Register screens
registerScreen("screen1", `
    initRaylib(800, 600, "Screen 1");
    renderRect(100, 100, 200, 150, 0xFF0000FF);
    updateFrame();
`);

// Navigate
navigateToScreen("screen1");
```

### Example 2: Multiple Windows
```javascript
// Create windows
const win1 = createWindow(800, 600, "Window 1");
const win2 = createWindow(600, 400, "Window 2");

// Manage them
setCurrentWindow(win1);
navigateToScreen("screen1");

setCurrentWindow(win2);
navigateToScreen("screen2");
```

### Example 3: Complex App
```javascript
// Create main windows
const app = createWindow(1024, 768, "Main App");
const sidebar = createWindow(250, 768, "Sidebar");

// Register screens for main
registerScreen("app-home", "initRaylib(1024, 768, 'Home'); ...");
registerScreen("app-files", "initRaylib(1024, 768, 'Files'); ...");

// Register screens for sidebar
registerScreen("sidebar-files", "initRaylib(250, 768, 'Files'); ...");

// Initialize
setCurrentWindow(app);
navigateToScreen("app-home");

setCurrentWindow(sidebar);
navigateToScreen("sidebar-files");
```

## 📊 Architecture Overview

```
QuickJS Runtime (1 instance)
├── Window 1 (Context 1) → Screen 1 → Screen 2
├── Window 2 (Context 2) → Screen A → Screen B
└── Window 3 (Context 3) → Screen X
```

**Benefits:**
- Single runtime, multiple contexts
- Each window maintains independent state
- Shared global state available
- Efficient memory management

## 🔧 Technical Details

### Window Structure
```cpp
struct RayactWindow {
    int id;               // Unique window identifier
    char* title;          // Window title
    int width;            // Window width
    int height;           // Window height
    bool isFocused;       // Window focus state
    JSContext* context;   // JavaScript context for this window
    bool isInitialized;   // Initialization status
};
```

### Navigation Structure
```cpp
struct ScreenNode {
    char* name;           // Screen name
    char* script;         // JavaScript code to execute
    ScreenNode* next;     // Next screen in stack
    ScreenNode* prev;     // Previous screen in stack
};
```

## 📚 Full Documentation

- **[Multi-Window System Docs](docs/multi-window-system.md)** - Complete API reference
- **[Demo Guide](DEMO_GUIDE.md)** - All demo applications explained
- **[Main README](README.md)** - Overall project documentation

## 🎯 Next Steps

1. **Build the Project**
   ```bash
   cmake -B build -S . -DENABLE_DESKTOP=ON
   cmake --build build
   ```

2. **Run a Demo**
   ```bash
   ./build/bin/rayact_desktop apps/desktop/demo-navigation.js
   ```

3. **Try the Multi-Window Demos**
   ```bash
   ./build/bin/rayact_desktop apps/desktop/demo-multipane.js
   ```

## ✅ Current Features

### Windows
- ✅ Create, close, and switch windows
- ✅ Get window count and IDs
- ✅ Window focus management
- ✅ Up to 16 windows supported

### Navigation
- ✅ Screen registration and navigation
- ✅ Navigation stack (LIFO)
- ✅ Back/forward navigation
- ✅ View current navigation state

### System
- ✅ Single QuickJS runtime instance
- ✅ Per-window JavaScript contexts
- ✅ Shared global state
- ✅ Automatic memory cleanup

## 🚦 Status

- ✅ Multi-window system **implemented**
- 🚧 Desktop testing **in progress**
- 📅 Android platform **planned**
- 📅 Web platform **planned**

## 🎉 Impact

This implementation enables:
1. **Native multi-window applications**
2. **Tabbed interface patterns**
3. **Split pane applications**
4. **Modal dialogs**
5. **Complex navigation flows**

---

**Ready to build advanced multi-window applications!** 

Start with `demo-navigation.js` to see the system in action.