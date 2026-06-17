cmake_minimum_required(VERSION 3.20)
project(rayact_quickjs_desktop VERSION 0.1.0 LANGUAGES CXX C)
if(APPLE)
    enable_language(OBJCXX)
endif()

# Repo layout: this file lives in <repo>/rayact/native/desktop.
get_filename_component(OUTER "${CMAKE_CURRENT_SOURCE_DIR}/../../.." ABSOLUTE)

# C++ Standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build options
option(BUILD_SHARED_LIBS "Build shared libraries" OFF)
option(RAYACT_DESKTOP_USE_METAL "Use Metal backend on macOS" ON)
option(RAYACT_DESKTOP_USE_VULKAN "Use Vulkan backend on Linux" ON)

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

# QuickJS include directory (use local quickjs)
set(QUICKJS_DIR "${OUTER}/quickjs")
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
set(RAYLIB_DIR "${OUTER}/raylib")
if(EXISTS "${RAYLIB_DIR}/src/raylib.h")
    include_directories(${RAYLIB_DIR}/src)
    message(STATUS "Found raylib in src directory")
elseif(EXISTS "${RAYLIB_DIR}/raylib.h")
    include_directories(${RAYLIB_DIR})
    message(STATUS "Found raylib in directory")
else()
    message(FATAL_ERROR "raylib not found in ${RAYLIB_DIR}")
endif()

set(RAYLIB_BACKENDS_DIR "${OUTER}/raylib-backends")
if(EXISTS "${RAYLIB_BACKENDS_DIR}/cmake/RaylibBackend.cmake")
    include("${RAYLIB_BACKENDS_DIR}/cmake/RaylibBackend.cmake")
    message(STATUS "Found raylib-backends at: ${RAYLIB_BACKENDS_DIR}")
else()
    message(FATAL_ERROR "raylib-backends not found at ${RAYLIB_BACKENDS_DIR}")
endif()

# Find QuickJS library
if(PLATFORM_LINUX)
    # Look for static library first, then shared
    find_library(QUICKJS_LIBRARY NAMES qjs PATHS ${QUICKJS_DIR}/build)
elseif(PLATFORM_MACOS)
    # Look for static library first, then shared
    find_library(QUICKJS_LIBRARY NAMES qjs PATHS ${QUICKJS_DIR}/build)
elseif(WIN32)
    find_library(QUICKJS_LIBRARY NAMES qjs PATHS ${QUICKJS_DIR}/build)
endif()

if(NOT QUICKJS_LIBRARY)
    message(FATAL_ERROR "QuickJS library not found. Looking in all possible locations...")
    set(QUICKJS_SEARCH_PATHS
        ${QUICKJS_DIR}/build
        ${QUICKJS_DIR}/build/lib
        ${QUICKJS_DIR})
    find_library(QUICKJS_LIBRARY NAMES qjs PATHS ${QUICKJS_SEARCH_PATHS})
endif()

if(NOT QUICKJS_LIBRARY)
    message(FATAL_ERROR "QuickJS library not found. Please build QuickJS first.")
endif()

message(STATUS "Found QuickJS library: ${QUICKJS_LIBRARY}")

# Find QuickJS stdlib library (js_std_loop, js_init_module_std/os)
find_library(QUICKJS_LIBC_LIBRARY NAMES quickjs-libc PATHS ${QUICKJS_DIR}/build)
if(QUICKJS_LIBC_LIBRARY)
    message(STATUS "Found QuickJS libc: ${QUICKJS_LIBC_LIBRARY}")
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
find_library(RAYLIB_GLFW_LIBRARY NAMES glfw3 libglfw3
    PATHS ${RAYLIB_DIR}/build/raylib/external/glfw/src
          ${RAYLIB_DIR}/build/raylib/external/glfw/src/Debug
          ${RAYLIB_DIR}/examples/others/external/lib
          ${RAYM3_DIR}/build-v2-yoga2/_deps/raylib-build/raylib/external/glfw/src
          ${RAYM3_DIR}/build-v2-yoga2/_deps/raylib-src/examples/others/external/lib)
if(NOT RAYLIB_GLFW_LIBRARY)
    message(FATAL_ERROR "raylib GLFW library not found. Build raylib or provide libglfw3.a")
endif()

if(PLATFORM_MACOS AND RAYACT_DESKTOP_USE_METAL)
    raylib_backend_attach(TARGET raylib BACKEND METAL RAYLIB_BACKENDS_DIR ${RAYLIB_BACKENDS_DIR})
elseif(PLATFORM_LINUX AND RAYACT_DESKTOP_USE_VULKAN)
    raylib_backend_attach(TARGET raylib BACKEND VULKAN RAYLIB_BACKENDS_DIR ${RAYLIB_BACKENDS_DIR})
endif()

# wasm3 — embed only the core m3 interpreter (no WASI, no uvwasi)
set(WASM3_DIR "${OUTER}/wasm3")
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
set(CSSPARSER_DIR "${OUTER}/cssparser/cssparser")
if(EXISTS "${CSSPARSER_DIR}/CSSParser.h")
    include_directories(${OUTER}/cssparser)
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
set(RAYM3_DIR "${OUTER}/raym3")
if(EXISTS "${RAYM3_DIR}/include/raym3/v2.h")
    include_directories(${RAYM3_DIR}/include)
    message(STATUS "Found raym3 at: ${RAYM3_DIR}")
else()
    message(FATAL_ERROR "raym3 not found at ${RAYM3_DIR}")
endif()
set(RAYM3_BUILD_DIR "${RAYM3_DIR}/build-v2-yoga2")
set(RAYM3_LIB "${RAYM3_BUILD_DIR}/libraym3.a")
set(YOGACORE_LIB "${RAYM3_BUILD_DIR}/_deps/yoga-build/libyogacore.a")
if(NOT EXISTS "${RAYM3_LIB}")
    message(FATAL_ERROR "raym3 (yoga build) not found at ${RAYM3_LIB}")
endif()
if(NOT EXISTS "${YOGACORE_LIB}")
    message(FATAL_ERROR "libyogacore not found at ${YOGACORE_LIB}")
endif()
message(STATUS "Found raym3: ${RAYM3_LIB}")
message(STATUS "Found yogacore: ${YOGACORE_LIB}")

# Rebuild raym3 before linking desktop so Renderer/input changes are picked up.
add_custom_target(raym3_prebuild
    COMMAND ${CMAKE_COMMAND} --build ${RAYM3_BUILD_DIR}
    BYPRODUCTS ${RAYM3_LIB} ${YOGACORE_LIB}
    COMMENT "Building raym3 (build-v2-yoga2)..."
)

add_library(raym3_prebuilt STATIC IMPORTED GLOBAL)
set_target_properties(raym3_prebuilt PROPERTIES IMPORTED_LOCATION "${RAYM3_LIB}")
add_dependencies(raym3_prebuilt raym3_prebuild)

add_library(yogacore_prebuilt STATIC IMPORTED GLOBAL)
set_target_properties(yogacore_prebuilt PROPERTIES IMPORTED_LOCATION "${YOGACORE_LIB}")
add_dependencies(yogacore_prebuilt raym3_prebuild)

# tree-sitter
find_library(TREESITTER_LIBRARY NAMES tree-sitter
    PATHS /opt/homebrew/lib /usr/local/lib /usr/lib)
find_path(TREESITTER_INCLUDE_DIR tree_sitter/api.h
    PATHS /opt/homebrew/include /usr/local/include /usr/include)
if(TREESITTER_LIBRARY AND TREESITTER_INCLUDE_DIR)
    include_directories(${TREESITTER_INCLUDE_DIR})
    message(STATUS "Found tree-sitter: ${TREESITTER_LIBRARY}")
else()
    message(FATAL_ERROR "tree-sitter not found. Install with: brew install tree-sitter")
endif()

# tree-sitter-typescript grammar (compiled from source)
set(TS_TYPESCRIPT_DIR "${OUTER}/tree-sitter-typescript/typescript/src")
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
    devtools.cpp
    cdp_handler.cpp
    dev_client_bridge.cpp
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
    ${TS_TYPESCRIPT_SOURCES}
    ${CSSPARSER_SOURCES}
)

if(PLATFORM_MACOS)
    list(APPEND SOURCES mac_text_input.mm)
endif()

file(GLOB_RECURSE RAYACT_APP_NATIVE_WORKERS
    "${OUTER}/rayact/native/workers/*/*.cpp"
    "${OUTER}/rayact/apps/*/native/workers/*/*.cpp"
)
if(RAYACT_APP_NATIVE_WORKERS)
    list(APPEND SOURCES ${RAYACT_APP_NATIVE_WORKERS})
    message(STATUS "Rayact native workers: ${RAYACT_APP_NATIVE_WORKERS}")
endif()

# Executable
add_executable(rayact_desktop ${SOURCES})
target_include_directories(rayact_desktop PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../core
    ${RAYM3_BUILD_DIR}/_deps/yoga-src
    ${CURL_INCLUDE_DIRS}
    ${LWS_INCLUDE_DIRS}
    ${OPENSSL_INCLUDE_DIRS}
)
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
    raym3_prebuilt
    yogacore_prebuilt
    ${TREESITTER_LIBRARY}
    m3
    ${CURL_LIBRARIES}
    ${LWS_LIBRARIES}
    ${OPENSSL_LIBRARIES}
    ${CMAKE_DL_LIBS}
)
add_dependencies(rayact_desktop raym3_prebuild)

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
    # rlmt (Metal backend) needs these; harmless for the OpenGL build.
    if(RAYACT_USE_RLMT)
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
