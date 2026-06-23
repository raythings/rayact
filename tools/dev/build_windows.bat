@echo off
REM Windows Build Script for Rayact Desktop
REM This script helps build the Rayact project on Windows

echo ========================================
echo   Rayact Windows Build Script
echo ========================================
echo.

REM Check if QuickJS is built
if not exist "..\quickjs\build\libqjs.dll" (
    echo QuickJS not found. Building QuickJS...
    cd ..\quickjs
    if not exist build (
        mkdir build
    )
    echo cmake -G "MinGW Makefiles" -B build -DCMAKE_BUILD_TYPE=Release
    cmake -G "MinGW Makefiles" -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build
    cd ..\rayact
    echo QuickJS build complete!
) else (
    echo QuickJS already built.
)

REM Check if Raylib is built
if not exist "..\raylib\build\src\raylib.dll" (
    echo Raylib not found. Building Raylib...
    cd ..\raylib
    if not exist build (
        mkdir build
    )
    echo cmake -G "MinGW Makefiles" -B build -DPLATFORM=Win32 -DOPENGL_VERSION=4.3
    cmake -G "MinGW Makefiles" -B build -DPLATFORM=Win32 -DOPENGL_VERSION=4.3
    cmake --build build
    cd ..\rayact
    echo Raylib build complete!
) else (
    echo Raylib already built.
)

REM Build Rayact desktop app
echo.
echo Building Rayact desktop application...
echo cmake -B build -S . -G "MinGW Makefiles" -DENABLE_DESKTOP=ON
cmake -B build -S . -G "MinGW Makefiles" -DENABLE_DESKTOP=ON

if %errorlevel% neq 0 (
    echo CMake configuration failed!
    exit /b 1
)

echo cmake --build build
cmake --build build

if %errorlevel% neq 0 (
    echo Build failed!
    exit /b 1
)

echo.
echo ========================================
echo   Build complete!
echo ========================================
echo.
echo Running rayact_desktop.exe...
echo.

REM Run the application
if exist "build\bin\rayact_desktop.exe" (
    build\bin\rayact_desktop.exe
) else (
    echo Error: rayact_desktop.exe not found in build\bin\
    echo Please check the build output above.
)

echo.
pause
