# Rayact - Development Roadmap

## Phase 1: QuickJS Integration ✅

- [x] Set up project structure with monorepo
- [x] Integrate QuickJS library
- [x] Create QuickJS runtime wrapper
- [x] Build native bridge layer
- [x] Implement raylib initialization
- [x] Create utility functions for JavaScript interop

**Status**: ✅ Complete
**Completion Date**: Initial implementation
**Files Modified**: Multiple, core infrastructure created

---

## Phase 2: React Core Renderer ✅

- [x] Fork react-reconciler from proton-native
- [x] Implement base Shape component
- [x] Create Shape subtypes (Rect, Circle, Line)
- [x] Implement React reconciler functions
- [x] Add state management system
- [x] Build component registry

**Status**: ✅ Complete
**Completion Date**: Initial implementation
**Files Modified**: Multiple, core renderer infrastructure created

---

## Phase 3: Raylib Backend 🚧

### Desktop Platform
- [x] Create raylib bridge layer
- [x] Implement shape rendering functions
- [x] Add color conversion utilities
- [x] Setup window management
- [x] Build CMake build system
- [ ] Test compilation on Linux
- [ ] Test compilation on macOS
- [ ] Test compilation on Windows

### Input Handling
- [ ] Implement mouse input
- [ ] Implement keyboard input
- [ ] Implement touch input (mobile)
- [ ] Create event system

### Animation
- [ ] Implement render loop
- [ ] Add frame rate control
- [ ] Create animation system

**Status**: 🚧 In Progress
**Desktop Builds**: Partially implemented
**Completion Date**: Pending testing

---

## Phase 4: Cross-Platform Support 📅

### Desktop
- [ ] Test on Windows (MinGW/MSVC)
- [ ] Test on Linux (various distros)
- [ ] Test on macOS (Intel and ARM)
- [ ] Add window management features
- [ ] Add device pixel ratio support

### Android
- [ ] Set up Gradle build
- [ ] Integrate raylib for Android
- [ ] Add JNI bridge
- [ ] Implement touch input
- [ ] Test on Android device/emulator

### WebAssembly
- [ ] Setup Emscripten build
- [ ] Build raylib for WebGL
- [ ] Create HTML5 canvas wrapper
- [ ] Implement web event loop
- [ ] Test in browser

**Status**: 📅 Planned
**Completion Date**: Pending

---

## Phase 5: Layout System 📅

### Core Layout
- [ ] Integrate Yoga layout engine
- [ ] Implement flexbox layout
- [ ] Add padding and margin support
- [ ] Implement alignment properties
- [ ] Add height auto-sizing
- [ ] Implement width auto-sizing

### Advanced Layout
- [ ] Add row/column layouts
- [ ] Implement layout nesting
- [ ] Add gap support
- [ ] Create scroll container
- [ ] Add transform support

**Status**: 📅 Planned
**Completion Date**: Pending

---

## Phase 6: Advanced Features 📅

### Graphics
- [ ] Implement text rendering
- [ ] Add image loading and display
- [ ] Create gradient fills
- [ ] Add polygon rendering
- [ ] Implement path drawing
- [ ] Add shadow effects

### Input Handling
- [ ] Complete mouse event system
- [ ] Complete keyboard event system
- [ ] Implement touch event system
- [ ] Add gesture recognition
- [ ] Create focus management
- [ ] Implement navigation

### System Features
- [ ] Add device orientation support
- [ ] Implement screen size changes
- [ ] Add window state management
- [ ] Create lifecycle hooks
- [ ] Implement file system access
- [ ] Add platform-specific APIs

**Status**: 📅 Planned
**Completion Date**: Pending

---

## Phase 7: raym3 Integration 📅

### Backend Transition
- [ ] Create graphics backend abstraction
- [ ] Implement Raylib backend
- [ ] Implement Raym3 backend
- [ ] Create backend selection system
- [ ] Migrate render functions
- [ ] Add resource management

### Component Migration
- [ ] Map raym3 components to React
- [ ] Implement Material Design 3 components
- [ ] Add icon system
- [ ] Create theme engine
- [ ] Implement transition effects
- [ ] Add animation library

### Advanced Features
- [ ] SVG icon support
- [ ] Input layers system
- [ ] 3D viewport support
- [ ] Material Design theming
- [ ] Custom component library

**Status**: 📅 Planned
**Dependencies**: raym3 must be upgraded and ready

---

## Phase 8: Production Ready 📅

### Testing
- [ ] Write unit tests for core components
- [ ] Write integration tests for rendering
- [ ] Write platform-specific tests
- [ ] Add performance benchmarks
- [ ] Create test suite for all platforms

### Documentation
- [ ] Complete API documentation
- [ ] Write component examples
- [ ] Create platform-specific guides
- [ ] Add troubleshooting guide
- [ ] Write migration guides

### Tooling
- [ ] Create CLI build tool
- [ ] Add development server
- [ ] Implement hot reload
- [ ] Create package publish automation
- [ ] Add code quality tools

### Distribution
- [ ] Create npm package for web
- [ ] Create Android APK/AAB
- [ ] Create desktop installers
- [ ] Create Docker containers
- [ ] Add continuous deployment

**Status**: 📅 Planned
**Completion Date**: Long term

---

## Current Sprint (Phase 3)

### Week 1-2: Core Desktop Builds
- [ ] Fix CMake configuration for desktop platforms
- [ ] Resolve QuickJS linking issues
- [ ] Resolve Raylib linking issues
- [ ] Test compilation on Linux
- [ ] Test compilation on macOS

### Week 3-4: Input and Animation
- [ ] Implement mouse input bridge
- [ ] Implement keyboard input bridge
- [ ] Add event system
- [ ] Create render loop
- [ ] Add frame rate control

### Week 5-6: Color and Text
- [ ] Complete color system
- [ ] Add named colors
- [ ] Implement text rendering
- [ ] Create font system
- [ ] Add text styles

---

## Technical Debt

- [ ] Optimize QuickJS bridge for performance
- [ ] Improve memory management
- [ ] Add proper error handling
- [ ] Implement logging system
- [ ] Add diagnostics tools
- [ ] Create code coverage tools

---

## Known Issues

1. **QuickJS linking on Linux**: May need additional system libraries
2. **Raylib OpenGL on macOS**: May require different OpenGL version
3. **Memory leaks in render loop**: Need proper cleanup
4. **TypeScript compilation**: Need better type definitions for canvas API

---

## Milestones

- [x] **MVP 1**: Basic shapes rendering (Phase 1-2 complete)
- [ ] **MVP 2**: Interactive shapes with input (Phase 3)
- [ ] **MVP 3**: Desktop application with UI (Phase 4)
- [ ] **MVP 4**: Android application (Phase 4)
- [ ] **MVP 5**: Web application (Phase 4)
- [ ] **Beta 1**: Layout system (Phase 5)
- [ ] **Beta 2**: Full feature set (Phase 6)
- [ ] **Release 1**: Material Design components (Phase 7)

---

## Contributors

Add your name here after contributing!

---

## Priority Matrix

| Priority | Feature | Effort | Value | Status |
|----------|---------|--------|-------|--------|
| P0 | QuickJS integration | Medium | High | ✅ Complete |
| P0 | React reconciler | High | High | ✅ Complete |
| P0 | Raylib bridge | High | High | 🚧 In Progress |
| P1 | Desktop builds | High | High | 🚧 In Progress |
| P1 | Mouse input | Medium | Medium | 📅 Planned |
| P1 | Keyboard input | Medium | Medium | 📅 Planned |
| P2 | Touch input | Medium | High | 📅 Planned |
| P2 | Android build | High | High | 📅 Planned |
| P3 | Web build | High | Medium | 📅 Planned |
| P3 | Layout system | High | High | 📅 Planned |
| P3 | Text rendering | High | Medium | 📅 Planned |
| P4 | Animation | Medium | Low | 📅 Planned |
| P4 | Images | Medium | Low | 📅 Planned |

---

## Notes

- Focus on completing Phase 3 desktop builds first
- Ensure robust error handling and logging
- Maintain compatibility with React 18+
- Keep the architecture modular for easy platform switching
- Plan for raym3 integration from the beginning
