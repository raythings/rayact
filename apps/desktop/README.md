# Rayact Application Examples

This directory contains example applications demonstrating Rayact functionality.

## Available Demos

### 1. Basic Shapes (`app.js`)
The default demo showing basic shape rendering.

**Features:**
- Rectangle rendering
- Circle rendering
- Line rendering
- Color system (hex values)

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/app.js
# or use default (no arguments needed)
./build/bin/rayact_desktop
```

### 2. Color Palette (`demo-colors.js`)
Demonstrates the color system with a grid of colored rectangles.

**Features:**
- 12 color variations
- Inverted borders
- Grid layout

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/demo-colors.js
```

### 3. Shapes Geometry (`demo-shapes.js`)
Shows various geometric shapes and patterns.

**Features:**
- Circle grid
- Rectangle grid
- Concentric circles
- Cross and diagonal lines
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
- Animation support

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/demo-star.js
```

### 5. Interactive (`demo-interactive.js`)
Demonstrates interaction concepts (input handling and animation).

**Features:**
- Mouse tracking
- Animation loop
- Color selection
- Keyboard shortcuts

**Run:**
```bash
./build/bin/rayact_desktop apps/desktop/demo-interactive.js
```

## Creating Custom Applications

To create your own application:

1. Create a new JavaScript file in this directory
2. Use the available API functions:
   ```javascript
   initRaylib(width, height, title);
   renderRect(x, y, width, height, color);
   renderCircle(x, y, radius, color);
   renderLine(x1, y1, x2, y2, color);
   updateFrame();
   ```

3. Load your application:
   ```bash
   ./build/bin/rayact_desktop your-app.js
   ```

## API Reference

### `initRaylib(width, height, title)`
Initializes the raylib window.

**Parameters:**
- `width`: Window width (integer)
- `height`: Window height (integer)
- `title`: Window title (string)

**Example:**
```javascript
initRaylib(800, 600, "My Application");
```

### `renderRect(x, y, width, height, color)`
Draws a rectangle.

**Parameters:**
- `x`: X position (integer)
- `y`: Y position (integer)
- `width`: Rectangle width (integer)
- `height`: Rectangle height (integer)
- `color`: Color as hex value (integer, e.g., `0xFFFF0000` for red)

**Example:**
```javascript
renderRect(100, 100, 200, 150, 0xFF0000FF); // Blue rectangle
```

### `renderCircle(x, y, radius, color)`
Draws a circle.

**Parameters:**
- `x`: X position (integer)
- `y`: Y position (integer)
- `radius`: Circle radius (integer)
- `color`: Color as hex value (integer)

**Example:**
```javascript
renderCircle(300, 200, 50, 0x00FF00FF); // Green circle
```

### `renderLine(x1, y1, x2, y2, color)`
Draws a line.

**Parameters:**
- `x1`: Start X position (integer)
- `y1`: Start Y position (integer)
- `x2`: End X position (integer)
- `y2`: End Y position (integer)
- `color`: Color as hex value (integer)

**Example:**
```javascript
renderLine(100, 100, 700, 100, 0x0000FFFF); // Blue horizontal line
```

### `updateFrame()`
Clears the shape list for the next frame. Call this after drawing all shapes.

**Example:**
```javascript
// Draw shapes
renderRect(100, 100, 200, 150, 0xFF0000FF);

// Prepare for next frame
updateFrame();
```

## Color System

Colors are specified as 32-bit integers using the hex format `0xAARRGGBB`:

- **Alpha (AA)**: Transparency (0-255)
- **Red (RR)**: Red component (0-255)
- **Green (GG)**: Green component (0-255)
- **Blue (BB)**: Blue component (0-255)

Common colors:
- White: `0xFFFFFFFF`
- Black: `0xFF000000`
- Red: `0xFFFF0000`
- Green: `0xFF00FF00`
- Blue: `0xFF0000FF`
- Yellow: `0xFFFFFF00`
- Magenta: `0xFFFF00FF`
- Cyan: `0xFF00FFFF`
- Gray: `0xFF808080`

## Limitations (Current Version)

- No layout system (absolute positioning only)
- No text rendering
- No image support
- No complex animations
- No input handling (mouse/keyboard)
- No state persistence

## Future Enhancements

Planned features in upcoming versions:

- Layout system (flexbox, grid)
- Text rendering with fonts
- Image loading and display
- Mouse and keyboard input handling
- Touch support for mobile
- Animation system
- Color gradients
- Rotation and transforms
- Complex shapes (polygons, paths)
- Strokes and fills
- Shadows and effects

## Contributing Examples

If you create interesting examples, consider contributing them back to the project:

1. Add your demo to this directory
2. Include a README with feature descriptions
3. Test on your target platform
4. Submit a pull request

## Examples Gallery

| Demo | Shapes | Colors | Complexity | Platform |
|------|--------|--------|------------|----------|
| app.js | Basic | 5 | Simple | All |
| demo-colors.js | Rectangles | 12 | Simple | All |
| demo-shapes.js | Mixed | 8 | Medium | All |
| demo-star.js | Lines | 5 | Medium | All |
| demo-interactive.js | Mixed | 5 | Advanced | Desktop |

---

**Tip**: Start with `app.js` to see the simplest example, then try the other demos to explore different rendering techniques.