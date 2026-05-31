# Rayact Multi-Window Demos

This directory contains demo applications showcasing the multi-window navigation system.

## Available Demos

### 1. Basic Shapes (`app.js`)
Introduction to basic shape rendering.

**Features:**
- Simple shapes (rectangles, circles, lines)
- Basic color usage
- Frame update pattern

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/app.js
```

### 2. Color Palette (`demo-colors.js`)
Demonstrates the color system with a grid of colored rectangles.

**Features:**
- 12 color variations
- Inverted borders
- Grid layout
- Array iteration

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/demo-colors.js
```

### 3. Shapes Geometry (`demo-shapes.js`)
Shows various geometric shapes and patterns.

**Features:**
- Circle grid (3x5)
- Rectangle grid (2x6)
- Concentric circles
- Cross lines
- Diagonal lines
- Triangle

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/demo-shapes.js
```

### 4. Star Pattern (`demo-star.js`)
Creates a beautiful star shape using multiple lines.

**Features:**
- 10-point star
- 12 radial rays
- Circle borders
- Gradient colors
- Animation loop structure

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/demo-star.js
```

### 5. Interactive (`demo-interactive.js`)
Demonstrates animation concepts and interaction structure.

**Features:**
- Mouse tracking
- Animation loop pattern
- Color selection
- Keyboard shortcuts
- Event handling concepts

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/demo-interactive.js
```

### 6. Multi-Window Navigation (`demo-navigation.js`)
**NEW!** Full multi-window navigation system demonstration.

**Features:**
- Multiple window creation
- Screen registration
- Navigation stack management
- Window switching
- System information display
- Complex navigation patterns

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/demo-navigation.js
```

**Key Concepts Demonstrated:**
```javascript
// Create multiple windows
const win1 = createWindow(800, 600, "Window 1");
const win2 = createWindow(600, 400, "Window 2");

// Switch between windows
setCurrentWindow(win1);

// Register screens
registerScreen("main", "initRaylib(800, 600, 'Main'); updateFrame();");
registerScreen("profile", "initRaylib(800, 600, 'Profile'); updateFrame();");

// Navigate through screens
navigateToScreen("main");
navigateToScreen("profile");

// Get window count
const count = getWindowCount(); // Returns: 2

// Print navigation status
printNavigationStatus();
```

### 7. Multi-Pane Layout (`demo-multipane.js`)
**NEW!** Demonstrates complex multi-window applications.

**Features:**
- Multiple independent windows
- Screen-specific content
- Navigation stack per screen
- Window management API
- Practical application patterns

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/demo-multipane.js
```

**Key Concepts Demonstrated:**
```javascript
// Create complex app structure
const mainWindow = createWindow(800, 600, "Main App");
const sidebarWindow = createWindow(300, 600, "Sidebar");
const propertiesWindow = createWindow(400, 600, "Properties");

// Register screens for different contexts
registerScreen("main-home", "initRaylib(800, 600, 'Home'); ...");
registerScreen("main-profile", "initRaylib(800, 600, 'Profile'); ...");
registerScreen("sidebar-files", "initRaylib(300, 600, 'Files'); ...");

// Manage complex navigation
setCurrentWindow(mainWindow);
navigateToScreen("main-home");

setCurrentWindow(sidebarWindow);
navigateToScreen("sidebar-files");

// Switch back and forth
setCurrentWindow(mainWindow);
navigateToScreen("main-profile");
```

## API Reference

### Window Management

#### `createWindow(width, height, title)`
```javascript
const windowId = createWindow(800, 600, "My Window");
```

#### `getCurrentWindow()`
```javascript
const window = getCurrentWindow();
```

#### `setCurrentWindow(windowId)`
```javascript
setCurrentWindow(1);
```

#### `closeWindow(windowId)`
```javascript
closeWindow(1);
```

#### `getWindowCount()`
```javascript
const count = getWindowCount();
```

### Navigation Management

#### `registerScreen(name, script)`
```javascript
registerScreen("home", "initRaylib(800, 600, 'Home'); updateFrame();");
```

#### `navigateToScreen(name)`
```javascript
navigateToScreen("home");
```

#### `navigateBack()`
```javascript
navigateBack();
```

#### `navigateForward()`
```javascript
navigateForward();
```

#### `clearNavigationStack()`
```javascript
clearNavigationStack();
```

#### `getCurrentScreen()`
```javascript
const screen = getCurrentScreen();
console.log(screen.name);
```

#### `printNavigationStatus()`
```javascript
printNavigationStatus();
```

## Navigation System Architecture

The multi-window system uses a single QuickJS runtime to manage multiple JavaScript contexts, one per window.

```
┌─────────────────────────────────────────┐
│         QuickJS Runtime (1 instance)     │
├─────────────────────────────────────────┤
│  Window 1 Context (Window 1)            │
│  Window 2 Context (Window 2)            │
│  Window 3 Context (Window 3)            │
└─────────────────────────────────────────┘
```

### Key Benefits

1. **Memory Efficiency**: Single runtime, multiple contexts
2. **Shared State**: Global variables accessible to all windows
3. **Isolation**: Each window maintains its own state
4. **Navigation Stack**: Screen management per context
5. **Flexibility**: Create any number of windows dynamically

## Usage Examples

### Basic Navigation

```javascript
// Setup
registerScreen("login", "initRaylib(800, 600, 'Login'); updateFrame();");
registerScreen("dashboard", "initRaylib(800, 600, 'Dashboard'); updateFrame();");

// Navigate
navigateToScreen("login");
navigateToScreen("dashboard");
```

### Multiple Windows

```javascript
// Create windows
const main = createWindow(800, 600, "Main");
const settings = createWindow(600, 400, "Settings");

// Manage them
setCurrentWindow(main);
navigateToScreen("home");

setCurrentWindow(settings);
navigateToScreen("settings");
```

### Complex App Structure

```javascript
// Main app window
const app = createWindow(1024, 768, "App");

// Sidebar windows
const sidebar = createWindow(250, 768, "Sidebar");
const settings = createWindow(400, 768, "Settings");

// Register screens
registerScreen("app-home", "initRaylib(1024, 768, 'Home'); ...");
registerScreen("app-files", "initRaylib(1024, 768, 'Files'); ...");
registerScreen("sidebar-files", "initRaylib(250, 768, 'Files'); ...");

// Initialize
setCurrentWindow(app);
navigateToScreen("app-home");
```

## Console Output

When you run the demos, you'll see detailed console output explaining:

- Window creation and management
- Navigation actions
- Screen registration
- System status

Example output:
```
=== Rayact Multi-Window Demo ===
Created window 1: 1
Created window 2: 2
Set window 2 as current
Navigated to screen 1
Navigated to screen 2
Navigated to screen 3

=== Navigation Status ===
Current Screen: screen3
Navigation Stack:
  [0] screen1 <- Current
  [1] screen2
  [2] screen3
==========================
```

## Limitations (Current Version)

- **Desktop Only**: Multiple windows supported on desktop platforms
- **Memory Limits**: 16 maximum windows (configurable)
- **Simple Navigation**: Stack-based navigation, no view transitions
- **Single Context per Window**: Each window has its own context
- **No Event Handling**: Input handling not yet implemented

## Next Steps

When ready to expand:

1. **Input Handling**: Add mouse, keyboard, and touch support per window
2. **View Transitions**: Add smooth transitions between screens
3. **Window Management**: Add window dragging, minimizing, maximizing
4. **Focus Management**: Handle window focus and blur events
5. **Advanced Navigation**: Add modal navigation, tab navigation
6. **State Management**: Add centralized state store for multiple windows

## Platform Support

- ✅ **Desktop**: Full multi-window support
- 📅 **Android**: Planned activity-based windows
- 📅 **Web**: Planned tab/window management

## Documentation

For detailed documentation, see:
- [Multi-Window System Documentation](../docs/multi-window-system.md)
- [Main README](../README.md)

---

**Try the multi-window demos to explore the navigation system!**