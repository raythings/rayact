#!/bin/bash
# macOS Build Script for Rayact Desktop
# This script helps build the Rayact project on macOS

set -e  # Exit on error

echo "========================================"
echo "  Rayact macOS Build Script"
echo "========================================"
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if QuickJS is built
if [ ! -f "../quickjs/build/libqjs.a" ]; then
    echo -e "${YELLOW}QuickJS not found. Building QuickJS...${NC}"
    cd ../quickjs
    if [ ! -d build ]; then
        mkdir build
    fi
    echo "meson setup build --default-library=static --buildtype=release"
    meson setup build --default-library=static --buildtype=release
    echo "meson compile -C build"
    meson compile -C build
    cd ../rayact
    echo -e "${GREEN}✓ QuickJS build complete!${NC}"
else
    echo -e "${GREEN}✓ QuickJS already built${NC}"
fi

# Check if Raylib is built
if [ ! -f "../raylib/build/raylib/libraylib.a" ]; then
    echo -e "${YELLOW}Raylib not found. Building Raylib...${NC}"
    cd ../raylib
    if [ ! -d build ]; then
        mkdir build
    fi
    echo "cmake -B build -DPLATFORM=Desktop -DCMAKE_BUILD_TYPE=Release"
    cmake -B build -DPLATFORM=Desktop -DCMAKE_BUILD_TYPE=Release
    echo "cmake --build build --parallel"
    cmake --build build --parallel
    cd ../rayact
    echo -e "${GREEN}✓ Raylib build complete!${NC}"
else
    echo -e "${GREEN}✓ Raylib already built${NC}"
fi

# Build Rayact desktop app
echo ""
echo -e "${YELLOW}Building Rayact desktop application...${NC}"
echo "cmake -B build -S . -DENABLE_DESKTOP=ON -DCMAKE_BUILD_TYPE=Release"
cmake -B build -S . -DENABLE_DESKTOP=ON -DCMAKE_BUILD_TYPE=Release

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ CMake configuration failed!${NC}"
    exit 1
fi

echo "cmake --build build --parallel"
cmake --build build --parallel

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Build failed!${NC}"
    exit 1
fi

echo ""
echo "========================================"
echo -e "${GREEN}  ✓ Build complete!${NC}"
echo "========================================"
echo ""
echo "Running rayact_desktop..."
echo ""

# Run the application
if [ -f "build/bin/rayact_desktop" ]; then
    chmod +x build/bin/rayact_desktop
    ./build/bin/rayact_desktop
else
    echo -e "${RED}Error: rayact_desktop not found in build/bin/${NC}"
    echo "Please check the build output above."
fi

echo ""