# Multi-Window System Documentation

## Overview

The Rayact multi-window system allows a single QuickJS runtime instance to manage multiple windows/activities/viewcontrollers, enabling native navigation stacks and complex multi-window applications.

## Architecture

### Single Runtime, Multiple Contexts

```
QuickJS Runtime (1 instance)
├── Context 1 (Window 1)
├── Context 2 (Window 2)
├── Context 3 (Window 3)
└── ...
```

Each window gets its own JavaScript context while sharing the same QuickJS runtime, enabling efficient memory management and shared JavaScript state.

### Window Management

```cpp
// Global window management
extern RayactWindow** g_windows;
extern int g_windowCount;
extern RayactWindow* g_currentWindow;
```

## API Reference

### Window Creation

#### `createWindow(width, height, title)`
Create a new window managed by the QuickJS runtime.

```javascript
const windowId = createWindow(800, 600, "My Window");

// Parameters:
// - width: Window width (integer)
// - height: Window height (integer)
// - title: Window title (string)

// Returns:
// - windowId: The unique identifier for the new window
```

**Example:**
```javascript
const win1 = createWindow(800, 600, "Window 1");
const win2 = createWindow(600, 400, "Window 2");
console.log("Window count:", getWindowCount());
```

### Window Management

#### `getCurrentWindow()`
Get the currently active window.

```javascript
const window = getCurrentWindow();
if (window !== null) {
    console.log("Current window:", window);
}
```

**Returns:** Window ID or null if no window is active

#### `setCurrentWindow(windowId)`
Switch the current window context.

```javascript
setCurrentWindow(1); // Switch to window 1
console.log("Current window:", getCurrentWindow());
```

#### `closeWindow(windowId)`
Close a specific window.

```javascript
closeWindow(1); // Close window 1
console.log("Window count:", getWindowCount());
```

#### `getWindowCount()`
Get the total number of windows.

```javascript
const count = getWindowCount();
console.log("There are " + count + " windows open");
```

**Returns:** Integer count of active windows

### Navigation System

The navigation system maintains a stack of screens that can be navigated between, similar to iOS navigation controllers or browser history.

#### `registerScreen(name, script)`
Register a screen with navigation capabilities.

```javascript
registerScreen("home", `
    initRaylib(800, 600, "Home Screen");
    renderRect(100, 100, 200, 150, 0xFF0000FF);
    updateFrame();
`);

// Parameters:
// - name: Unique screen name
// - script: JavaScript code to execute when screen is shown
```

#### `navigateToScreen(name)`
Navigate to a specific screen.

```javascript
navigateToScreen("home");
navigateToScreen("profile");
```

#### `navigateBack()`
Navigate to the previous screen in the stack.

```javascript
navigateToScreen("screen1");
navigateToScreen("screen2");
navigateToScreen("screen3");

// To go back:
navigateBack(); // Goes to screen 2
```

#### `navigateForward()`
Navigate to the next screen in the stack.

```javascript
// After going back:
navigateBack(); // Now on screen 2
navigateForward(); // Goes back to screen 3
```

#### `clearNavigationStack()`
Clear all navigation history and go to the beginning.

```javascript
clearNavigationStack();
// Navigation stack is now empty
```

#### `getCurrentScreen()`
Get the currently active screen.

```javascript
const screen = getCurrentScreen();
if (screen) {
    console.log("Current screen:", screen.name);
}
```

**Returns:** Screen object with name property, or null

#### `printNavigationStatus()`
Print the current navigation stack status to console.

```javascript
printNavigationStatus();
// Output:
// === Navigation Status ===
// Current Screen: screen1
// Navigation Stack:
//   [0] screen1 <- Current
//   [1] screen2
//   [2] screen3
// ==========================
```

### Utilities

#### `getCurrentContext()`
Get the current window's JavaScript context (internal function).

```javascript
// This function is for internal use only
const ctx = getCurrentContext();
```

## Usage Patterns

### Pattern 1: Simple Navigation

```javascript
// Register screens
registerScreen("login", "initRaylib(800, 600, 'Login'); updateFrame();");
registerScreen("dashboard", "initRaylib(800, 600, 'Dashboard'); updateFrame();");

// Navigate between screens
navigateToScreen("login");
navigateToScreen("dashboard");
```

### Pattern 2: Multiple Windows

```javascript
// Create multiple windows
const win1 = createWindow(800, 600, "Main App");
const win2 = createWindow(600, 400, "Settings");

// Manage windows
setCurrentWindow(win1);
navigateToScreen("home");

setCurrentWindow(win2);
navigateToScreen("settings");
```

### Pattern 3: Window-Specific Screens

```javascript
// Register windows first
const mainWindow = createWindow(800, 600, "Main");
const settingsWindow = createWindow(600, 400, "Settings");

// Add navigation for main window
registerScreen("main-home", "initRaylib(800, 600, 'Home'); ...");
registerScreen("main-about", "initRaylib(800, 600, 'About'); ...");

// Add navigation for settings window
registerScreen("settings-general", "initRaylib(600, 400, 'General'); ...");
registerScreen("settings-appearance", "initRaylib(600, 400, 'Appearance'); ...");

// Navigate based on current window
const currentWindow = getCurrentWindow();
if (currentWindow === mainWindow) {
    navigateToScreen("main-home");
} else if (currentWindow === settingsWindow) {
    navigateToScreen("settings-general");
}
```

### Pattern 4: Complex Multi-Window App

```javascript
// Create main application window
const appWindow = createWindow(1024, 768, "My Application");

// Create panel windows
const sidebarWindow = createWindow(300, 768, "Sidebar");
const propertiesWindow = createWindow(400, 768, "Properties");

// Register screens for main window
registerScreen("app-dashboard", "initRaylib(1024, 768, 'Dashboard'); ...");
registerScreen("app-editor", "initRaylib(1024, 768, 'Editor'); ...");
registerScreen("app-settings", "initRaylib(1024, 768, 'Settings'); ...");

// Register screens for sidebar
registerScreen("sidebar-files", "initRaylib(300, 768, 'Files'); ...");
registerScreen("sidebar-examples", "initRaylib(300, 768, 'Examples'); ...");

// Manage complex navigation
function switchToWindow(windowId) {
    setCurrentWindow(windowId);
}

function navigateHome() {
    navigateToScreen("app-dashboard");
}

function navigateFiles() {
    setCurrentWindow(sidebarWindow);
    navigateToScreen("sidebar-files");
}

function navigateEditor() {
    switchToWindow(appWindow);
    navigateToScreen("app-editor");
}

// Initialize app
setCurrentWindow(appWindow);
navigateToScreen("app-dashboard");
```

## Window Lifecycle

### Creation Flow
1. Call `createWindow()` - Creates context and initializes window
2. `initRaylib()` called automatically for new window
3. Register screen scripts
4. Navigate to initial screen

### Cleanup Flow
1. Call `closeWindow()` - Removes context and frees memory
2. Handles focus management
3. Updates current window pointer

## Memory Management

### Automatic Cleanup
- Contexts are automatically cleaned up when windows are closed
- JavaScript memory is freed when contexts are destroyed
- Shapes and resources are cleaned up automatically

### Window Limits
- Maximum windows: 16 (configurable in main.cpp)
- Each window gets 32MB QuickJS heap (configurable)

## Advanced Features

### Shared State
Multiple windows can share global state through the QuickJS runtime:

```javascript
// Create shared state
window.__global = {
    user: { name: "John", loggedIn: true },
    settings: { theme: "dark" }
};

// Can access from any window
console.log("Current user:", window.__global.user.name);
```

### Window-Specific State
Each window maintains its own context and state:

```javascript
// Create unique state for each window
setCurrentWindow(window1);
window1.__local = { count: 0 };

setCurrentWindow(window2);
window2.__local = { count: 0 };
```

### Event Handling
Each window can have its own event handlers:

```javascript
// Register handlers per window
setCurrentWindow(mainWindow);
window.addEventListener('resize', handleResize);

setCurrentWindow(settingsWindow);
window.addEventListener('close', handleWindowClose);
```

## Platform Integration

### Desktop (Windows/Linux/macOS)
- Native window management via raylib
- Multiple window support
- Focus/blur events
- Window positioning

### Android (Future)
- Activity management
- View controller stack
- Back navigation support
- Activity lifecycle events

### Web (Future)
- Browser tabs/windows
- Canvas elements
- DOM window management
- Visibility API

## Best Practices

1. **Initialize Windows Early**: Create all windows before complex navigation
2. **Clean Up Properly**: Always close unused windows to free memory
3. **Manage Navigation Carefully**: Don't create circular navigation
4. **Use Screen Names Wisely**: Choose unique, descriptive screen names
5. **Handle Focus Changes**: Update UI when switching windows
6. **Maintain Window Context**: Always call `setCurrentWindow()` before navigation

## Common Patterns

### Main Menu Pattern
```javascript
registerScreen("menu", "initRaylib(800, 600, 'Main Menu'); ...");
registerScreen("game", "initRaylib(800, 600, 'Game'); ...");
registerScreen("settings", "initRaylib(800, 600, 'Settings'); ...");

function showMenu() {
    navigateToScreen("menu");
}
```

### Tabbed Interface Pattern
```javascript
const window1 = createWindow(800, 600, "Tab 1");
const window2 = createWindow(800, 600, "Tab 2");

registerScreen("tab1-content", "initRaylib(800, 600, 'Content 1'); ...");
registerScreen("tab2-content", "initRaylib(800, 600, 'Content 2'); ...");

function switchTab(tabId) {
    setCurrentWindow(tabId);
    navigateToScreen(tabId + "-content");
}
```

### Modal Pattern
```javascript
const mainWindow = createWindow(800, 600, "Main");
const modalWindow = createWindow(500, 300, "Modal");

registerScreen("main-content", "initRaylib(800, 600, 'Main Content'); ...");
registerScreen("modal-content", "initRaylib(500, 300, 'Modal Content'); ...");

function showModal() {
    setCurrentWindow(modalWindow);
    navigateToScreen("modal-content");
}

function showModalAndKeepMain() {
    // Keep main window open
    navigateToScreen("modal-content");
}
```

## Troubleshooting

### Issue: "No current window"
**Solution**: Ensure you've created a window before navigation
```javascript
const win = createWindow(800, 600, "Test");
setCurrentWindow(win);
```

### Issue: "Window not found"
**Solution**: Verify the window ID exists
```javascript
const winId = 1;
const win = getWindowById(winId);
if (!win) {
    console.error("Window", winId, "not found");
}
```

### Issue: "Screen not found"
**Solution**: Register screen before navigation
```javascript
registerScreen("my-screen", "initRaylib(800, 600, 'Test'); ...");
navigateToScreen("my-screen");
```

---

**Version**: 0.1.0
**Status**: Desktop Only - Android/Web Coming
**Next Features**: View transitions, multi-window optimization