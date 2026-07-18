cmake_minimum_required(VERSION 3.20)
project(rayact_web VERSION 0.0.3 LANGUAGES CXX C)

# Configure with: emcmake cmake -S rayact -B build-web -DENABLE_WEB=ON
if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "apps/web requires the Emscripten toolchain (configure with emcmake)")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# CRITICAL: never build the web engine unoptimized. At -O0 the QuickJS interpreter
# (JS_CallInternal) has an enormous per-call stack frame, so a deep synchronous JS
# recursion — e.g. the React initial-render reconcile over the navigation/theme tree —
# blows V8's NATIVE wasm call-stack (which emscripten STACK_SIZE / JS_SetMaxStackSize
# do NOT control) and the app renders blank on cold loads (only after a refresh, when
# there's slightly more headroom). -O2/-O3 shrinks the frame enough that the same
# recursion fits with wide margin. If no build type was requested, default to Release.
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
    message(STATUS "rayact-web: defaulting CMAKE_BUILD_TYPE=Release (-O0 overflows V8's wasm call stack on deep React mount)")
endif()

# Pthreads (Phase 3: universal workers). -pthread switches WASM linear memory to a
# SharedArrayBuffer and must be applied to EVERY translation unit (qjs/raylib/raym3/
# yoga + the exe), or emscripten errors on a shared/non-shared memory mismatch. Set
# directory-wide BEFORE any target/add_subdirectory so all inherit. Requires the page
# be cross-origin isolated (COOP/COEP) at runtime for SharedArrayBuffer.
#
# NOTE: blocking the main thread with synchronous XHR (the module-HMR dev loader's
# __rayactDevFetch) can deadlock under -pthread. So pthreads is OPT-IN: enable it for
# the worker-capable production build; leave it OFF for the dev/module-HMR build.
option(RAYACT_WEB_PTHREADS "Enable Emscripten pthreads (workers); incompatible with sync-XHR dev loader" OFF)
option(RAYACT_RELEASE_HOST "Build an app-only Web host without development bootstrap/HMR" OFF)
if(RAYACT_WEB_PTHREADS)
    add_compile_options(-pthread)
    add_link_options(-pthread -sPTHREAD_POOL_SIZE=4)
endif()

# Repo layout: this file lives in <repo>/apps/web.
get_filename_component(RAYACT_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
set(THIRD_PARTY "${RAYACT_ROOT}/third_party")
set(DESKTOP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../native/desktop")
set(CORE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../native/core")
set(WEB_NATIVE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../native/web")

# ---------------------------------------------------------------------------
# QuickJS (quickjs-ng) — compiled from source under emcc (no prebuilt arch lib).
# ---------------------------------------------------------------------------
set(QUICKJS_DIR "${THIRD_PARTY}/quickjs")
if(NOT EXISTS "${QUICKJS_DIR}/quickjs.c")
    message(FATAL_ERROR "QuickJS sources not found at ${QUICKJS_DIR}")
endif()
# quickjs-ng folds cutils into quickjs.c; quickjs-libc.c needs QJS_BUILD_LIBC.
add_library(qjs_web STATIC
    ${QUICKJS_DIR}/quickjs.c
    ${QUICKJS_DIR}/libregexp.c
    ${QUICKJS_DIR}/libunicode.c
    ${QUICKJS_DIR}/dtoa.c
    ${QUICKJS_DIR}/quickjs-libc.c
)
target_include_directories(qjs_web PUBLIC ${QUICKJS_DIR})
target_compile_definitions(qjs_web PUBLIC QUICKJS_NG_BUILD QJS_BUILD_LIBC PRIVATE _GNU_SOURCE)
target_compile_options(qjs_web PRIVATE -Wno-unknown-pragmas -Wno-implicit-fallthrough)

# ---------------------------------------------------------------------------
# wasm3 — embedded interpreter core (Phase 3 Path A: run user .wasm workers
# inside the WASM engine). Same core source set as the desktop build.
# ---------------------------------------------------------------------------
set(WASM3_DIR "${THIRD_PARTY}/wasm3")
add_library(m3 STATIC
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
target_include_directories(m3 PUBLIC "${WASM3_DIR}/source")
target_compile_features(m3 PRIVATE c_std_99)
target_compile_options(m3 PRIVATE -Wno-unused-function -Wno-unused-variable -Wno-unused-parameter -Wno-sign-compare)

# ---------------------------------------------------------------------------
# raylib with the rlwg WebGPU backend (rcore overlay + backend attach).
# ---------------------------------------------------------------------------
set(RAYLIB_DIR "${THIRD_PARTY}/raylib")
set(RAYLIB_BACKENDS_DIR "${THIRD_PARTY}/raylib-backends")
include("${RAYLIB_BACKENDS_DIR}/cmake/RaylibBackend.cmake")

raylib_backend_prepare_rcore_overlay(
    OUT_VAR RAYLIB_RCORE_SRC
    RAYLIB_DIR "${RAYLIB_DIR}"
    RAYLIB_BACKENDS_DIR "${RAYLIB_BACKENDS_DIR}"
)
add_library(raylib STATIC
    ${RAYLIB_RCORE_SRC}
    ${RAYLIB_DIR}/src/rshapes.c
    ${RAYLIB_DIR}/src/rtextures.c
    ${RAYLIB_DIR}/src/rtext.c
    ${RAYLIB_DIR}/src/rmodels.c
    ${RAYLIB_DIR}/src/raudio.c
)
target_include_directories(raylib PUBLIC ${RAYLIB_DIR}/src ${RAYLIB_DIR}/src/platforms)
target_compile_options(raylib PRIVATE -Wno-unknown-pragmas)
raylib_backend_attach(TARGET raylib BACKEND WEBGPU RAYLIB_BACKENDS_DIR ${RAYLIB_BACKENDS_DIR})
get_target_property(_rayact_raylib_link_options raylib INTERFACE_LINK_OPTIONS)
if(_rayact_raylib_link_options)
    set(RAYACT_WEB_STACK_SIZE "256MB" CACHE STRING "Emscripten stack size for the Rayact web host")
    list(TRANSFORM _rayact_raylib_link_options REPLACE "^-sSTACK_SIZE=16MB$" "-sSTACK_SIZE=${RAYACT_WEB_STACK_SIZE}")
    set_property(TARGET raylib PROPERTY INTERFACE_LINK_OPTIONS ${_rayact_raylib_link_options})
endif()

# ---------------------------------------------------------------------------
# raym3 (+ Yoga from source) — built for the WebGPU backend (skip the ES3 default).
# ---------------------------------------------------------------------------
set(RAYM3_DIR "${THIRD_PARTY}/raym3")
set(YOGA_DIR "${THIRD_PARTY}/yoga" CACHE PATH "" FORCE)
set(RAYM3_FETCH_DEPS OFF CACHE BOOL "" FORCE)
set(RAYM3_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(RAYM3_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(RAYM3_USE_YOGA ON CACHE BOOL "" FORCE)
set(RAYM3_USE_INPUT_LAYERS 0 CACHE BOOL "" FORCE)
set(RAYM3_WEBGPU ON CACHE BOOL "" FORCE)
# Embed the icon SVGs the app uses (raym3's default core-icons.txt is a tiny subset, so
# the app's icons render as placeholders). RAYM3_EMBED_RESOURCES defaults ON for web.
set(RAYM3_ICON_MANIFEST "${CMAKE_CURRENT_SOURCE_DIR}/web-icons.txt" CACHE FILEPATH "" FORCE)
add_subdirectory("${RAYM3_DIR}" "${CMAKE_BINARY_DIR}/raym3" EXCLUDE_FROM_ALL)
target_include_directories(raym3 BEFORE PRIVATE "${RAYLIB_BACKENDS_DIR}/backends/rlwg")

# ---------------------------------------------------------------------------
# cssparser (CSS @import support)
# ---------------------------------------------------------------------------
set(CSSPARSER_DIR "${THIRD_PARTY}/cssparser/cssparser")
set(CSSPARSER_SOURCES
    ${CSSPARSER_DIR}/CSSParser.cpp
    ${CSSPARSER_DIR}/CSSProperties.cpp
    ${CSSPARSER_DIR}/CSSUtils.cpp
    ${CSSPARSER_DIR}/CSSDeNest.cpp
)

# ---------------------------------------------------------------------------
# Engine sources. Browser fetch and WebSocket are supplied by the web platform
# bridge; main_web.cpp drives the rAF loop.
# ---------------------------------------------------------------------------
set(ENGINE_SOURCES
    ${DESKTOP_DIR}/../shared/rayactpack.cpp
    ${DESKTOP_DIR}/color_parse.cpp
    ${DESKTOP_DIR}/theme_bridge.cpp
    ${DESKTOP_DIR}/system_appearance.cpp
    ${DESKTOP_DIR}/engine_js.cpp
    ${DESKTOP_DIR}/engine_render.cpp
    ${DESKTOP_DIR}/commit_queue.cpp
    ${DESKTOP_DIR}/shadow_tree.cpp
    ${DESKTOP_DIR}/engine_thread.cpp
    ${DESKTOP_DIR}/worklet_runtime.cpp
    ${DESKTOP_DIR}/gesture_recognizer.cpp
    ${DESKTOP_DIR}/async_storage.cpp
    ${DESKTOP_DIR}/kv_store.cpp
    ${DESKTOP_DIR}/data_dir.cpp
    ${DESKTOP_DIR}/module_bus.cpp
    ${DESKTOP_DIR}/accessibility_bridge.cpp
    ${DESKTOP_DIR}/quickjs_bridge.cpp
    ${DESKTOP_DIR}/raylib_bridge.cpp
    ${DESKTOP_DIR}/raym3_bridge.cpp
    ${DESKTOP_DIR}/css_bridge.cpp
    ${DESKTOP_DIR}/js_stdlib.cpp
    ${DESKTOP_DIR}/platform.cpp
    ${DESKTOP_DIR}/window_manager.cpp
    ${CORE_DIR}/config_loader.cpp
    # Phase 3 Path A workers: WASM (wasm3) + native; JS workers omitted on web.
    ${DESKTOP_DIR}/worker_wasm.cpp
    ${DESKTOP_DIR}/worker_draw.cpp
    ${DESKTOP_DIR}/worker_native.cpp
    ${DESKTOP_DIR}/workers.cpp
    ${CSSPARSER_SOURCES}
    ${WEB_NATIVE_DIR}/main_web.cpp
    ${WEB_NATIVE_DIR}/web_text_input.cpp
    ${WEB_NATIVE_DIR}/web_stubs.cpp
    ${WEB_NATIVE_DIR}/web_websocket.cpp
    ${WEB_NATIVE_DIR}/web_js_worker.cpp
)

# App-provided C++ native workers (Phase 3.5), same glob as the desktop build. Each
# registers via RAYACT_REGISTER_NATIVE_WORKER and runs on a pthread Web Worker.
file(GLOB_RECURSE RAYACT_APP_NATIVE_WORKERS
    "${RAYACT_ROOT}/native/workers/*/*.cpp"
    "${RAYACT_ROOT}/apps/*/native/workers/*/*.cpp"
)
if(RAYACT_APP_NATIVE_WORKERS)
    list(APPEND ENGINE_SOURCES ${RAYACT_APP_NATIVE_WORKERS})
    message(STATUS "Rayact web native workers: ${RAYACT_APP_NATIVE_WORKERS}")
endif()

add_executable(rayact ${ENGINE_SOURCES})
set(RAYACT_WEB_QJS_STACK_SIZE_BYTES "234881024" CACHE STRING "QuickJS stack guard for the Rayact web host, in bytes")
target_compile_definitions(rayact PRIVATE
    RAYACT_WEB=1
    RAYACT_PLATFORM_NET_BACKEND=1
    RAYACT_NO_TS=1
    RAYACT_RELEASE_HOST=$<BOOL:${RAYACT_RELEASE_HOST}>
    RAYACT_WEB_QJS_STACK_SIZE_BYTES=${RAYACT_WEB_QJS_STACK_SIZE_BYTES}
)
target_include_directories(rayact PRIVATE
    ${DESKTOP_DIR}
    ${CORE_DIR}
    ${QUICKJS_DIR}
    ${RAYM3_DIR}/include
    ${YOGA_DIR}
    ${THIRD_PARTY}/cssparser
    ${WASM3_DIR}/source
)
target_link_libraries(rayact PRIVATE
    qjs_web
    raylib
    raym3
    m3
)

# Output rayact.html/.js/.wasm. No -sASYNCIFY (host uses async device acquisition);
# emdawnwebgpu + memory-growth + stack come from the WEBGPU backend attach.
# A production `rayact build --web` embeds the app bundle into the VFS by appending
# `--embed-file <app.qjsbc>@/app.qjsbc` (or @/app.js) to these flags; the engine then
# loads it at boot (see loadBundledApp in main_web.cpp).
set(RAYACT_WEB_EMBED_APP "" CACHE FILEPATH "Optional single JS/qjsbc app bundle embedded at /app.js (loadBundledApp loads it at boot)")
set(_rayact_embed "")
if(RAYACT_WEB_EMBED_APP)
    set(_rayact_embed " --embed-file ${RAYACT_WEB_EMBED_APP}@/app.js")
    get_filename_component(_rayact_app_dir "${RAYACT_WEB_EMBED_APP}" DIRECTORY)
    set(_rayact_app_css_dir "${_rayact_app_dir}/css")
    if(EXISTS "${_rayact_app_css_dir}")
        set(_rayact_embed "${_rayact_embed} --embed-file ${_rayact_app_css_dir}@/css")
        file(GLOB_RECURSE _rayact_app_css_files CONFIGURE_DEPENDS "${_rayact_app_css_dir}/*")
    endif()
endif()

# Embed the Material icon name->codepoint map at a path injectMaterialIcons() searches
# (cwd is "/" on web). Without it, icon names don't resolve and render as placeholder
# glyphs ("material_icons.js not found").
option(RAYACT_WEB_EMBED_ICONS "Embed Material icon and emoji font resources" ON)
set(_rayact_icons "${RAYACT_ROOT}/dist/shared/material_icons.js")
if(NOT EXISTS "${_rayact_icons}")
    set(_rayact_icons "${RAYACT_ROOT}/packages/rayact-shared/src/material_icons.js")
endif()
set(_rayact_iconfont "${RAYACT_ROOT}/resources/fonts/MaterialSymbolsRounded.ttf")
set(_rayact_iconfont_filled "${RAYACT_ROOT}/resources/fonts/MaterialSymbolsRounded-Filled.ttf")
set(_rayact_emoji_font "${RAYACT_ROOT}/resources/fonts/NotoColorEmoji.ttf")
if(RAYACT_WEB_EMBED_ICONS AND EXISTS "${_rayact_icons}")
    # name->codepoint map (injectMaterialIcons sets globalThis.Icons from this)...
    set(_rayact_embed "${_rayact_embed} --embed-file ${_rayact_icons}@/resources/fonts/material_icons.js")
    # ...and the full icon fonts. The web host is a generic release artifact, so
    # subsetting to this repo's demo icons breaks consumer apps whose icons are not
    # known when the host is built.
    if(EXISTS "${_rayact_iconfont}")
        set(_rayact_embed "${_rayact_embed} --embed-file ${_rayact_iconfont}@/resources/fonts/MaterialSymbolsRounded.ttf")
    endif()
    if(EXISTS "${_rayact_iconfont_filled}")
        set(_rayact_embed "${_rayact_embed} --embed-file ${_rayact_iconfont_filled}@/resources/fonts/MaterialSymbolsRounded-Filled.ttf")
    endif()
    if(EXISTS "${_rayact_emoji_font}")
        set(_rayact_embed "${_rayact_embed} --embed-file ${_rayact_emoji_font}@/resources/fonts/NotoColorEmoji.ttf")
    endif()
endif()
option(RAYACT_WEB_DEBUG "Build with function names + stack-overflow assertions for diagnosis" OFF)
set(_rayact_dbg "")
if(RAYACT_WEB_DEBUG)
    set(_rayact_dbg " --profiling-funcs -sASSERTIONS=2 -sSTACK_OVERFLOW_CHECK=2")
endif()
set(_rayact_exports " -sEXPORTED_FUNCTIONS=['_main','_rayactWebStart','_rayactWebFinishBoot','_rayactWebPointer','_rayactWebKey','_rayactWebImeUpdate','_rayactWebImeSubmit','_rayactWebJsWorkerMessage','_rayactWebJsWorkerClosed','_malloc','_free']")
# The rlwg backend propagates a 16 MB stack, which is enough for simple demos but
# the full smoke app (React navigation + large Material tree) can exhaust it while
# QuickJS evaluates and mounts the bundle. Keep this above the web QuickJS guard in
# engine_js.cpp so QuickJS reports a catchable overflow before the wasm stack blows.
set_target_properties(rayact PROPERTIES
    SUFFIX ".html"
    LINK_FLAGS "--shell-file ${CMAKE_CURRENT_SOURCE_DIR}/shell.html -sALLOW_MEMORY_GROWTH=1 -lidbfs.js${_rayact_embed}${_rayact_exports}${_rayact_dbg}")

if(RAYACT_RELEASE_HOST)
    set_target_properties(rayact PROPERTIES OUTPUT_NAME "rayact_release")
    find_program(NODE_EXECUTABLE node REQUIRED)
    add_custom_command(TARGET rayact POST_BUILD
        COMMAND "${NODE_EXECUTABLE}"
                "${CMAKE_CURRENT_SOURCE_DIR}/../../scripts/sanitize-release-web-host.mjs"
                "$<TARGET_FILE:rayact>"
        COMMENT "Removing development bootstrap from release Web shell"
        VERBATIM)
endif()

set_property(TARGET rayact APPEND PROPERTY LINK_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/shell.html")

if(RAYACT_WEB_EMBED_APP)
    set_property(TARGET rayact APPEND PROPERTY LINK_DEPENDS "${RAYACT_WEB_EMBED_APP}")
    if(_rayact_app_css_files)
        set_property(TARGET rayact APPEND PROPERTY LINK_DEPENDS ${_rayact_app_css_files})
    endif()
endif()

message(STATUS "rayact web target configured (QuickJS+raym3+rlwg, release-host=${RAYACT_RELEASE_HOST}, no ASYNCIFY)")
