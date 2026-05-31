# Rayact - Quick Start Guide

## Installation and Setup

### Prerequisites
- CMake 3.20+
- C++17 compiler
- Node.js 18+
- For Android: Android SDK 34, NDK r23+
- For Web: Emscripten 3.0+

### Quick Build

```bash
# Clone and enter project
git clone <repo-url>
cd rayact

# Build all packages
npm install
npm run build

# Build desktop example
cmake -B build -S . -DENABLE_DESKTOP=ON
cmake --build build

# Run desktop application
./build/bin/rayact_desktop
```

## Running Applications

### Desktop
```bash
./build/bin/rayact_desktop [app.js]
# app.js is optional - uses apps/desktop/app.js by default
```

### JavaScript Example
```javascript
// apps/desktop/app.js
initRaylib(800, 600, "Rayact - Hello World");

// Draw shapes
renderRect(100, 100, 200, 150, 0xFF0000FF);
renderCircle(400, 300, 50, 0xFF00FF00);
renderLine(100, 300, 700, 300, 0x0000FFFF);

updateFrame();
```

## Project Structure

```
rayact/
├── packages/           # Core packages
│   ├── rayact-core/    # React reconciler
│   ├── rayact-quickjs/ # QuickJS runtime
│   ├── rayact-renderer/# Raylib backend
│   └── rayact-shared/  # Shared types
├── apps/               # Application examples
│   ├── desktop/        # Desktop app
│   ├── android/        # Android app
│   └── web/            # Web app
├── native/             # Native platform code
├── README.md           # Main documentation
├── DEVELOPMENT.md      # Development guide
└── TODO.md             # Roadmap
```

## Key Features

- ✅ Cross-platform: Desktop, Android, Web
- ✅ React-reconciler integration
- ✅ QuickJS JavaScript runtime
- ✅ Raylib graphics backend
- ✅ Basic shapes (Rect, Circle, Line)
- ✅ Screen coordinate props
- ✅ Color system (hex colors)

## Next Steps

1. **Run the desktop application** to see basic rendering
2. **Explore the code** in `packages/` and `native/desktop/`
3. **Modify the JavaScript** in `apps/desktop/app.js`
4. **Add more components** based on your needs
5. **Build for other platforms** when ready

## Getting Help

- Check [README.md](README.md) for full documentation
- See [DEVELOPMENT.md](DEVELOPMENT.md) for setup details
- Review [TODO.md](TODO.md) for roadmap
- Open issues on GitHub for bugs and questions

## Development Mode

```bash
# Watch TypeScript files for changes
npm run dev

# Or specific package
cd packages/rayact-core && npm run dev
```

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Windows | 🚧 In Progress | Need testing |
| Linux | 🚧 In Progress | Need testing |
| macOS | 🚧 In Progress | Need testing |
| Android | 📅 Planned | Not started |
| Web | 📅 Planned | Not started |

## Current MVP

Basic shapes rendering with screen coordinates and colors. Ready for expansion with:

- Input handling (mouse, keyboard, touch)
- Layout system
- Advanced shapes and styles
- Text rendering
- Images
- Animations

---

**Happy Rendering!** 🎨✨
