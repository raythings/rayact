# Development Setup Guide

## Quick Start

### 1. Install Prerequisites

```bash
# Linux/macOS
sudo apt-get install cmake g++ git  # Ubuntu/Debian
# or
brew install cmake git  # macOS

# For Android development
# Install Android Studio with NDK r23+
# https://developer.android.com/studio

# For Web development
# Install Emscripten 3.0+
# https://emscripten.org/
```

### 2. Build QuickJS and Raylib

The project includes QuickJS and raylib in subdirectories. Build them first:

```bash
# Build QuickJS
cd quickjs
meson setup build --default-library=static
meson compile -C build

# Build Raylib (Desktop)
cd ../raylib
cmake -B build -DPLATFORM=Desktop -DOPENGL_VERSION=4.3
cmake --build build

# Return to project root
cd ../..
```

### 3. Build Rayact Core

```bash
cd packages/rayact-quickjs
npm install
npm run build

cd ../rayact-core
npm install
npm run build

cd ../rayact-renderer
npm install
npm run build

cd ../rayact-shared
npm install
npm run build
```

### 4. Build Desktop Application

```bash
# Create build directory and configure
cmake -B build -S . -DENABLE_DESKTOP=ON

# Build the desktop executable
cmake --build build

# Run the application
./build/bin/rayact_desktop

# Or specify custom JavaScript file
./build/bin/rayact_desktop apps/desktop/app.js
```

## Development Workflow

### Running with Dev Mode

```bash
# Watch TypeScript files
npm run dev

# Or use specific workspace
cd packages/rayact-core && npm run dev
```

### Testing Native Builds

```bash
# Build and test
cmake -B build -S . -DENABLE_TESTS=ON
cmake --build build

# Run tests
./build/bin/rayact_test
```

## Platform-Specific Setup

### Windows

```powershell
# Install prerequisites
choco install cmake git

# Build QuickJS
cd quickjs
.\win\build_mingw.ps1
cd ..

# Build project
cmake -B build -S . -G "MinGW Makefiles"
cmake --build build

# Run
.\build\bin\rayact_desktop.exe
```

### Linux

```bash
# Install dependencies
sudo apt-get install cmake build-essential libx11-dev libgl1-mesa-dev

# Build
cmake -B build -S . -DENABLE_DESKTOP=ON
cmake --build build

# Run
./build/bin/rayact_desktop
```

### macOS

```bash
# Install dependencies
brew install cmake

# Build
cmake -B build -S . -DENABLE_DESKTOP=ON
cmake --build build

# Run
./build/bin/rayact_desktop
```

## Common Issues and Solutions

### Issue: QuickJS not found
```bash
# Solution: Set QUICKJS_DIR
export QUICKJS_DIR=/path/to/rayact/quickjs
```

### Issue: Raylib not found
```bash
# Solution: Set RAYLIB_DIR
export RAYLIB_DIR=/path/to/rayact/raylib
```

### Issue: Permission denied on macOS
```bash
# Solution: Make executable
chmod +x build/bin/rayact_desktop
```

### Issue: OpenGL context creation failed
```bash
# Solution: Install system OpenGL libraries
sudo apt-get install libgl1-mesa-dev  # Linux
# or
brew install mesa  # macOS
```

## Code Structure

### Packages

- `packages/rayact-quickjs`: QuickJS runtime integration
- `packages/rayact-core`: React reconciler and components
- `packages/rayact-renderer`: Raylib graphics backend
- `packages/rayact-shared`: Shared types and utilities

### Apps

- `apps/desktop`: Desktop application example
- `apps/android`: Android application example (to be added)
- `apps/web`: WebAssembly application example (to be added)

### Native Code

- `native/desktop`: Desktop platform-specific code
- `native/tests`: Test suite

## Next Steps

1. Build and test the desktop application
2. Add more shape types (polygon, path, etc.)
3. Implement color system with named colors
4. Add input handling (mouse, keyboard, touch)
5. Implement event loop in JavaScript
6. Build Android and Web versions

## Resources

- [QuickJS Documentation](https://github.com/quickjs-ng/quickjs)
- [Raylib Documentation](https://github.com/raysan5/raylib)
- [React Reconciler API](https://github.com/facebook/react/blob/main/packages/react-reconciler)
- [Project Roadmap](TODO.md)
