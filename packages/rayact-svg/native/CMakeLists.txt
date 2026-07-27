cmake_minimum_required(VERSION 3.16)
project(rayact_svg CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Repo root, so the plugin can reach the shared ABI header and the raysvg submodule.
# npm consumers never build this — they get the prebuilt artifacts in the package.
get_filename_component(RAYACT_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../.." ABSOLUTE)
set(RAYSVG_DIR "${RAYACT_ROOT}/third_party/raysvg")

set(RAYSVG_SOURCES
    ${RAYSVG_DIR}/src/raysvg.cpp
    ${RAYSVG_DIR}/src/rsvg_xml.cpp
    ${RAYSVG_DIR}/src/rsvg_parse.cpp
    ${RAYSVG_DIR}/src/rsvg_path.cpp
    ${RAYSVG_DIR}/src/rsvg_paint.cpp
    ${RAYSVG_DIR}/src/rsvg_transform.cpp
    ${RAYSVG_DIR}/src/rsvg_flatten.cpp
    ${RAYSVG_DIR}/src/rsvg_tess_fill.cpp
    ${RAYSVG_DIR}/src/rsvg_stroke.cpp
    ${RAYSVG_DIR}/src/rsvg_clip.cpp
    ${RAYSVG_DIR}/src/rsvg_render.cpp
)

add_library(rayact_svg SHARED
    svg_plugin.cpp
    raylib_gpu_shim.cpp
    ${RAYSVG_SOURCES}
)
set_target_properties(rayact_svg PROPERTIES OUTPUT_NAME rayact_svg PREFIX "lib")

# Standalone dynamic artifact: raysvg's rl* calls bind to the shim, which forwards to
# the host's GPU table. Static-linked hosts (iOS, web) compile these same sources
# with the shim off and resolve rl* against the host's own raylib at link time.
target_compile_definitions(rayact_svg PRIVATE RAYACT_SVG_USE_GPU_SHIM=1)

target_include_directories(rayact_svg PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${RAYACT_ROOT}/native/core
    ${RAYSVG_DIR}/include
    ${RAYSVG_DIR}/src
    ${RAYSVG_DIR}/third_party/earcut
    # raylib headers only — the plugin never links raylib.
    ${RAYACT_ROOT}/third_party/raylib/src
)

if(ANDROID)
    target_link_libraries(rayact_svg log)
endif()
