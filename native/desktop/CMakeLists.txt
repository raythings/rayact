cmake_minimum_required(VERSION 3.20)
project(rayact_quickjs_desktop VERSION 0.0.3 LANGUAGES CXX C)
if(APPLE)
    enable_language(OBJC)
    enable_language(OBJCXX)
endif()

# Repo layout: this file lives in <repo>/native/desktop.
get_filename_component(RAYACT_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
set(THIRD_PARTY "${RAYACT_ROOT}/third_party")

# C++ Standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build options
option(BUILD_SHARED_LIBS "Build shared libraries" OFF)
option(RAYACT_DESKTOP_USE_METAL "Use Metal backend on macOS" ON)
option(RAYACT_DESKTOP_USE_VULKAN "Use Vulkan backend on Linux" ON)
if(CMAKE_BUILD_TYPE MATCHES "^(Release|MinSizeRel)$")
    set(RAYACT_DEVTOOLS_DEFAULT OFF)
else()
    set(RAYACT_DEVTOOLS_DEFAULT ON)
endif()
option(RAYACT_ENABLE_DEVTOOLS "Link the development-only CDP inspector" ${RAYACT_DEVTOOLS_DEFAULT})
option(RAYACT_RELEASE_HOST "Build an embedded-project-only host without development entry points" OFF)

# Platform detection
if(WIN32)
    set(PLATFORM_WINDOWS 1)
elseif(APPLE)
    set(PLATFORM_MACOS 1)
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    set(PLATFORM_LINUX 1)
endif()

message(STATUS "Platform: ${CMAKE_SYSTEM_NAME}")
message(STATUS "Building rayact QuickJS Desktop example")

# Find dependencies
find_package(Threads REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(CURL     REQUIRED libcurl)
pkg_check_modules(LWS      REQUIRED libwebsockets)
pkg_check_modules(OPENSSL  REQUIRED openssl)

# Native DNS-SD powers launcher discovery on desktop. macOS exposes Bonjour
# through libSystem; Linux can provide the compatible API via Avahi's
# libdns_sd compatibility package. Builds remain usable without it (manual URL
# entry still works), but discovery is enabled whenever the platform has it.
set(RAYACT_HAS_DNSSD 0)
set(DNSSD_INCLUDE_DIR "")
set(DNSSD_LIBRARY "")
if(PLATFORM_MACOS)
    set(RAYACT_HAS_DNSSD 1)
elseif(PLATFORM_LINUX)
    find_path(DNSSD_INCLUDE_DIR dns_sd.h)
    find_library(DNSSD_LIBRARY NAMES dns_sd)
    if(DNSSD_INCLUDE_DIR AND DNSSD_LIBRARY)
        set(RAYACT_HAS_DNSSD 1)
    endif()
endif()

# QuickJS include directory (use local quickjs)
set(QUICKJS_DIR "${THIRD_PARTY}/quickjs")
if(EXISTS ${QUICKJS_DIR}/quickjs.h)
    include_directories(${QUICKJS_DIR})
    message(STATUS "Found QuickJS at: ${QUICKJS_DIR}")
else()
    find_path(QUICKJS_INCLUDE_DIR quickjs.h)
    if(QUICKJS_INCLUDE_DIR)
        include_directories(${QUICKJS_INCLUDE_DIR})
        message(STATUS "Found QuickJS include at: ${QUICKJS_INCLUDE_DIR}")
    else()
        message(FATAL_ERROR "QuickJS not found. Please add quickjs to project or specify QUICKJS_DIR")
    endif()
endif()

# Raylib include directory (use local raylib)
set(RAYLIB_DIR "${THIRD_PARTY}/raylib")
if(EXISTS "${RAYLIB_DIR}/src/raylib.h")
    include_directories(${RAYLIB_DIR}/src)
    message(STATUS "Found raylib in src directory")
elseif(EXISTS "${RAYLIB_DIR}/raylib.h")
    include_directories(${RAYLIB_DIR})
    message(STATUS "Found raylib in directory")
else()
    message(FATAL_ERROR "raylib not found in ${RAYLIB_DIR}")
endif()

set(RAYLIB_BACKENDS_DIR "${THIRD_PARTY}/raylib-backends")
if(EXISTS "${RAYLIB_BACKENDS_DIR}/cmake/RaylibBackend.cmake")
    include("${RAYLIB_BACKENDS_DIR}/cmake/RaylibBackend.cmake")
    message(STATUS "Found raylib-backends at: ${RAYLIB_BACKENDS_DIR}")
else()
    message(FATAL_ERROR "raylib-backends not found at ${RAYLIB_BACKENDS_DIR}")
endif()

# Find QuickJS library
set(QUICKJS_BUILD_DIR "${QUICKJS_DIR}/build" CACHE PATH "QuickJS build directory")
if(PLATFORM_LINUX OR PLATFORM_MACOS)
    # Look for static library first, then shared
    find_library(QUICKJS_LIBRARY NAMES qjs PATHS ${QUICKJS_BUILD_DIR})
elseif(PLATFORM_MACOS)
    # Look for static library first, then shared
    find_library(QUICKJS_LIBRARY NAMES qjs PATHS ${QUICKJS_BUILD_DIR})
elseif(WIN32)
    find_library(QUICKJS_LIBRARY NAMES qjs PATHS ${QUICKJS_BUILD_DIR})
endif()

if(NOT QUICKJS_LIBRARY)
    message(FATAL_ERROR "QuickJS library not found. Looking in all possible locations...")
    set(QUICKJS_SEARCH_PATHS
        ${QUICKJS_BUILD_DIR}
        ${QUICKJS_BUILD_DIR}/lib
        ${QUICKJS_DIR})
    find_library(QUICKJS_LIBRARY NAMES qjs PATHS ${QUICKJS_SEARCH_PATHS})
endif()

if(NOT QUICKJS_LIBRARY)
    message(FATAL_ERROR "QuickJS library not found. Please build QuickJS first.")
endif()

message(STATUS "Found QuickJS library: ${QUICKJS_LIBRARY}")

# Find QuickJS stdlib library (js_std_loop, js_init_module_std/os)
find_library(QUICKJS_LIBC_LIBRARY NAMES quickjs-libc qjs-libc PATHS ${QUICKJS_BUILD_DIR})
if(QUICKJS_LIBC_LIBRARY)
    message(STATUS "Found QuickJS libc: ${QUICKJS_LIBC_LIBRARY}")
else()
    # quickjs-ng's QJS_BUILD_LIBC=ON compiles the stdlib into libqjs.a.
    set(QUICKJS_LIBC_LIBRARY "")
endif()

set(RAYLIB_RCORE_SRC ${RAYLIB_DIR}/src/rcore.c)
if(PLATFORM_MACOS AND RAYACT_DESKTOP_USE_METAL)
    raylib_backend_prepare_rcore_overlay(
        OUT_VAR RAYLIB_RCORE_SRC
        RAYLIB_DIR "${RAYLIB_DIR}"
        RAYLIB_BACKENDS_DIR "${RAYLIB_BACKENDS_DIR}"
    )
endif()

set(RAYLIB_SRC
    ${RAYLIB_RCORE_SRC}
    ${RAYLIB_DIR}/src/rshapes.c
    ${RAYLIB_DIR}/src/rtextures.c
    ${RAYLIB_DIR}/src/rtext.c
    ${RAYLIB_DIR}/src/rmodels.c
    ${RAYLIB_DIR}/src/raudio.c
)
add_library(raylib STATIC ${RAYLIB_SRC})
target_include_directories(raylib PUBLIC ${RAYLIB_DIR}/src ${RAYLIB_DIR}/src/platforms)
target_compile_options(raylib PRIVATE -Wno-unknown-pragmas)
if(PLATFORM_LINUX OR PLATFORM_MACOS)
    set(GLFW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(GLFW_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(GLFW_BUILD_DOCS OFF CACHE BOOL "" FORCE)
    if(PLATFORM_MACOS)
        file(GLOB GLFW_COCOA_SOURCES
            "${RAYLIB_DIR}/src/external/glfw/src/*.m")
        set_source_files_properties(${GLFW_COCOA_SOURCES} PROPERTIES LANGUAGE OBJC)
    endif()
    add_subdirectory(${RAYLIB_DIR}/src/external/glfw
        ${CMAKE_CURRENT_BINARY_DIR}/glfw EXCLUDE_FROM_ALL)
    set(RAYLIB_GLFW_LIBRARY glfw)
    target_include_directories(raylib BEFORE PRIVATE ${RAYLIB_DIR}/src/external/glfw/include)
else()
    find_library(RAYLIB_GLFW_LIBRARY NAMES glfw3 libglfw3
        PATHS ${RAYLIB_DIR}/build/raylib/external/glfw/src
              ${RAYLIB_DIR}/build/raylib/external/glfw/src/Debug
              ${RAYLIB_DIR}/examples/others/external/lib
              ${RAYM3_DIR}/build-v2-yoga2/_deps/raylib-build/raylib/external/glfw/src
              ${RAYM3_DIR}/build-v2-yoga2/_deps/raylib-src/examples/others/external/lib)
endif()
if(NOT RAYLIB_GLFW_LIBRARY)
    message(FATAL_ERROR "raylib GLFW library not found. Build raylib or provide libglfw3.a")
endif()

if(PLATFORM_MACOS AND RAYACT_DESKTOP_USE_METAL)
    raylib_backend_attach(TARGET raylib BACKEND METAL RAYLIB_BACKENDS_DIR ${RAYLIB_BACKENDS_DIR})
elseif(PLATFORM_LINUX AND RAYACT_DESKTOP_USE_VULKAN)
    raylib_backend_attach(TARGET raylib BACKEND VULKAN RAYLIB_BACKENDS_DIR ${RAYLIB_BACKENDS_DIR})
endif()

# wasm3 — embed only the core m3 interpreter (no WASI, no uvwasi)
set(WASM3_DIR "${THIRD_PARTY}/wasm3")
if(NOT EXISTS "${WASM3_DIR}/source/wasm3.h")
    message(FATAL_ERROR "wasm3 not found at ${WASM3_DIR}")
endif()
set(WASM3_CORE_SOURCES
    "${WASM3_DIR}/source/m3_bind.c"
    "${WASM3_DIR}/source/m3_code.c"
    "${WASM3_DIR}/source/m3_compile.c"
    "${WASM3_DIR}/source/m3_core.c"
    "${WASM3_DIR}/source/m3_env.c"
    "${WASM3_DIR}/source/m3_exec.c"
    "${WASM3_DIR}/source/m3_function.c"
    "${WASM3_DIR}/source/m3_info.c"
    "${WASM3_DIR}/source/m3_module.c"
    "${WASM3_DIR}/source/m3_parse.c"
)
add_library(m3 STATIC ${WASM3_CORE_SOURCES})
target_include_directories(m3 PUBLIC "${WASM3_DIR}/source")
target_compile_features(m3 PRIVATE c_std_99)
# Suppress warnings from wasm3 internals
if(CMAKE_C_COMPILER_ID STREQUAL "GNU" OR CMAKE_C_COMPILER_ID STREQUAL "Clang")
    target_compile_options(m3 PRIVATE
        -Wno-unused-function -Wno-unused-variable
        -Wno-unused-parameter -Wno-sign-compare)
endif()
include_directories("${WASM3_DIR}/source")
message(STATUS "Found wasm3 at: ${WASM3_DIR}")

# cssparser — CSS file import support
set(CSSPARSER_DIR "${THIRD_PARTY}/cssparser/cssparser")
if(EXISTS "${CSSPARSER_DIR}/CSSParser.h")
    include_directories(${THIRD_PARTY}/cssparser)
    message(STATUS "Found cssparser at: ${CSSPARSER_DIR}")
else()
    message(FATAL_ERROR "cssparser not found at ${CSSPARSER_DIR}")
endif()
set(CSSPARSER_SOURCES
    ${CSSPARSER_DIR}/CSSParser.cpp
    ${CSSPARSER_DIR}/CSSProperties.cpp
    ${CSSPARSER_DIR}/CSSUtils.cpp
    ${CSSPARSER_DIR}/CSSDeNest.cpp
)

# raym3 (Yoga-enabled build for proper flexGrow/layout support)
set(RAYM3_DIR "${THIRD_PARTY}/raym3")
if(EXISTS "${RAYM3_DIR}/include/raym3/v2.h")
    include_directories(${RAYM3_DIR}/include)
    message(STATUS "Found raym3 at: ${RAYM3_DIR}")
else()
    message(FATAL_ERROR "raym3 not found at ${RAYM3_DIR}")
endif()
set(YOGA_DIR "${THIRD_PARTY}/yoga" CACHE PATH "" FORCE)
set(RAYM3_FETCH_DEPS OFF CACHE BOOL "" FORCE)
set(RAYM3_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(RAYM3_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(RAYM3_USE_YOGA ON CACHE BOOL "" FORCE)
set(RAYM3_USE_INPUT_LAYERS 0 CACHE BOOL "" FORCE)
add_subdirectory("${RAYM3_DIR}" "${CMAKE_BINARY_DIR}/raym3" EXCLUDE_FROM_ALL)
if(PLATFORM_MACOS AND RAYACT_DESKTOP_USE_METAL)
    target_include_directories(raym3 BEFORE PRIVATE "${RAYLIB_BACKENDS_DIR}/backends/rlmt")
elseif(PLATFORM_LINUX AND RAYACT_DESKTOP_USE_VULKAN)
    target_include_directories(raym3 BEFORE PRIVATE "${RAYLIB_BACKENDS_DIR}/backends/rlvk")
endif()

# tree-sitter is pinned with the other native foundations.
set(TREESITTER_DIR "${THIRD_PARTY}/tree-sitter")
add_library(treesitter STATIC "${TREESITTER_DIR}/lib/src/lib.c")
target_include_directories(treesitter PUBLIC "${TREESITTER_DIR}/lib/include" PRIVATE "${TREESITTER_DIR}/lib/src")

# tree-sitter-typescript grammar (compiled from source)
set(TS_TYPESCRIPT_DIR "${THIRD_PARTY}/tree-sitter-typescript/typescript/src")
set(TS_TYPESCRIPT_SOURCES
    ${TS_TYPESCRIPT_DIR}/parser.c
    ${TS_TYPESCRIPT_DIR}/scanner.c
)
include_directories(${TS_TYPESCRIPT_DIR})

# Source files
set(SOURCES
    color_parse.cpp
    theme_bridge.cpp
    system_appearance.cpp
    main.cpp
    engine_js.cpp
    engine_render.cpp
    commit_queue.cpp
    shadow_tree.cpp
    engine_thread.cpp
    worklet_runtime.cpp
    gesture_recognizer.cpp
    async_storage.cpp
    kv_store.cpp
    data_dir.cpp
    module_bus.cpp
    plugin_loader.cpp
    accessibility_bridge.cpp
    platform_wayland.cpp
    quickjs_bridge.cpp
    raylib_bridge.cpp
    raym3_bridge.cpp
    css_bridge.cpp
    js_stdlib.cpp
    platform.cpp
    window_manager.cpp
    worker_js.cpp
    worker_draw.cpp
    worker_wasm.cpp
    worker_native.cpp
    workers.cpp
    net.cpp
    utils/TypeStripper.cpp
    utils/ScriptValidator.cpp
    # core/ provides engineAppConfig / loadAppConfig (used by main.cpp for
    # background-color reads). Same sources are linked into the Android
    # shared library via apps/android/app/src/main/cpp/CMakeLists.txt.
    ../core/config_loader.cpp
    # shared/ provides the .rayactpack container reader/writer (also linked by
    # the Android/iOS engine libs).
    ../shared/rayactpack.cpp
    ${TS_TYPESCRIPT_SOURCES}
    ${CSSPARSER_SOURCES}
)

if(NOT RAYACT_RELEASE_HOST)
    list(APPEND SOURCES
        dev_client_bridge.cpp
        desktop_dev_loader.cpp
        desktop_mdns.cpp
    )
endif()

if(PLATFORM_MACOS)
    list(APPEND SOURCES mac_text_input.mm)
endif()

file(GLOB_RECURSE RAYACT_APP_NATIVE_WORKERS
    "${RAYACT_ROOT}/native/workers/*/*.cpp"
    "${RAYACT_ROOT}/apps/*/native/workers/*/*.cpp"
)
if(RAYACT_APP_NATIVE_WORKERS)
    list(APPEND SOURCES ${RAYACT_APP_NATIVE_WORKERS})
    message(STATUS "Rayact native workers: ${RAYACT_APP_NATIVE_WORKERS}")
endif()

# Executable
add_executable(rayact_desktop ${SOURCES})
target_compile_definitions(rayact_desktop PRIVATE RAYACT_RELEASE_HOST=$<BOOL:${RAYACT_RELEASE_HOST}>)
if(RAYACT_ENABLE_DEVTOOLS)
    add_subdirectory(${RAYACT_ROOT}/packages/rayact-devtools/native
        ${CMAKE_CURRENT_BINARY_DIR}/rayact-devtools)
    target_link_libraries(rayact_desktop rayact_devtools)
    target_compile_definitions(rayact_desktop PRIVATE RAYACT_ENABLE_DEVTOOLS=1)
else()
    target_sources(rayact_desktop PRIVATE
        ${RAYACT_ROOT}/packages/rayact-devtools/native/src/devtools_stub.cpp)
    target_compile_definitions(rayact_desktop PRIVATE RAYACT_ENABLE_DEVTOOLS=0)
endif()
target_include_directories(rayact_desktop PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../core
    ${CMAKE_CURRENT_SOURCE_DIR}/../shared
    ${YOGA_DIR}
    ${CURL_INCLUDE_DIRS}
    ${LWS_INCLUDE_DIRS}
    ${OPENSSL_INCLUDE_DIRS}
    ${DNSSD_INCLUDE_DIR}
)
target_compile_definitions(rayact_desktop PRIVATE RAYACT_HAS_DNSSD=${RAYACT_HAS_DNSSD})
target_link_directories(rayact_desktop PRIVATE
    ${CURL_LIBRARY_DIRS}
    ${LWS_LIBRARY_DIRS}
    ${OPENSSL_LIBRARY_DIRS}
)

# Link dependencies
target_link_libraries(rayact_desktop
    Threads::Threads
    ${QUICKJS_LIBC_LIBRARY}
    ${QUICKJS_LIBRARY}
    raylib
    ${RAYLIB_GLFW_LIBRARY}
    raym3
    treesitter
    m3
    ${CURL_LIBRARIES}
    ${LWS_LIBRARIES}
    ${OPENSSL_LIBRARIES}
    ${CMAKE_DL_LIBS}
    ${DNSSD_LIBRARY}
)

# Platform-specific settings
if(PLATFORM_LINUX)
    target_link_libraries(rayact_desktop
        X11
        GL
    )
endif()

if(PLATFORM_WINDOWS)
    # Windows-specific settings
    target_compile_definitions(rayact_desktop PRIVATE WIN32_LEAN_AND_MEAN _WIN32_WINNT=0x0601)
endif()

if(PLATFORM_MACOS)
    find_library(COCOA_FRAMEWORK Cocoa REQUIRED)
    find_library(IOKIT_FRAMEWORK IOKit REQUIRED)
    find_library(COREFOUNDATION_FRAMEWORK CoreFoundation REQUIRED)
    find_library(OPENGL_FRAMEWORK OpenGL REQUIRED)
    find_library(APPKIT_FRAMEWORK AppKit REQUIRED)
    target_link_libraries(rayact_desktop
        ${COCOA_FRAMEWORK}
        ${APPKIT_FRAMEWORK}
        ${IOKIT_FRAMEWORK}
        ${COREFOUNDATION_FRAMEWORK}
        ${OPENGL_FRAMEWORK}
    )
    # The raylib-backends Metal attachment needs these; harmless for OpenGL.
    if(RAYACT_DESKTOP_USE_METAL)
        target_link_libraries(rayact_desktop
            "-framework Metal" "-framework QuartzCore" "-framework CoreVideo")
        # librlmt.a (built with transpile) references glslang + SPIRV-Cross.
        set(BREW /opt/homebrew)
        if(EXISTS "${BREW}/lib/libspirv-cross-c.a")
            target_link_libraries(rayact_desktop
                ${BREW}/lib/libglslang.dylib
                ${BREW}/lib/libglslang-default-resource-limits.dylib
                ${BREW}/lib/libspirv-cross-c.a
                ${BREW}/lib/libspirv-cross-msl.a
                ${BREW}/lib/libspirv-cross-glsl.a
                ${BREW}/lib/libspirv-cross-hlsl.a
                ${BREW}/lib/libspirv-cross-cpp.a
                ${BREW}/lib/libspirv-cross-reflect.a
                ${BREW}/lib/libspirv-cross-util.a
                ${BREW}/lib/libspirv-cross-core.a)
        endif()
    endif()
endif()

# Compile options
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    target_compile_options(rayact_desktop PRIVATE
        -Wall
        -Wextra
        -Wno-unused-function
        -Wno-sign-conversion
        -Wno-nonportable-system-include-path
    )
elseif(MSVC)
    target_compile_options(rayact_desktop PRIVATE
        /W4
        /wd4018  # -Wno-sign-conversion
        /wd4100  # -Wno-unused-parameter
        /wd4244  # -Wno-shorten-64-to-32
        /wd4245  # -Wno-sign-compare
    )
endif()

# Output info
message(STATUS "")
message(STATUS "Build Configuration:")
message(STATUS "  QuickJS: ${QUICKJS_DIR}")
message(STATUS "  Raylib: ${RAYLIB_DIR}")
message(STATUS "  Platform: ${CMAKE_SYSTEM_NAME}")
