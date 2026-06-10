cmake_minimum_required(VERSION 3.22)
project(rayact LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 99)

# Repo layout: this file is at <repo>/rayact/apps/android/app/src/main/cpp.
# <repo> contains siblings: raylib, quickjs, raym3, cssparser, and the rayact project.
get_filename_component(OUTER "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../../.." ABSOLUTE)
set(RAYACT      "${OUTER}/rayact")
set(RAYLIB_DIR  "${OUTER}/raylib")
set(RLVK_DIR    "${OUTER}/rlvk")
set(QUICKJS_DIR "${OUTER}/quickjs")
set(RAYM3_DIR   "${OUTER}/raym3")
set(CSSPARSER_DIR "${OUTER}/cssparser/cssparser")
set(RAYGPU_DIR   "${OUTER}/raygpu")
set(WGVK_DIR     "${OUTER}/WGVK")

# Feature scope for the first device bring-up. Networking (curl/lws/openssl),
# workers (wasm3/native), and the TS validator (tree-sitter) are deferred — the
# engine call sites are guarded by RAYACT_NO_NET/NO_WORKERS/NO_TS.
option(RAYACT_ANDROID_FULL "Build net + workers + TS subsystems" OFF)
option(RAYACT_ANDROID_USE_RLVK "Build Android with the Vulkan-backed rlvk rlgl implementation" ON)
# 3D smoke-test scene is opt-in. Pass -DRAYACT_ANDROID_3D_SMOKE=ON at configure
# time to re-enable the in-process probe (FBO + grid + cube + lines). Default
# is OFF so the engine renders the real QuickJS app.js path.
option(RAYACT_ANDROID_3D_SMOKE "Render the temporary 3D smoke test scene on Android" OFF)

# Don't build/run dependency unit tests (yoga's gtest_discover_tests would try
# to execute arm64 test binaries on the build host).
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)

set(GLES3 GRAPHICS_API_OPENGL_ES3)

# ---------------------------------------------------------------------------
# raylib (custom PLATFORM_ANDROID_SURFACE backend — renders into a SurfaceView)
# ---------------------------------------------------------------------------
set(RAYLIB_SRC
    ${RAYLIB_DIR}/src/rcore.c
    ${RAYLIB_DIR}/src/rshapes.c
    ${RAYLIB_DIR}/src/rtextures.c
    ${RAYLIB_DIR}/src/rtext.c
    ${RAYLIB_DIR}/src/rmodels.c
    ${RAYLIB_DIR}/src/raudio.c
)

set(RAYLIB_DEFS PLATFORM_ANDROID_SURFACE ${GLES3}
    RL_DEFAULT_BATCH_BUFFER_ELEMENTS=8192)
set(RAYLIB_LIBS EGL GLESv3)

if (RAYACT_ANDROID_USE_RLVK)
    list(APPEND RAYLIB_SRC ${RLVK_DIR}/src/glad_vulkan_impl.c)
    list(APPEND RAYLIB_DEFS RAYLIB_USE_RLVK)
    list(APPEND RAYLIB_DEFS RLVK_ENABLE_GLSLANG=1)
    list(APPEND RAYLIB_LIBS vulkan)
    set(GLSLANG_TESTS OFF CACHE BOOL "" FORCE)
    set(GLSLANG_ENABLE_INSTALL OFF CACHE BOOL "" FORCE)
    set(ENABLE_GLSLANG_BINARIES OFF CACHE BOOL "" FORCE)
    set(ENABLE_OPT OFF CACHE BOOL "" FORCE)
    set(BUILD_EXTERNAL OFF CACHE BOOL "" FORCE)
    add_subdirectory(${RAYGPU_DIR}/amalgamation/glslang ${CMAKE_BINARY_DIR}/glslang EXCLUDE_FROM_ALL)
endif()

add_library(raylib STATIC ${RAYLIB_SRC})
target_compile_definitions(raylib PUBLIC ${RAYLIB_DEFS})
target_include_directories(raylib PUBLIC ${RAYLIB_DIR}/src ${RAYLIB_DIR}/src/external/glfw/include)
target_compile_options(raylib PRIVATE -Wno-unknown-pragmas)

# ---------------------------------------------------------------------------
# QuickJS
# ---------------------------------------------------------------------------
add_library(qjs STATIC
    ${QUICKJS_DIR}/dtoa.c
    ${QUICKJS_DIR}/libregexp.c
    ${QUICKJS_DIR}/libunicode.c
    ${QUICKJS_DIR}/quickjs.c
    ${QUICKJS_DIR}/quickjs-libc.c
)
target_compile_definitions(qjs PUBLIC _GNU_SOURCE)
target_include_directories(qjs PUBLIC ${QUICKJS_DIR})

# ---------------------------------------------------------------------------
# raym3 (+ Yoga). raym3's CMake reuses our `raylib` target; provide Yoga via
# YOGA_DIR (the source FetchContent already pulled for the desktop build) so no
# network is needed at configure time.
# ---------------------------------------------------------------------------
set(RAYM3_FETCH_DEPS OFF CACHE BOOL "" FORCE)
set(RAYM3_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(RAYM3_USE_YOGA ON CACHE BOOL "" FORCE)
set(RAYM3_USE_INPUT_LAYERS 0 CACHE BOOL "" FORCE)  # raw-test: v2::Render draws immediately (no deferred RenderQueue)
set(YOGA_DIR "${RAYM3_DIR}/build-v2-yoga2/_deps/yoga-src" CACHE PATH "" FORCE)
# Bake SVG icons + Roboto fonts into the .so — no filesystem access needed at runtime.
set(RAYM3_EMBED_RESOURCES ON CACHE BOOL "" FORCE)
set(RAYM3_EMBED_ALL_ICONS  ON CACHE BOOL "" FORCE)
add_subdirectory(${RAYM3_DIR} ${CMAKE_BINARY_DIR}/raym3 EXCLUDE_FROM_ALL)

if (RAYACT_ANDROID_USE_RLVK)
    target_compile_definitions(raym3 PUBLIC RAYLIB_USE_RLVK)
    target_link_libraries(raylib PUBLIC glslang glslang-default-resource-limits)
endif()

# ---------------------------------------------------------------------------
# cssparser
# ---------------------------------------------------------------------------
add_library(cssparser STATIC
    ${CSSPARSER_DIR}/CSSParser.cpp
    ${CSSPARSER_DIR}/CSSProperties.cpp
    ${CSSPARSER_DIR}/CSSUtils.cpp
    ${CSSPARSER_DIR}/CSSDeNest.cpp
)
target_include_directories(cssparser PUBLIC ${OUTER}/cssparser)

# ---------------------------------------------------------------------------
# Rayact engine (shared core, compiled with RAYACT_ANDROID so main() is excluded)
# + Android platform/system-appearance variants + JNI bridge.
# ---------------------------------------------------------------------------
set(ENGINE_SRC
    ${RAYACT}/native/core/config_loader.cpp
    ${RAYACT}/native/desktop/color_parse.cpp
    ${RAYACT}/native/desktop/theme_bridge.cpp
    ${RAYACT}/native/desktop/main.cpp
    ${RAYACT}/native/desktop/engine_js.cpp
    ${RAYACT}/native/desktop/engine_render.cpp
    ${RAYACT}/native/desktop/quickjs_bridge.cpp
    ${RAYACT}/native/desktop/raylib_bridge.cpp
    ${RAYACT}/native/desktop/raym3_bridge.cpp
    ${RAYACT}/native/desktop/css_bridge.cpp
    ${RAYACT}/native/desktop/js_stdlib.cpp
    ${RAYACT}/native/desktop/window_manager.cpp
    ${RAYACT}/native/android/platform_android.cpp
    ${RAYACT}/native/android/system_appearance_android.cpp
    ${RAYACT}/native/android/jni_bridge.cpp
)

add_library(rayact SHARED ${ENGINE_SRC})
if (RAYACT_ANDROID_USE_RLVK)
    target_sources(rayact PRIVATE ${WGVK_DIR}/src/spirv_reflect.c ${RLVK_DIR}/src/rlvk_reflect.c)
endif()
# Real QuickJS app path: app.js (React 19 + raym3 v2 retained mode) drives
# engineRenderFrame() via g_root. The C++ smoke tests are still available
# behind RAYACT_ANDROID_3D_SMOKE and RAYACT_ANDROID_DIAGNOSTIC for one-off
# validation; flip either of them back on (e.g. -DRAYACT_ANDROID_3D_SMOKE=ON)
# to re-enable. Default is OFF so the app surface is the actual product.
target_compile_definitions(rayact PRIVATE
    RAYACT_ANDROID ${GLES3}
    RL_DEFAULT_BATCH_BUFFER_ELEMENTS=8192
    $<$<BOOL:${RAYACT_ANDROID_3D_SMOKE}>:RAYACT_ANDROID_3D_SMOKE>
    $<$<NOT:$<BOOL:${RAYACT_ANDROID_FULL}>>:RAYACT_NO_NET RAYACT_NO_WORKERS RAYACT_NO_TS>
)
target_include_directories(rayact PRIVATE
    ${RAYACT}/native/desktop
    ${RAYACT}/native/core
    ${RAYLIB_DIR}/src
    ${RAYLIB_DIR}/src/platforms
    ${RAYM3_DIR}/include
)
target_link_libraries(rayact
    raylib qjs raym3 cssparser
    ${RAYLIB_LIBS} android log m
)

if (RAYACT_ANDROID_USE_RLVK)
    target_include_directories(raylib PUBLIC
        ${RAYGPU_DIR}/amalgamation/glslang/glslang/Include
        ${WGVK_DIR}/src
    )
endif()
