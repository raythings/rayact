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
set(RAYLIB_BACKENDS_DIR "${OUTER}/raylib-backends")
set(QUICKJS_DIR "${OUTER}/quickjs")
set(RAYM3_DIR   "${OUTER}/raym3")
set(CSSPARSER_DIR "${OUTER}/cssparser/cssparser")
set(RAYGPU_DIR   "${OUTER}/raygpu")

# Feature scope for the first device bring-up. Networking (curl/lws/openssl),
# workers (wasm3/native), and the TS validator (tree-sitter) are deferred — the
# engine call sites are guarded by RAYACT_NO_NET/NO_WORKERS/NO_TS.
option(RAYACT_ANDROID_FULL "Build net + workers + TS subsystems" OFF)
# WASM/worker subsystem without networking or the TS validator. Lets WASM and JS
# workers (and the module bus's sys_invoke) run on Android while keeping curl/lws
# and tree-sitter out of the build. Implied by RAYACT_ANDROID_FULL.
option(RAYACT_ANDROID_WASM "Build the worker subsystem (wasm3 + workers) on Android" OFF)
option(RAYACT_ANDROID_USE_RLVK "Build Android with the Vulkan-backed rlvk rlgl implementation" ON)
# 3D smoke-test scene is opt-in. Pass -DRAYACT_ANDROID_3D_SMOKE=ON at configure
# time to re-enable the in-process probe (FBO + grid + cube + lines). Default
# is OFF so the engine renders the real QuickJS app.js path.
option(RAYACT_ANDROID_3D_SMOKE "Render the temporary 3D smoke test scene on Android" OFF)

# Don't build/run dependency unit tests (yoga's gtest_discover_tests would try
# to execute arm64 test binaries on the build host).
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)

include(${RAYLIB_BACKENDS_DIR}/cmake/RaylibBackend.cmake)

# ---------------------------------------------------------------------------
# raylib plus backend-owned PLATFORM_ANDROID_SURFACE overlay.
# ---------------------------------------------------------------------------
raylib_backend_prepare_android_surface_overlay(
    OUT_VAR RAYLIB_RCORE_SRC
    RAYLIB_DIR "${RAYLIB_DIR}"
    RAYLIB_BACKENDS_DIR "${RAYLIB_BACKENDS_DIR}"
)

set(RAYLIB_SRC
    ${RAYLIB_RCORE_SRC}
    ${RAYLIB_DIR}/src/rshapes.c
    ${RAYLIB_DIR}/src/rtextures.c
    ${RAYLIB_DIR}/src/rtext.c
    ${RAYLIB_DIR}/src/rmodels.c
    ${RAYLIB_DIR}/src/raudio.c
)

set(RAYLIB_DEFS PLATFORM_ANDROID_SURFACE
    RL_DEFAULT_BATCH_BUFFER_ELEMENTS=8192)
if (NOT RAYACT_ANDROID_USE_RLVK)
    list(APPEND RAYLIB_DEFS GRAPHICS_API_OPENGL_ES3)
endif()
set(RAYLIB_LIBS EGL GLESv3)

if (RAYACT_ANDROID_USE_RLVK)
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
if (RAYACT_ANDROID_USE_RLVK)
    raylib_backend_attach(TARGET raylib BACKEND VULKAN RAYLIB_BACKENDS_DIR ${RAYLIB_BACKENDS_DIR})
endif()

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
    ${RAYACT}/native/desktop/commit_queue.cpp
    ${RAYACT}/native/desktop/shadow_tree.cpp
    ${RAYACT}/native/desktop/engine_thread.cpp
    ${RAYACT}/native/desktop/engine_js.cpp
    ${RAYACT}/native/desktop/engine_render.cpp
    ${RAYACT}/native/desktop/worklet_runtime.cpp
    ${RAYACT}/native/desktop/gesture_recognizer.cpp
    ${RAYACT}/native/desktop/async_storage.cpp
    ${RAYACT}/native/desktop/kv_store.cpp
    ${RAYACT}/native/desktop/data_dir.cpp
    ${RAYACT}/native/desktop/module_bus.cpp
    ${RAYACT}/native/desktop/plugin_loader.cpp
    ${RAYACT}/native/desktop/devtools.cpp
    ${RAYACT}/native/desktop/cdp_handler.cpp
    ${RAYACT}/native/desktop/dev_client_bridge.cpp
    ${RAYACT}/native/desktop/accessibility_bridge.cpp
    ${RAYACT}/native/desktop/platform_wayland.cpp
    ${RAYACT}/native/desktop/quickjs_bridge.cpp
    ${RAYACT}/native/desktop/raylib_bridge.cpp
    ${RAYACT}/native/desktop/raym3_bridge.cpp
    ${RAYACT}/native/desktop/css_bridge.cpp
    ${RAYACT}/native/desktop/js_stdlib.cpp
    ${RAYACT}/native/desktop/window_manager.cpp
    ${RAYACT}/native/android/platform_android.cpp
    ${RAYACT}/native/android/system_appearance_android.cpp
    ${RAYACT}/native/android/engine_runtime.cpp
    ${RAYACT}/native/android/android_engine_instance.cpp
    ${RAYACT}/native/android/jni_bridge.cpp
)

# Worker subsystem (WASM + JS + native workers). Compiled when FULL or WASM is
# on. worker_js's net/TS use is guarded by RAYACT_NO_NET/NO_TS, so this links
# without curl/lws/tree-sitter when only RAYACT_ANDROID_WASM is set.
if(RAYACT_ANDROID_FULL OR RAYACT_ANDROID_WASM)
    set(WASM3_DIR "${OUTER}/wasm3")
    add_library(m3 STATIC
        ${WASM3_DIR}/source/m3_bind.c   ${WASM3_DIR}/source/m3_code.c
        ${WASM3_DIR}/source/m3_compile.c ${WASM3_DIR}/source/m3_core.c
        ${WASM3_DIR}/source/m3_env.c     ${WASM3_DIR}/source/m3_exec.c
        ${WASM3_DIR}/source/m3_function.c ${WASM3_DIR}/source/m3_info.c
        ${WASM3_DIR}/source/m3_module.c  ${WASM3_DIR}/source/m3_parse.c)
    target_include_directories(m3 PUBLIC ${WASM3_DIR}/source)
    target_compile_options(m3 PRIVATE
        -Wno-unused-function -Wno-unused-variable -Wno-unused-parameter -Wno-sign-compare)
    list(APPEND ENGINE_SRC
        ${RAYACT}/native/desktop/workers.cpp
        ${RAYACT}/native/desktop/worker_js.cpp
        ${RAYACT}/native/desktop/worker_wasm.cpp
        ${RAYACT}/native/desktop/worker_native.cpp)
endif()

add_library(rayact SHARED ${ENGINE_SRC})
if(RAYACT_ANDROID_FULL OR RAYACT_ANDROID_WASM)
    target_link_libraries(rayact m3)
    target_include_directories(rayact PRIVATE ${OUTER}/wasm3/source)
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
)
# Per-subsystem gating (independent so workers can build without net/TS):
#   NET/TS  → only with FULL
#   WORKERS → with FULL or WASM
if(NOT RAYACT_ANDROID_FULL)
    target_compile_definitions(rayact PRIVATE RAYACT_NO_NET RAYACT_NO_TS)
endif()
if(NOT (RAYACT_ANDROID_FULL OR RAYACT_ANDROID_WASM))
    target_compile_definitions(rayact PRIVATE RAYACT_NO_WORKERS)
endif()
target_include_directories(rayact PRIVATE
    ${RAYACT}/native/desktop
    ${RAYACT}/native/core
    ${RAYACT}/native/android
    ${RAYLIB_DIR}/src
    ${RAYLIB_DIR}/src/platforms
    ${RAYM3_DIR}/include
    ${YOGA_DIR}
)
target_link_libraries(rayact
    raylib qjs raym3 cssparser
    ${RAYLIB_LIBS} android log m dl
)

if (RAYACT_ANDROID_USE_RLVK)
    target_include_directories(raylib PUBLIC
        ${RAYGPU_DIR}/amalgamation/glslang/glslang/Include
        ${RAYLIB_BACKENDS_DIR}/third_party/spirv_reflect
        ${RAYLIB_BACKENDS_DIR}/backends/rlvk
    )
endif()

# ---------------------------------------------------------------------------
# Bundled native plugins (Expo-Go-style prebuilt dev app). Built as standalone
# shared libs so the NDK packages them into the APK jniLibs; at runtime the
# module bus's plugin loader dlopen's them from the app's nativeLibraryDir
# (loadPlugins(libDir) in jni_bridge.cpp) — adding a module needs no rebuild of
# the engine, only a relink of the plugin. Each depends only on the stable ABI
# header in native/core.
# ---------------------------------------------------------------------------
add_library(rayact_mmkv SHARED ${RAYACT}/native/plugins/mmkv/mmkv_plugin.cpp)
target_include_directories(rayact_mmkv PRIVATE ${RAYACT}/native/core)
target_link_libraries(rayact_mmkv log)

add_library(rayact_secure_store SHARED
    ${RAYACT}/native/plugins/secure-store/secure_store_plugin.cpp)
target_include_directories(rayact_secure_store PRIVATE ${RAYACT}/native/core)
target_link_libraries(rayact_secure_store log)
