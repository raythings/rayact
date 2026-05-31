cmake_minimum_required(VERSION 3.20)
project(rayact_test VERSION 0.1.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# QuickJS setup
set(QUICKJS_DIR "${CMAKE_SOURCE_DIR}/../quickjs")
include_directories(${QUICKJS_DIR})

# Raylib setup
set(RAYLIB_DIR "${CMAKE_SOURCE_DIR}/../raylib")
include_directories(${RAYLIB_DIR})

# Source files
set(SOURCES
    main.cpp
    test.cpp
)

add_executable(rayact_test ${SOURCES})

target_link_libraries(rayact_test
    ${QUICKJS_LIBRARIES}
    ${RAYLIB_LIBRARIES}
)

# Platform specific
if(UNIX AND NOT APPLE)
    target_link_libraries(rayact_test X11 GL)
endif()

message(STATUS "Built rayact_test executable")
