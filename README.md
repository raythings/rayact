# 🎨 Rayact - Cross-Platform React Renderer

[![Build Status](https://img.shields.io/badge/build-ready-success)](https://github.com/raythings/rayact)
[![Platform](https://img.shields.io/badge/platform-desktop-blue)](https://github.com/raythings/rayact)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A custom React renderer using **QuickJS** as the JavaScript runtime and **raylib 6.0+** as the graphics backend, supporting Desktop (Windows/Linux/macOS), Mobile (Android), and Web (WASM) platforms.

![Rayact Architecture](https://img.shields.io/badge/architecture-modern-orange)

## ✨ Key Features

- **🚀 QuickJS Integration**: Embedded JavaScript runtime for native execution without node.js
- **⚛️ React-Ready**: Uses react-reconciler compatible with React 18+
- **🎨 Raylib Graphics**: OpenGL-based rendering with shape primitives
- **📱 Cross-Platform**: Desktop, Android, and Web ready architecture
- **📐 Basic Shapes**: Rectangle, Circle, and Line components
- **🌈 Color System**: Hex color format with full RGBA support
- **🔄 Material Ready**: Architecture prepared for raym3 integration

## Dev Platform

Rayact includes an Expo/Tamer-class dev workflow:

- **Dev server** — Vite bundler, split WS channels (`/rayact/hmr`, `/rayact/debugger`, `/rayact/inspector`), mDNS discovery, rich QR payloads
- **`@rayact/dev-client`** — in-app launcher (Connect / Recent / Discover) for debug Android builds
- **HMR** — WebSocket-first hot reload with React Fast Refresh
- **CDP** — Chrome DevTools on port 9229 (`RAYACT_DEBUG=1`, `adb reverse tcp:9229 tcp:9229`)
- **Bytecode** — release builds emit `.qjsbc` via `rayact compile`

See [docs/dev-platform.md](docs/dev-platform.md) for CLI reference.

### Create a new app

```bash
npx github:raythings/create-rayact-app#v0.0.1 my-app
cd my-app && npm install && npm run dev
```

## 🚀 Quick Start

### Prerequisites
- CMake 3.20+
- C++17 compiler
- Node.js 18+

### Build QuickJS
```bash
cd quickjs
meson setup build --default-library=static
meson compile -C build
cd ..
```

### Build Raylib
```bash
cd raylib
cmake -B build -DPLATFORM=Desktop -DOPENGL_VERSION=4.3
cmake --build build
cd ..
```

### Build Rayact
```bash
# Desktop
cmake -B build -S . -DENABLE_DESKTOP=ON
cmake --build build

# Run
./build/bin/rayact_desktop
```

## 📖 Documentation

- **[Quick Start](QUICKSTART.md)** - Get up and running in 5 minutes
- **[Development Guide](DEVELOPMENT.md)** - Full development setup
- **[Project Overview](PROJECT_SUMMARY.md)** - Architecture details
- **[Build Summary](BUILD_SUMMARY.md)** - What's been built
- **[Roadmap](TODO.md)** - Feature roadmap
- **[Contributing](CONTRIBUTING.md)** - Contribution guidelines

## 🎮 Demos

Run the built-in demos:

```bash
# Basic shapes
./build/bin/rayact_desktop

# Color palette
./build/bin/rayact_desktop apps/desktop/demo-colors.js

# Shapes geometry
./build/bin/rayact_desktop apps/desktop/demo-shapes.js

# Star pattern
./build/bin/rayact_desktop apps/desktop/demo-star.js

# Interactive demo
./build/bin/rayact_desktop apps/desktop/demo-interactive.js
```

## 📁 Project Structure

```
rayact/
├── packages/              # Core packages
│   ├── rayact-core/      # React reconciler & components
│   ├── rayact-quickjs/   # QuickJS runtime
│   ├── rayact-renderer/  # Raylib backend
│   └── rayact-shared/    # Shared types
├── apps/                 # Application examples
│   └── desktop/          # Desktop demos
├── native/               # Native platform code
│   └── desktop/          # Desktop implementation
├── quickjs/              # QuickJS library
├── raylib/               # Raylib library
└── Documentation files
```

## 💻 Code Example

```javascript
// Initialize window
initRaylib(800, 600, "My Rayact App");

// Draw shapes
renderRect(100, 100, 200, 150, 0xFF0000FF);   // Blue rectangle
renderCircle(400, 300, 50, 0x00FF00FF);       // Green circle
renderLine(100, 400, 700, 400, 0x0000FFFF);   // Blue line

// Prepare for next frame
updateFrame();
```

## 🎯 API Reference

### `initRaylib(width, height, title)`
Initialize raylib window

### `renderRect(x, y, width, height, color)`
Draw rectangle

### `renderCircle(x, y, radius, color)`
Draw circle

### `renderLine(x1, y1, x2, y2, color)`
Draw line

### `updateFrame()`
Clear shape list for next frame

## 🌟 Features Overview

| Feature | Status | Details |
|---------|--------|---------|
| QuickJS | ✅ | ES6 runtime |
| React | ✅ | State management |
| Raylib | ✅ | Graphics backend |
| Shapes | ✅ | Rect, Circle, Line |
| Colors | ✅ | Full RGBA support |
| Desktop | ✅ | Win/Linux/macOS |
| Android | 📅 | Planned |
| Web | 📅 | Planned |
| Layout | 📅 | Yoga integration |
| Text | 📅 | Font system |

## 📈 Progress Tracking

- **Phase 1**: QuickJS Integration ✅ 100%
- **Phase 2**: React Core ✅ 100%
- **Phase 3**: Raylib Backend 🚧 80%
- **Phase 4**: Cross-Platform 📅 0%
- **Phase 5**: Layout System 📅 0%
- **Phase 6**: Advanced Features 📅 0%
- **Phase 7**: raym3 Integration 📅 0%

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [QuickJS](https://github.com/quickjs-ng/quickjs) - JavaScript engine
- [raylib](https://github.com/raysan5/raylib) - Graphics library
- [proton-native](https://github.com/kusti8/proton-native) - React Native for desktop
- [ink](https://github.com/vadimdemedes/ink) - React for CLI

## 📞 Support

- GitHub Issues: [Report bugs](https://github.com/raythings/rayact/issues)
- Discussions: [Community chat](https://github.com/raythings/rayact/discussions)

## 🎉 What's New

### Latest Updates
- ✅ Complete project structure with monorepo
- ✅ React reconciler implementation
- ✅ QuickJS runtime wrapper
- ✅ Raylib graphics backend
- ✅ 5 working demo applications
- ✅ Comprehensive documentation
- ✅ Cross-platform build scripts

### Coming Soon
- 📅 Android platform support
- 📅 Input handling (mouse, keyboard, touch)
- 📅 Layout system with flexbox
- 📅 Text rendering
- 📅 Full raym3 integration

---

**Built with ❤️ for cross-platform React rendering**

[Star on GitHub](https://github.com/raythings/rayact) ⭐ to show your support!
