cmake_minimum_required(VERSION 3.20)
project(rayact VERSION 0.1.0 LANGUAGES CXX C)

# C++ Standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build options
option(BUILD_SHARED_LIBS "Build shared libraries" OFF)
option(ENABLE_DESKTOP "Build desktop platforms" ON)
option(ENABLE_ANDROID "Build Android platform" OFF)
option(ENABLE_WEB "Build WebAssembly platform" OFF)
option(ENABLE_TESTS "Build tests" OFF)
option(ENABLE_OPTIMIZATION "Enable optimization" ON)

# Default to desktop if none specified
if(NOT ENABLE_DESKTOP AND NOT ENABLE_ANDROID AND NOT ENABLE_WEB)
    set(ENABLE_DESKTOP ON)
endif()

# Check for required dependencies
include(CheckIncludeFiles)
include(CheckLibraryExists)

# Platform detection
if(WIN32)
    set(PLATFORM_WINDOWS 1)
elseif(APPLE)
    set(PLATFORM_MACOS 1)
elseif(ANDROID)
    set(PLATFORM_ANDROID 1)
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    set(PLATFORM_LINUX 1)
elseif(CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
    set(PLATFORM_WEB 1)
endif()

message(STATUS "Platform: ${CMAKE_SYSTEM_NAME}")
message(STATUS "Desktop: ${ENABLE_DESKTOP}")
message(STATUS "Android: ${ENABLE_ANDROID}")
message(STATUS "Web: ${ENABLE_WEB}")

# Output directories
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)

# --- External Dependencies ---

# QuickJS
set(QUICKJS_DIR "${CMAKE_SOURCE_DIR}/../quickjs")
if(EXISTS ${QUICKJS_DIR}/quickjs.h)
    include_directories(${QUICKJS_DIR})
    message(STATUS "Found QuickJS at: ${QUICKJS_DIR}")
else()
    find_path(QUICKJS_INCLUDE_DIR quickjs.h)
    if(QUICKJS_INCLUDE_DIR)
        include_directories(${QUICKJS_INCLUDE_DIR})
        message(STATUS "Found QuickJS include at: ${QUICKJS_INCLUDE_DIR}")
    else()
        message(FATAL_ERROR "QuickJS not found. Please build quickjs or set QUICKJS_DIR")
    endif()
endif()

# Raylib
if(ENABLE_DESKTOP)
    set(RAYLIB_DIR "${CMAKE_SOURCE_DIR}/../raylib")

    # Try different paths for raylib.h
    if(EXISTS "${RAYLIB_DIR}/src/raylib.h")
        include_directories(${RAYLIB_DIR}/src)
        message(STATUS "Found raylib.h in src directory")
    elseif(EXISTS "${RAYLIB_DIR}/raylib.h")
        include_directories(${RAYLIB_DIR})
        message(STATUS "Found raylib.h in directory")
    else()
        message(FATAL_ERROR "raylib.h not found in ${RAYLIB_DIR}")
    endif()

    # Find raylib library - try multiple paths
    find_library(RAYLIB_LIBRARY NAMES raylib
        PATHS
            ${RAYLIB_DIR}
            ${RAYLIB_DIR}/lib
            ${RAYLIB_DIR}/build
            ${RAYLIB_DIR}/build/lib
            ${RAYLIB_DIR}/build/src
            ${RAYLIB_DIR}/build/Raylib)

    if(NOT RAYLIB_LIBRARY)
        message(FATAL_ERROR "raylib library not found. Looking in all possible locations...")
        message(STATUS "Available library locations:")
        list(APPEND RAYLIB_LIBRARY_PATHS
            ${RAYLIB_DIR}
            ${RAYLIB_DIR}/lib
            ${RAYLIB_DIR}/build
            ${RAYLIB_DIR}/build/lib
            ${RAYLIB_DIR}/build/src
            ${RAYLIB_DIR}/build/Raylib)
        find_library(RAYLIB_LIBRARY NAMES raylib PATHS ${RAYLIB_LIBRARY_PATHS})
    endif()

    if(RAYLIB_LIBRARY)
        message(STATUS "Found raylib library: ${RAYLIB_LIBRARY}")
    else()
        message(FATAL_ERROR "raylib library not found in ${RAYLIB_DIR}")
    endif()

    message(STATUS "Found raylib at: ${RAYLIB_DIR}")
endif()

# --- Native Components ---

if(ENABLE_DESKTOP)
    add_subdirectory(native/desktop ${CMAKE_BINARY_DIR}/native/desktop)
endif()

if(ENABLE_ANDROID)
    add_subdirectory(native/android ${CMAKE_BINARY_DIR}/native/android EXCLUDE_FROM_ALL)
endif()

if(ENABLE_WEB)
    add_subdirectory(native/web ${CMAKE_BINARY_DIR}/native/web EXCLUDE_FROM_ALL)
endif()

# --- Testing ---

if(ENABLE_TESTS)
    enable_testing()
    add_subdirectory(tests ${CMAKE_BINARY_DIR}/tests EXCLUDE_FROM_ALL)
endif()

# --- Installation ---

include(GNUInstallDirs)

if(CMAKE_INSTALL_RULES)
    install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
    install(DIRECTORY lib/ DESTINATION ${CMAKE_INSTALL_LIBDIR})
endif()

# Print summary
message(STATUS "")
message(STATUS "Rayact Build Configuration:")
message(STATUS "  Platform: ${CMAKE_SYSTEM_NAME}")
message(STATUS "  Build Type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  C++ Standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "")
message(STATUS "Enabled Platforms:")
message(STATUS "  Desktop: ${ENABLE_DESKTOP}")
message(STATUS "  Android: ${ENABLE_ANDROID}")
message(STATUS "  Web: ${ENABLE_WEB}")
message(STATUS "")
message(STATUS "Build Options:")
message(STATUS "  Shared Libraries: ${BUILD_SHARED_LIBS}")
message(STATUS "  Optimization: ${ENABLE_OPTIMIZATION}")
message(STATUS "  Tests: ${ENABLE_TESTS}")
